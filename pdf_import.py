"""
Piante da PDF: i PDF esportati da un CAD (AutoCAD, ArchiCAD, Revit…) sono fatti di linee vere. Si leggono con
pdfminer.six (licenza MIT), si rifanno in un DXF in metri (linee, archi delle porte, testi dei locali) e passano
dalla stessa importazione dei DXF di studio (dxf_import.py).

La scala si legge dal foglio («Scala 1:100», «1:50»…); se non c'è si sceglie quella che dà ai muri uno spessore
plausibile. Le scansioni e le foto non hanno linee da leggere: per quelle c'è il ricalco nello schizzo (RasterPdf).
"""
import io
import math
import re
from collections import Counter
from typing import List, Optional, Tuple

import ezdxf

try:
    from pdfminer.high_level import extract_pages
    from pdfminer.layout import LAParams, LTChar, LTCurve, LTFigure, LTImage, LTTextLine
except ImportError:  # pragma: no cover - motore senza pdfminer: l'importazione PDF non è disponibile
    extract_pages = None

PT = 0.0254 / 72            # un punto tipografico in metri (sulla carta)
SCALES = (20, 25, 50, 75, 100, 125, 200, 250, 500)
MIN_SEGMENTS = 40           # sotto queste linee la pagina non è un disegno (o è una scansione)


class RasterPdf(Exception):
    """Il PDF non ha linee: è una scansione o una foto (si ricalca a mano)."""


def _bezier(p0, p1, p2, p3, n=8):
    out = []
    for i in range(1, n + 1):
        t = i / n
        a, b, c, d = (1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out


def _arc(pts):
    """Un tratto curvo è un arco di cerchio (l'anta di una porta)? Ritorna (cx, cy, r, a0, a1) in gradi, antiorario."""
    if len(pts) < 4:
        return None
    (x1, y1), (x2, y2), (x3, y3) = pts[0], pts[len(pts) // 2], pts[-1]
    d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2))
    if abs(d) < 1e-9:
        return None
    s1, s2, s3 = x1 * x1 + y1 * y1, x2 * x2 + y2 * y2, x3 * x3 + y3 * y3
    cx = (s1 * (y2 - y3) + s2 * (y3 - y1) + s3 * (y1 - y2)) / d
    cy = (s1 * (x3 - x2) + s2 * (x1 - x3) + s3 * (x2 - x1)) / d
    r = math.hypot(x1 - cx, y1 - cy)
    if r <= 0 or any(abs(math.hypot(x - cx, y - cy) - r) > r * 0.04 for x, y in pts):
        return None
    ang = lambda x, y: math.degrees(math.atan2(y - cy, x - cx)) % 360  # noqa: E731
    a0, am, a1 = ang(x1, y1), ang(x2, y2), ang(x3, y3)
    # verso antiorario da a0 ad a1 se passa per il punto di mezzo, altrimenti al contrario
    if (am - a0) % 360 <= (a1 - a0) % 360:
        return cx, cy, r, a0, a1
    return cx, cy, r, a1, a0


def _paths(obj):
    """Sotto-percorsi di un LTCurve come liste di punti, con le curve campionate (e marcate)."""
    path = getattr(obj, "original_path", None)
    if not path:
        pts = [tuple(p) for p in obj.pts]
        return [(pts, False)] if len(pts) > 1 else []
    out, cur, curved, start = [], [], False, None
    for op, *args in path:
        if op == "m":
            if len(cur) > 1:
                out.append((cur, curved))
            cur, curved = [tuple(args[0])], False
            start = cur[0]
        elif op == "l" and cur:
            cur.append(tuple(args[0]))
        elif op in ("c", "v", "y") and cur:
            p0 = cur[-1]
            if op == "c":
                p1, p2, p3 = args
            elif op == "v":
                p1, p2, p3 = p0, args[0], args[1]
            else:
                p1, p2, p3 = args[0], args[1], args[1]
            cur.extend(_bezier(p0, tuple(p1), tuple(p2), tuple(p3)))
            curved = True
        elif op == "h" and cur and start:
            cur.append(start)
    if len(cur) > 1:
        out.append((cur, curved))
    return out


def _style(it) -> tuple:
    """Stile di tratto (spessore e colore): nei PDF da CAD fa le veci del layer."""
    if not it.stroke and it.fill:
        return ("fill", str(it.non_stroking_color))
    return (round(it.linewidth or 0.0, 2), str(it.stroking_color))


def _walk(items, segs, arcs, texts):
    for it in items:
        if isinstance(it, LTFigure):
            _walk(it, segs, arcs, texts)
        elif isinstance(it, LTCurve):
            st = _style(it)
            for pts, curved in _paths(it):
                a = _arc(pts) if curved else None
                if a:
                    arcs.append((*a, st))
                    continue
                for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
                    if math.hypot(x2 - x1, y2 - y1) > 1e-3:
                        segs.append((x1, y1, x2, y2, st))
        elif isinstance(it, LTTextLine):
            t = it.get_text().strip()
            if t:
                h = max((c.size for c in it if isinstance(c, LTChar)), default=it.height)
                texts.append((it.x0, it.y0, h, t))
        elif hasattr(it, "__iter__") and not isinstance(it, (LTImage, LTChar)):
            _walk(it, segs, arcs, texts)


