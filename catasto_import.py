"""
Planimetrie catastali (PDF dell'Agenzia delle Entrate / del Territorio): ogni pagina è la scansione di un foglio A4
(un subalterno) con sopra il testo riconosciuto (OCR). Il formato è sempre lo stesso: intestazione, «Scala 1:200»,
uno o più disegni con sotto «Piano terra», «Piano primo»…, il nord e la barra dei 10 m.

Da un PDF esce un progetto con tutti i piani:
1. per ogni pagina: l'immagine, il testo con la sua posizione e la scala;
2. i disegni del foglio (macchie d'inchiostro lontane da intestazione e cornice) con il loro «Piano …»;
3. per ogni disegno: foglio raddrizzato, tratti orizzontali e verticali (muri, finestre) e archi (porte) con
   OpenCV, rifatti in un DXF in metri;
4. la stessa importazione dei DXF di studio (dxf_import.py) ricostruisce locali, porte e finestre; i locali senza
   nome (il catasto quasi non li scrive) prendono un tipo dalla superficie, poi si correggono dall'app.
"""
import io
import math
import re
from typing import List, Optional, Tuple

import ezdxf

try:
    import cv2
    import numpy as np
except ImportError:  # pragma: no cover - motore senza OpenCV: niente riconoscimento delle scansioni
    cv2 = None

try:
    from pdfminer.high_level import extract_pages
    from pdfminer.layout import LTFigure, LTImage, LTTextLine
except ImportError:  # pragma: no cover
    extract_pages = None

PT = 0.0254 / 72
LEVELS = [   # «Piano …» → livello del progetto
    (r"interrat|seminterr|sotto ?strada|cantin|\bs\s*-?\s*1\b|\bs1\b", -1),
    (r"\bterra\b|\bterreno\b|rialzat|\bpt\b|\bt\b", 0),
    (r"\bprimo\b|\bp\s*1\b|\b1\s*°|\b1\b", 1),
    (r"\bsecondo\b|\bp\s*2\b|\b2\s*°|\b2\b", 2),
    (r"\bterzo\b|\bp\s*3\b|\b3\s*°|\b3\b", 3),
    (r"sottotett|mansard|soffitt", 3),
]


class NotCatasto(Exception):
    """Il PDF non è una planimetria catastale scansionata."""


# ----------------------------------------------------------------------------
# 1. pagine: immagine, testo, scala
# ----------------------------------------------------------------------------
def _decode(img: "LTImage"):
    """Immagine della pagina in scala di grigi (numpy), o None se il formato non è leggibile."""
    raw = img.stream.get_rawdata()
    filt = img.stream.get_filters()
    names = [f[0] if isinstance(f, tuple) else f for f in filt]
    names = [getattr(n, "name", str(n)).lstrip("/") for n in names]
    if any(n in ("DCTDecode", "DCT", "JPXDecode") for n in names):
        arr = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_GRAYSCALE)
        return arr
    try:
        data = img.stream.get_data()
    except Exception:  # noqa: BLE001 - CCITT e altri filtri non gestiti da pdfminer
        return None
    w, h = img.srcsize
    bits = img.bits or 8
    if bits == 1:
        a = np.unpackbits(np.frombuffer(data, np.uint8))
        row = (w + 7) // 8 * 8
        if a.size < row * h:
            return None
        a = a[:row * h].reshape(h, row)[:, :w]
        return np.where(a > 0, 255, 0).astype(np.uint8)
    n = len(data) // (w * h) if w and h else 0
    if n not in (1, 3, 4):
        return None
    a = np.frombuffer(data, np.uint8)[:w * h * n].reshape(h, w, n)
    return a[:, :, 0] if n == 1 else cv2.cvtColor(a[:, :, :3], cv2.COLOR_RGB2GRAY)


def _collect(items, images, texts):
    for it in items:
        if isinstance(it, LTImage):
            images.append(it)
        elif isinstance(it, LTTextLine):
            t = it.get_text().strip()
            if t:
                texts.append((it.x0, it.y0, it.x1, it.y1, t))
        elif isinstance(it, LTFigure) or (hasattr(it, "__iter__") and not isinstance(it, LTTextLine)):
            _collect(it, images, texts)