def _scale(texts, segs) -> Tuple[float, str]:
    """Metri reali per punto del PDF, e da dove viene la scala."""
    found = Counter()
    for *_, t in texts:
        for m in re.finditer(r"(?<![\d.,])1\s*[:/]\s*(\d{1,4})(?![\d.,])", t):
            n = int(m.group(1))
            if 10 <= n <= 1000:
                found[n] += 1
    if found:
        n = found.most_common(1)[0][0]
        return PT * n, f"scala 1:{n} letta sul foglio"
    import dxf_import
    gap = dxf_import._typical_gap([(*s[:4], "wall") for s in segs])
    if gap:
        best = min(SCALES, key=lambda n: abs(gap * PT * n - 0.25))
        if 0.06 <= gap * PT * best <= 0.5:
            return PT * best, f"scala 1:{best} ricavata dallo spessore dei muri"
    return PT * 100, "scala non trovata: si è usata 1:100"


def _pair_ratio(segs, k) -> float:
    """Quota dei tratti orizzontali che hanno una parallela vicina (6-50 cm) che li affianca: i muri sono così."""
    hs = sorted(((y1 + y2) / 2 * k, min(x1, x2) * k, max(x1, x2) * k) for x1, y1, x2, y2, *_ in segs
                if abs(y2 - y1) <= abs(x2 - x1) * 0.026 and abs(x2 - x1) * k > 0.2)
    if len(hs) < 4:
        return 0.0
    step = max(1, len(hs) // 1500)
    hit = tot = 0
    for i in range(0, len(hs), step):
        c, a, b = hs[i]
        tot += 1
        for c2, a2, b2 in hs[i + 1:i + 80]:
            if c2 - c > 0.5:
                break
            if c2 - c >= 0.06 and min(b, b2) - max(a, a2) > (b - a) * 0.5:
                hit += 1
                break
    return hit / tot


def _layers(segs, arcs, k):
    """Layer per stile di tratto: i muri (tratti lunghi a coppie parallele), il retino dei muri (tanti tratti
    cortissimi) che si scarta, il resto (arredi, quote, finestre) che non fa da muro. Con un solo stile,
    o se nessuno somiglia a dei muri, tutto resta sul layer 0 come in un DXF senza layer."""
    by = {}
    for sg in segs:
        by.setdefault(sg[4], []).append(sg)
    if len(by) < 2:
        return {st: "0" for st in by}
    out, walls, total = {}, [], len(segs)
    for st, ss in by.items():
        lens = sorted(math.hypot(x2 - x1, y2 - y1) * k for x1, y1, x2, y2, _ in ss)
        med = lens[len(lens) // 2]
        if len(ss) >= 8 and med >= 0.3 and _pair_ratio(ss, k) >= 0.35:
            walls.append(st)
        elif med < 0.15 and len(ss) > 2000 and len(ss) < total * 0.8:
            out[st] = None                       # retino (mai lo stile che ha quasi tutto il disegno)
        else:
            out[st] = "ALTRO"
    if not walls:
        return {st: (None if v is None else "0") for st, v in out.items()}
    out.update({st: "MURI" for st in walls})
    return out


def read_pdf(data: bytes):
    """Pagina con il disegno → (segmenti, archi, testi) in punti PDF, e il numero di pagine."""
    if extract_pages is None:
        raise RuntimeError("lettura dei PDF non disponibile su questo motore (manca pdfminer.six)")
    best, pages = None, 0
    for page in extract_pages(io.BytesIO(data), laparams=LAParams(), maxpages=20):
        pages += 1
        segs, arcs, texts = [], [], []
        _walk(page, segs, arcs, texts)
        if best is None or len(segs) + 4 * len(arcs) > len(best[0]) + 4 * len(best[1]):
            best = (segs, arcs, texts)
    if not best or len(best[0]) < MIN_SEGMENTS:
        raise RasterPdf("Il PDF non contiene linee di disegno: sembra una scansione o una foto.")
    return best, pages


def pdf_to_dxf(data: bytes) -> Tuple[str, List[str]]:
    """PDF vettoriale → testo DXF in metri, più le note sull'importazione."""
    (segs, arcs, texts), pages = read_pdf(data)
    k, how = _scale(texts, segs)
    layer = _layers(segs, arcs, k)
    doc = ezdxf.new("R2000", units=6)
    doc.header["$INSUNITS"] = 6
    msp = doc.modelspace()
    for x1, y1, x2, y2, st in segs:
        if layer.get(st) and math.hypot(x2 - x1, y2 - y1) * k >= 0.01:
            msp.add_line((x1 * k, y1 * k), (x2 * k, y2 * k), dxfattribs={"layer": layer[st]})
    for cx, cy, r, a0, a1, st in arcs:
        if 0.4 <= r * k <= 1.6:      # archi da porta (ante da 40 cm a 1,6 m), di qualunque stile
            msp.add_arc((cx * k, cy * k), r * k, a0, a1)
    for x, y, h, t in texts:
        msp.add_text(t, dxfattribs={"height": max(h * k, 0.05)}).set_placement((x * k, y * k))
    buf = io.StringIO()
    doc.write(buf)
    notes = [f"PDF: {how}" + (f", pagina con il disegno su {pages}" if pages > 1 else "") + "."]
    return buf.getvalue(), notes


def import_pdf_data(data: bytes, style: str = "modern") -> Optional[dict]:
    import planner
    text, notes = pdf_to_dxf(data)
    plan = planner.import_dxf_data(text, style=style)
    plan["notes"] = [n.replace("dal DXF", "dal PDF") for n in plan.get("notes", [])] + notes
    return plan