def read_pages(data: bytes):
    """[{img, texts (in pixel: x0, y0, x1, y1, testo), mpp (metri reali per pixel), scale}] per ogni pagina."""
    if cv2 is None or extract_pages is None:
        raise RuntimeError("riconoscimento delle scansioni non disponibile su questo motore (servono OpenCV e pdfminer.six)")
    pages = []
    for page in extract_pages(io.BytesIO(data), maxpages=30):
        images, texts = [], []
        _collect(page, images, texts)
        if not images:
            continue
        im = max(images, key=lambda i: (i.x1 - i.x0) * (i.y1 - i.y0))
        arr = _decode(im)
        if arr is None:
            continue
        if np.mean(arr < 128) > 0.5:     # immagine in negativo (alcuni PDF la salvano invertita): il foglio è chiaro
            arr = 255 - arr
        h, w = arr.shape
        sx, sy = w / (im.x1 - im.x0), h / (im.y1 - im.y0)
        tx = [((x0 - im.x0) * sx, (im.y1 - y1) * sy, (x1 - im.x0) * sx, (im.y1 - y0) * sy, t)
              for x0, y0, x1, y1, t in texts]
        joined = " ".join(t for *_, t in texts)
        m = re.search(r"scala\s*1\s*[:/]\s*(\d{2,4})", joined, re.I) or \
            re.search(r"(?<![\d.,])1\s*[:/]\s*(\d{2,4})(?![\d.,])", joined)
        scale = int(m.group(1)) if m else 200
        pages.append({"img": arr, "texts": tx, "scale": scale, "mpp": PT / sx * scale, "joined": joined})
    return pages


def is_catasto(pages) -> bool:
    joined = " ".join(p["joined"] for p in pages).lower()
    return bool(pages) and ("catasto" in joined or "planimetria di u.i.u" in joined or "u.i.u" in joined)


# ----------------------------------------------------------------------------
# 2. disegni del foglio e i loro piani
# ----------------------------------------------------------------------------
def floor_level(name: str) -> Optional[int]:
    s = name.lower()
    for pat, lvl in LEVELS:
        if re.search(pat, s):
            return lvl
    return None


def _labels(texts):
    """Scritte «Piano …» sotto i disegni (non quelle nelle righe lunghe di intestazione e piè di pagina)."""
    out = []
    for x0, y0, x1, y1, t in texts:
        m = re.match(r"^\s*piano\s+([\w°\-]+(?:\s+[\w°]+)?)\s*$", t, re.I)
        if m and len(t) <= 30:
            out.append(((x0 + x1) / 2, (y0 + y1) / 2, "Piano " + m.group(1).strip().lower()))
    return out


def _ink(img):
    _, b = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return b


def drawings(page):
    """Riquadri (x0, y0, x1, y1 in pixel) dei disegni del foglio con il loro nome di piano."""
    img, mpp = page["img"], page["mpp"]
    ink = _ink(img)
    h, w = ink.shape
    px = lambda m: max(1, int(round(m / mpp)))  # noqa: E731
    # via cornice e linee lunghe del foglio (oltre 60% del lato), testi riconosciuti e loro dintorni
    long_h = cv2.morphologyEx(ink, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (int(w * 0.45), 1)))
    long_v = cv2.morphologyEx(ink, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, int(h * 0.3))))
    work = cv2.subtract(ink, cv2.dilate(cv2.bitwise_or(long_h, long_v), np.ones((5, 5), np.uint8)))
    for x0, y0, x1, y1, t in page["texts"]:
        work[max(0, int(y0) - 3):int(y1) + 3, max(0, int(x0) - 3):int(x1) + 3] = 0
    # niente intestazione (sopra la riga «Scheda … Scala») e niente piè di pagina («Ultima planimetria», «Data:»)
    top = max([y1 for x0, y0, x1, y1, t in page["texts"] if re.search(r"scheda|subalterno|scala", t, re.I)] or [0])
    bottom = min([y0 for x0, y0, x1, y1, t in page["texts"]
                  if re.search(r"ultima planimetria|totale schede", t, re.I) and y0 > h * 0.5] or [h])
    work[:int(top) + 10] = 0
    work[int(bottom) - 10:] = 0
    blobs = cv2.dilate(work, cv2.getStructuringElement(cv2.MORPH_RECT, (px(1.2), px(1.2))))
    n, _, stats, _ = cv2.connectedComponentsWithStats(blobs)
    found = []
    for i in range(1, n):
        x, y, bw, bh, _ = stats[i]
        if bw * mpp < 2.5 or bh * mpp < 2.5:
            continue
        crop = work[y:y + bh, x:x + bw]
        # un disegno di pianta ha tratti dritti lunghi in tutte e due le direzioni (non il nord, non la barra dei 10 m)
        hl = cv2.morphologyEx(crop, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (px(1.0), 1)))
        vl = cv2.morphologyEx(crop, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, px(1.0))))
        if cv2.countNonZero(hl) < px(3) or cv2.countNonZero(vl) < px(3):
            continue
        found.append([x, y, x + bw, y + bh])
    labels = _labels(page["texts"])
    out = []
    for x0, y0, x1, y1 in sorted(found, key=lambda r: (r[1], r[0])):
        # il nome del piano è la scritta «Piano …» subito sotto il disegno (o subito sopra)
        near = [(abs(ly - y1) if ly >= y1 - 5 else abs(ly - y0) + 1e3, nm) for lx, ly, nm in labels
                if x0 - px(3) <= lx <= x1 + px(3) and -px(4) <= ly - y1 <= px(6)]
        name = min(near)[1] if near else None
        out.append(((x0, y0, x1, y1), name))
    return out


# ----------------------------------------------------------------------------
# 3. tratti, archi, testi → DXF in metri
# ----------------------------------------------------------------------------
def _deskew(crop):
    """Angolo (gradi) di cui è ruotata la scansione, dai tratti quasi orizzontali e quasi verticali."""
    lines = cv2.HoughLinesP(crop, 1, np.pi / 720, threshold=60, minLineLength=max(30, crop.shape[1] // 12), maxLineGap=4)
    if lines is None:
        return 0.0
    angs = []
    for x1, y1, x2, y2 in lines[:, 0]:
        a = math.degrees(math.atan2(y2 - y1, x2 - x1))
        a = (a + 45) % 90 - 45          # orizzontali e verticali sullo stesso asse
        if abs(a) < 3:
            angs.append(a)
    return float(np.median(angs)) if len(angs) >= 5 else 0.0


def _axis_lines(b, mpp, horizontal):
    """Tratti dritti lunghi almeno 30 cm in una direzione: (posizione, inizio, fine) in pixel."""
    k_gap = max(3, int(0.12 / mpp))          # chiude le interruzioni della scansione (fino a 12 cm)
    k_len = max(8, int(0.3 / mpp))
    if horizontal:
        c = cv2.morphologyEx(b, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (k_gap, 1)))
        o = cv2.morphologyEx(c, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (k_len, 1)))
    else:
        c = cv2.morphologyEx(b, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (1, k_gap)))
        o = cv2.morphologyEx(c, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, k_len)))
    n, _, st, _ = cv2.connectedComponentsWithStats(o)
    out, thick = [], max(3, int(0.06 / mpp))
    for i in range(1, n):
        x, y, w, h, _ = st[i]
        a, la, lo = (y, h, (x, x + w)) if horizontal else (x, w, (y, y + h))
        if la <= thick:
            out.append((a + la / 2, *lo))
        else:                                 # tratto pieno (muro campito): i due bordi
            out.append((a + 0.5, *lo))
            out.append((a + la - 0.5, *lo))
    return _join_collinear(out, mpp), o


def _join_collinear(lines, mpp, gap=0.25, tol=0.04):
    """Tratti sbiaditi: quelli sullo stesso asse (entro 4 cm) separati da meno di 25 cm diventano uno solo.
    Un'apertura vera (porta, finestra) è più larga, quindi non si chiude."""
    kgap, ktol = gap / mpp, tol / mpp
    out = []
    for p, a, c in sorted(lines):
        merged = False
        for j in range(len(out) - 1, -1, -1):
            q, qa, qc = out[j]
            if p - q > ktol:
                break
            if a - qc <= kgap and c >= qa - kgap:
                out[j] = ((q + p) / 2, min(qa, a), max(qc, c))
                merged = True
                break
        if not merged:
            out.append((p, a, c))
    return out


def _arcs(b, lines_mask, mpp):
    """Ante delle porte: archi da 50 cm a 1,15 m di raggio. Nelle scansioni sono spesso puntinati: i pezzi vicini
    si raggruppano e ci si adatta un cerchio (minimi quadrati); il centro è il cardine."""
    rest = cv2.subtract(b, cv2.dilate(lines_mask, np.ones((3, 3), np.uint8)))
    groups = cv2.dilate(rest, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    n, lab = cv2.connectedComponents(groups)
    ys, xs = np.nonzero(rest)
    owner = lab[ys, xs]
    out = []
    for i in range(1, n):
        sel = owner == i
        if sel.sum() < 15:
            continue
        x, y = xs[sel].astype(float), ys[sel].astype(float)
        if not (0.35 <= (x.max() - x.min()) * mpp <= 1.3 and 0.35 <= (y.max() - y.min()) * mpp <= 1.3):
            continue
        A = np.c_[2 * x, 2 * y, np.ones_like(x)]
        sol, *_ = np.linalg.lstsq(A, x * x + y * y, rcond=None)
        cx, cy = sol[0], sol[1]
        r = math.sqrt(max(sol[2] + cx * cx + cy * cy, 0))
        if not 0.5 <= r * mpp <= 1.15:
            continue
        d = np.hypot(x - cx, y - cy)
        if np.sqrt(np.mean((d - r) ** 2)) > 0.08 * r:
            continue
        ang = np.degrees(np.arctan2(-(y - cy), x - cx)) % 360   # y verso l'alto come nel DXF
        a0, a1 = _span(ang)
        if 50 <= (a1 - a0) % 360 <= 120:
            out.append((cx, cy, r, a0, a1))
    return out


def _curves(b, lines_mask, arcs, mpp):
    """Muri curvi o obliqui (un angolo arrotondato, un muro storto): tratti lunghi almeno 80 cm che non sono né
    dritti né l'anta di una porta, come spezzate. Chiudono i locali come i muri obliqui dei DXF."""
    rest = cv2.subtract(b, cv2.dilate(lines_mask, np.ones((3, 3), np.uint8)))
    for cx, cy, r, *_ in arcs:   # le ante delle porte non sono muri
        cv2.circle(rest, (int(cx), int(cy)), int(r + 4), 0, -1)
    rest = cv2.morphologyEx(rest, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    cnts, _ = cv2.findContours(rest, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    out = []
    for c in cnts:
        x, y, w, h = cv2.boundingRect(c)
        if max(w, h) * mpp < 0.8 or min(w, h) * mpp < 0.25:
            continue    # tratti corti o dritti (già presi), testi
        pts = cv2.approxPolyDP(c, 2.0, False)[:, 0, :]
        # il contorno di un tratto sottile va e torna: basta la prima metà
        half = pts[: max(2, len(pts) // 2 + 1)]
        out.extend((tuple(a), tuple(b2)) for a, b2 in zip(half, half[1:]))
    return out


def _span(ang):
    """Arco antiorario più corto che contiene tutti gli angoli."""
    s = np.sort(ang)
    gaps = np.diff(np.concatenate([s, [s[0] + 360]]))
    i = int(np.argmax(gaps))
    return float(s[(i + 1) % len(s)]), float(s[i])


def drawing_to_dxf(page, box, labels_extra=()) -> Tuple[str, dict]:
    """Un disegno del foglio → testo DXF in metri (y verso l'alto) e qualche dato (angolo, tratti, archi)."""
    img, mpp = page["img"], page["mpp"]
    x0, y0, x1, y1 = box
    pad = int(0.5 / mpp)
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(img.shape[1], x1 + pad), min(img.shape[0], y1 + pad)
    b = _ink(img[y0:y1, x0:x1])
    texts = [(tx0 - x0, ty0 - y0, tx1 - x0, ty1 - y0, t) for tx0, ty0, tx1, ty1, t in page["texts"]
             if x0 <= (tx0 + tx1) / 2 <= x1 and y0 <= (ty0 + ty1) / 2 <= y1]
    for tx0, ty0, tx1, ty1, _ in texts:   # i caratteri non sono muri
        b[max(0, int(ty0) - 2):int(ty1) + 2, max(0, int(tx0) - 2):int(tx1) + 2] = 0
    ang = _deskew(b)
    if abs(ang) > 0.05:
        M = cv2.getRotationMatrix2D((b.shape[1] / 2, b.shape[0] / 2), ang, 1.0)
        b = cv2.warpAffine(b, M, (b.shape[1], b.shape[0]), flags=cv2.INTER_NEAREST)
        rot = lambda x, y: (M[0, 0] * x + M[0, 1] * y + M[0, 2], M[1, 0] * x + M[1, 1] * y + M[1, 2])  # noqa: E731
    else:
        rot = lambda x, y: (x, y)  # noqa: E731
    _, b = cv2.threshold(b, 127, 255, cv2.THRESH_BINARY)
    hs, hm = _axis_lines(b, mpp, True)
    vs, vm = _axis_lines(b, mpp, False)
    arcs = _arcs(b, cv2.bitwise_or(hm, vm), mpp)
    curves = _curves(b, cv2.bitwise_or(hm, vm), arcs, mpp)
    doc = ezdxf.new("R2000", units=6)
    doc.header["$INSUNITS"] = 6
    msp = doc.modelspace()
    m = lambda x, y: (x * mpp, -y * mpp)  # noqa: E731
    for p, a, c in hs:
        msp.add_line(m(a, p), m(c, p))
    for p, a, c in vs:
        msp.add_line(m(p, a), m(p, c))
    for cx, cy, r, a0, a1 in arcs:
        msp.add_arc(m(cx, cy), r * mpp, a0, a1)
    for (ax, ay), (bx, by) in curves:
        msp.add_line(m(ax, ay), m(bx, by))
    for tx0, ty0, tx1, ty1, t in list(texts) + list(labels_extra):
        x, y = rot((tx0 + tx1) / 2, (ty0 + ty1) / 2)     # il centro della scritta: cade nel locale che descrive
        msp.add_text(t, dxfattribs={"height": max((ty1 - ty0) * mpp, 0.1)}).set_placement(m(x, y))
    buf = io.StringIO()
    doc.write(buf)
    outline = None
    pts = np.array([(a, p) for p, a, c in hs] + [(c, p) for p, a, c in hs] +
                   [(p, a) for p, a, c in vs] + [(p, c) for p, a, c in vs], np.float32)
    if len(pts) >= 3:
        outline = [m(x, y) for x, y in cv2.convexHull(pts)[:, 0, :]]
    return buf.getvalue(), {"angle": ang, "lines": len(hs) + len(vs), "arcs": len(arcs), "curves": len(curves),
                            "outline": outline, "texts": [t for *_, t in texts], "size": (b.shape[1] * mpp, b.shape[0] * mpp)}


def scan_plan(text: str, style: str = "modern") -> Optional[dict]:
    """DXF ricavato dalla scansione → pianta arredata (come planner.import_dxf_data, con i varchi chiusi), o None."""
    import random
    import dxf_import
    import planner
    lay = dxf_import.import_real_dxf(text, planner.Layout, planner.Opening, planner.snap, scan=True)
    if lay is None or not lay.rooms:
        return None
    planner.furnish(lay)
    palette = planner.PALETTES.get((style or "modern").lower(), planner.PALETTES["modern"])
    plan = planner.serialize(lay, palette, random.randrange(1, 1_000_000))
    main = {r["zone"]: r for r in plan["rooms"] if r["name"]}
    for r in plan["rooms"]:
        if not r["name"] and r["zone"] in main:
            r["color"] = main[r["zone"]]["color"]
    return plan


def outline_plan(outline, style: str = "modern", texts=()) -> Optional[dict]:
    """Un solo locale, grande quanto il disegno: quando i muri della scansione non chiudono nessun locale."""
    import random
    import dxf_import
    import planner
    xs, ys = [p[0] for p in outline], [p[1] for p in outline]
    W, L = planner.snap(max(xs) - min(xs)), planner.snap(max(ys) - min(ys))
    if W < 1.5 or L < 1.5:
        return None
    lay = planner.Layout(W, L)
    kind, name, _ = dxf_import._name_room(list(texts), W * L)
    room = lay.add_room(name or "Locale", kind or "study", 0, 0, W, L)
    lay.add_entrance(room.id, "S", planner.DOOR_W, 0.5)
    planner.furnish(lay)
    palette = planner.PALETTES.get((style or "modern").lower(), planner.PALETTES["modern"])
    return planner.serialize(lay, palette, random.randrange(1, 1_000_000))


def _relabel(text: str, plan: dict, room: dict, label: str, style: str) -> Optional[dict]:
    """Rifà la pianta con un nome scritto al centro di un locale (il DXF ha y verso l'alto, la pianta verso il basso)."""
    doc = ezdxf.read(io.StringIO(text))
    msp = doc.modelspace()
    xs = [v for e in msp.query("LINE") for v in (e.dxf.start.x, e.dxf.end.x)]
    ys = [v for e in msp.query("LINE") for v in (e.dxf.start.y, e.dxf.end.y)]
    if not xs:
        return None
    # la pianta parte dal primo muro: si allinea il suo riquadro a quello delle linee
    x0 = min(xs) + (max(xs) - min(xs) - plan["dimensions"]["width"]) / 2
    y1 = max(ys) - (max(ys) - min(ys) - plan["dimensions"]["length"]) / 2
    cx, cy = room["x"] + room["w"] / 2, room["y"] + room["h"] / 2
    msp.add_text(label, dxfattribs={"height": 0.2}).set_placement((x0 + cx, y1 - cy))
    buf = io.StringIO()
    doc.write(buf)
    new = scan_plan(buf.getvalue(), style)
    return new if new and any(r["name"] == label for r in new["rooms"]) else None


# ----------------------------------------------------------------------------
# 4. progetto
# ----------------------------------------------------------------------------
def _guess_types(text: str, plan: dict, style: str) -> dict:
    """Piano senza nomi: si stimano dal tipo di casa. Senza bagno il locale più piccolo tra 2,5 e 8 m² lo è;
    senza camera il più grande dei rimanenti (non il soggiorno) lo diventa."""
    def rooms(*kinds):
        return [r for r in plan["rooms"] if r["name"] and (not kinds or r["kind"] in kinds)]
    kinds = {r["kind"] for r in plan["rooms"]}
    for label, kind, pick in (
        ("Bagno", "bath", lambda: min((r for r in rooms() if 2.5 <= r["area"] <= 8 and r["kind"] not in ("living", "living_kitchen")),
                                       key=lambda r: r["area"], default=None)),
        ("Camera Matrimoniale", "bed", lambda: max((r for r in rooms() if 9 <= r["area"] <= 22 and r["kind"] not in
                                                    ("living", "living_kitchen", "kitchen", "bath")),
                                                   key=lambda r: r["area"], default=None)),
    ):
        if kind in kinds:
            continue
        room = pick()
        if room is not None:
            plan = _relabel(text, plan, room, label, style) or plan
            kinds = {r["kind"] for r in plan["rooms"]}
    return plan


def import_catasto(data: bytes, style: str = "modern") -> dict:
    """PDF catastale → {"floors": [{level, program, name, plan}], "notes"}; NotCatasto se non lo è."""
    import dxf_import
    import planner
    pages = read_pages(data)
    if not is_catasto(pages):
        raise NotCatasto("Il PDF non sembra una planimetria catastale.")
    floors, notes, used = [], [], set()
    for pi, page in enumerate(pages):
        for box, name in drawings(page):
            text, info = drawing_to_dxf(page, box)
            plan = scan_plan(text, style)
            if plan is None and info.get("outline"):
                # i muri non chiudono nessun locale (tratti sbiaditi, angoli arrotondati): un solo locale grande
                # quanto il disegno, da dividere o ricalcare
                plan = outline_plan(info["outline"], style, info.get("texts", ()))
                if plan:
                    plan["notes"].insert(0, "Disegno letto solo nel contorno: dividi i locali o ricalcalo nello schizzo.")
            if plan is None:
                notes.append(f"Pagina {pi + 1}: un disegno non è stato riconosciuto (va ricalcato).")
                continue
            name = name or f"Piano (pagina {pi + 1})"
            level = floor_level(name)
            if level is None:
                level = 0
            while level in used:      # due subalterni allo stesso piano: il secondo va su un livello libero
                level = level + 1 if level >= 0 else level - 1
            used.add(level)
            big = max(plan["rooms"], key=lambda r: r["area"])
            program = "garage" if big["kind"] == "garage" else "full"
            if program == "full" and not any(r["kind"] in ("living", "living_kitchen", "kitchen") for r in plan["rooms"]):
                # il catasto quasi non scrive i nomi: il locale più grande è la zona giorno
                plan = _relabel(text, plan, big, "Soggiorno", style) or plan
            if program == "full" and not any(dxf_import._name_room([t], 10)[2] for t in info.get("texts", ())):
                plan = _guess_types(text, plan, style)
            plan["notes"] = [n.replace("dal DXF", "dalla planimetria catastale") for n in plan["notes"]]
            if abs(info["angle"]) > 0.05:
                plan["notes"].append(f"Scansione raddrizzata di {abs(info['angle']):.1f}°.".replace(".", ",", 1))
            floors.append({"level": level, "program": program, "name": name.capitalize(), "plan": plan})
    if not floors:
        raise NotCatasto("Nessun disegno riconosciuto nella planimetria catastale.")
    floors.sort(key=lambda f: f["level"])
    notes.insert(0, f"Planimetria catastale in scala 1:{pages[0]['scale']}: {len(floors)} "
                    f"{'piano' if len(floors) == 1 else 'piani'} da {len(pages)} "
                    f"{'pagina' if len(pages) == 1 else 'pagine'}. Controlla i tipi dei locali: il catasto spesso non li scrive.")
    return {"floors": floors, "seed": 0, "notes": notes}
