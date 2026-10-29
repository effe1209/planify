"""
Importazione di piante reali da DXF: muri, porte, finestre e locali ricostruiti dal disegno CAD.

Un disegno di studio non ha le «stanze» come polilinee: ha i muri come coppie di linee parallele, le porte
come archi (spesso dentro blocchi), le finestre come linee sottili nel vano, i nomi dei locali come testi.
Il procedimento:

1. lettura con ezdxf (anche file danneggiati), blocchi esplosi, unità da $INSUNITS o dalle misure;
2. ruolo di ogni elemento dal layer o dal nome del blocco (muri, porte, finestre, da ignorare);
3. muri: coppie di linee orizzontali / verticali a 5-65 cm l'una dall'altra → tratti con asse e spessore;
4. aperture: interruzioni lungo l'asse di un muro (tra due tratti o tra un tratto e il muro perpendicolare);
   porta se c'è l'arco dell'anta o un blocco porta, finestra se ci sono linee o blocchi di finestra oppure
   il muro è esterno, altrimenti passaggio;
5. locali: griglia a 5 cm con muri e aperture chiusi, l'esterno riempito dal bordo, le zone libere rimaste
   sono i locali; i lati vanno sull'asse del muro vicino; un locale non rettangolare diventa più rettangoli
   della stessa zona;
6. nomi dai testi dentro ogni locale (soggiorno, cucina, camera, bagno…), altrimenti dalla superficie.

Restituisce un Layout del motore (planner.Layout) con stanze, porte e finestre, da arredare e serializzare;
None se il disegno non ha muri riconoscibili (si usa allora l'importazione per polilinee delle stanze).
"""
from __future__ import annotations

import io
import math
import re
import unicodedata
from array import array
from collections import deque
from typing import Dict, List, Optional, Tuple

try:
    import ezdxf
    from ezdxf import recover
    import ezdxf.bbox
except ImportError:  # pragma: no cover - ezdxf è nei requisiti
    ezdxf = None

# nomi di layer e blocchi in italiano, inglese e spagnolo (molti disegni scaricabili sono in spagnolo)
WALL_RE = re.compile(r"mur|wall|paret|pared|tramez|tampon|struttur|pilastr|sett[io]|a-wal|cls|calcestr|lateriz|tabique", re.I)
DOOR_RE = re.compile(r"port[ae]|door|a-door|anta|uscio|puert", re.I)
WINDOW_RE = re.compile(r"finestr|window|serram|infiss|glaz|vetr|a-win|^fin[_ -]|^f\d|ventan|cristal", re.I)
# fuori pianta in ogni caso (prospetti, sezioni, tetto, cartiglio): prevalgono anche su «porta» e «finestra»
HARD_IGNORE_RE = re.compile(r"elev|prospett|seccion|section|sezion|detail|detall|dettagl|tetto|techo|roof|cubiert|"
                            r"cartigl|title|sheet|marco|tarjeta|cajet|viewport|defpoints", re.I)
# da ignorare, ma una porta o una finestra con questi nomi resta tale (es. «VENTANA DE ESCALERA»)
IGNORE_RE = re.compile(r"quot|dim|arred|furn|mobil|muebl|campit|hatch|hacth|tratteg|text|test[io]|scritt|assi|axis|grid|griglia|"
                       r"sanit|eletti?r|electr|idraul|impiant|esterno|giardin|vegetaz|ombr|"
                       r"trav[ei]|viga|beam|npt|meset|bancon|textur|tierra|terreno|matas|plant|"
                       r"agua|varill|baj[oa]|parapet|vuelo|cascaron|perrill|piso\b|pisos|escaler|scal[ae]\b|stair|ringhier|"
                       r"barand|varanda|column|pilar|tuber|pipe|duct|hvac", re.I)

T_MIN, T_MAX = 0.06, 0.65      # spessori plausibili dei muri (m)
AXIS_TOL = 0.08                 # tratti con assi più vicini di così sono lo stesso muro (spessori diversi)
PIECE_MIN = 0.2                 # tratti più corti: spallette e incroci, non muri
OPEN_MIN, OPEN_MAX = 0.45, 4.0  # larghezze plausibili delle aperture (m)
DEBUG_GRID: list = []          # test: se non vuota riceve la griglia del calcolo
DOOR_LIKE = 1.05                # varco senza simbolo più largo di così: passaggio, non porta
END_OPEN_MAX = 2.0              # apertura tra la fine di un muro e il muro perpendicolare
ANG = math.radians(1.5)         # tolleranza per considerare una linea orizzontale / verticale

ROOM_WORDS = [
    (r"soggiorno.*cucina|cucina.*soggiorno|living.*kitchen|open space|sala.*cocina|cocina.*sala", "living_kitchen", "Soggiorno con Cucina"),
    (r"soggiorno|salotto|living|salone|sala\b|lounge|family room|estar", "living", "Soggiorno"),
    (r"pranzo|dining|comedor|breakfast|desayun", "dining", "Sala da pranzo"),
    (r"cucin|cottura|kitchen|kitchenette|cocina", "kitchen", "Cucina"),
    (r"matrimon|padronale|master|main|principal", "bed", "Camera Matrimoniale"),
    (r"camer|letto|bedroom|cameretta|dormitor|habitac|recamar|alcoba|\broom\s*\d|^room\b", "bed", "Camera"),
    (r"\bw\.?c\b|toilet|antibagno|medio bano|half bath|powder", "wc", "WC"),
    (r"bagn|servizi igien|doccia|bath|bano|aseo|sanitario", "bath", "Bagno"),
    (r"disimp|corridoi|\bdis\b|passaggio|hall|distribuz|corridor|pasillo|vestibul", "corridor", "Disimpegno"),
    (r"ingress|atrio|entrata|\bentry\b|entrance|foyer|recibidor|acceso|vestibulo", "entry", "Ingresso"),
    (r"studio|ufficio|office|study|estudio|despacho", "study", "Studio"),
    (r"lavander|laundry|washing|lavado|lavanderia", "laundry", "Lavanderia"),
    (r"guardarob|cabina armadi|closet|vestidor|walk.?in|clothing", "closet", "Guardaroba"),
    (r"ripost|\brip\b|deposito|cantina|storage|dispensa|pantry|despensa|bodega|service room|cuarto de servicio|utility", "storage", "Ripostiglio"),
    (r"garage|\bbox\b|autorimessa|garaje|cochera|carport", "garage", "Garage"),
]
OUTSIDE_WORDS = re.compile(r"balcon|terrazz|terraza|terrace|loggia|portico|porche|porch|veranda|giardin|jardin|garden|cortile|patio|"
                           r"esterno|gallery|galeria|marquee|marquesina|deck|piscina|pool", re.I)


def _plain(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"\\[a-z][^;]*;|[{}]", " ", s)   # codici di formato MTEXT


# ----------------------------------------------------------------------------
# 1-2. lettura e ruoli
# ----------------------------------------------------------------------------
def _role(layer: str, block: str) -> str:
    # prima ciò che non è pianta (prospetti, sezioni, tetto…), poi porte e finestre, poi il resto da ignorare, poi i muri
    if HARD_IGNORE_RE.search(layer or ""):
        return "ignore"
    for name in (block or "", layer or ""):
        if not name:
            continue
        if DOOR_RE.search(name):
            return "door"
        if WINDOW_RE.search(name):
            return "window"
    if IGNORE_RE.search(layer or "") or IGNORE_RE.search(block or "") or HARD_IGNORE_RE.search(block or ""):
        return "ignore"
    if WALL_RE.search(layer or ""):
        return "wall"
    return "other"


def _read(text: str):
    """Elementi del disegno: segmenti, archi, testi (in unità del file), con il ruolo."""
    # lettura normale (veloce); quella di recupero solo per i file danneggiati
    try:
        doc = ezdxf.read(io.StringIO(text))
    except Exception:  # noqa: BLE001
        try:
            doc, _ = recover.read(io.BytesIO(text.encode("utf-8", errors="ignore")))
        except Exception:  # noqa: BLE001 - file illeggibile
            return None
    segs: List[Tuple[float, float, float, float, str]] = []
    arcs: List[Tuple[float, float, float, float, float, str]] = []   # cx, cy, r, a0, a1 (gradi), ruolo
    texts: List[Tuple[float, float, str]] = []
    boxes: List[Tuple[float, float, float, float, str]] = []         # ingombri dei blocchi porta / finestra

    def poly_edges(pts, closed, role):
        n = len(pts)
        for i in range(n if closed else n - 1):
            (x1, y1, b), (x2, y2, _) = pts[i], pts[(i + 1) % n]
            if abs(b) > 1e-6:   # tratto ad arco (bulge): può essere l'anta di una porta
                ang = 4 * math.atan(b)
                chord = math.hypot(x2 - x1, y2 - y1)
                if chord > 1e-9:
                    r = chord / (2 * math.sin(abs(ang) / 2))
                    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
                    h = r * math.cos(ang / 2)
                    nx, ny = -(y2 - y1) / chord, (x2 - x1) / chord
                    cx, cy = mx + nx * h * (1 if b > 0 else -1), my + ny * h * (1 if b > 0 else -1)
                    a0 = math.degrees(math.atan2(y1 - cy, x1 - cx))
                    a1 = math.degrees(math.atan2(y2 - cy, x2 - cx))
                    arcs.append((cx, cy, abs(r), *((a0, a1) if b > 0 else (a1, a0)), role))
            else:
                segs.append((x1, y1, x2, y2, role))

    def walk(entities, layer=None, block=None, depth=0):
        for e in entities:
            t = e.dxftype()
            lay = e.dxf.get("layer", "0")
            eff_layer = layer if (layer and lay == "0") else lay
            role = _role(eff_layer, block)
            try:
                if t == "INSERT":
                    if depth > 4:
                        continue
                    name = e.dxf.name
                    sub = list(e.virtual_entities())
                    r = _role(eff_layer, name)
                    if r in ("door", "window"):
                        xs, ys = [], []
                        for s in sub:
                            if s.dxftype() == "LINE":
                                xs += [s.dxf.start.x, s.dxf.end.x]
                                ys += [s.dxf.start.y, s.dxf.end.y]
                            elif s.dxftype() == "ARC":
                                c, rr = s.dxf.center, s.dxf.radius
                                for a in (s.dxf.start_angle, s.dxf.end_angle, (s.dxf.start_angle + s.dxf.end_angle) / 2):
                                    xs.append(c.x + rr * math.cos(math.radians(a)))
                                    ys.append(c.y + rr * math.sin(math.radians(a)))
                                xs.append(c.x)
                                ys.append(c.y)
                        if xs:
                            boxes.append((min(xs), min(ys), max(xs), max(ys), r))
                    walk(sub, eff_layer, block or name, depth + 1)
                elif t == "LINE":
                    s, f = e.dxf.start, e.dxf.end
                    segs.append((s.x, s.y, f.x, f.y, role))
                elif t == "LWPOLYLINE":
                    poly_edges([(p[0], p[1], p[4]) for p in e.get_points("xyseb")], e.closed, role)
                elif t == "POLYLINE" and not e.is_3d_polyline and not e.is_poly_face_mesh and not e.is_polygon_mesh:
                    pts = [(v.dxf.location.x, v.dxf.location.y, v.dxf.get("bulge", 0)) for v in e.vertices]
                    poly_edges(pts, e.is_closed, role)
                elif t == "ARC":
                    c = e.dxf.center
                    arcs.append((c.x, c.y, e.dxf.radius, e.dxf.start_angle, e.dxf.end_angle, role))
                elif t == "TEXT":
                    p = e.dxf.align_point if e.dxf.get("halign", 0) and e.dxf.hasattr("align_point") else e.dxf.insert
                    texts.append((p.x, p.y, e.dxf.text))
                elif t == "MTEXT":
                    # il punto d'inserimento è un angolo del riquadro: si usa il centro del testo
                    try:
                        ext = ezdxf.bbox.extents([e], fast=True)
                        cx, cy = (ext.extmin.x + ext.extmax.x) / 2, (ext.extmin.y + ext.extmax.y) / 2
                    except Exception:  # noqa: BLE001
                        cx, cy = e.dxf.insert.x, e.dxf.insert.y
                    texts.append((cx, cy, e.plain_text()))
            except Exception:  # noqa: BLE001 - un elemento difettoso non blocca l'importazione
                continue

    walk(doc.modelspace())
    units = doc.header.get("$INSUNITS", 0)
    return segs, arcs, texts, boxes, units


def _typical_gap(segs) -> Optional[float]:
    """Distanza più comune tra una linea orizzontale e la parallela più vicina sopra (in unità del disegno):
    in una pianta è lo spessore dei muri."""
    roles = {"wall"} if any(s[4] == "wall" for s in segs) else {"wall", "other"}
    hs = sorted(((y1 + y2) / 2, min(x1, x2), max(x1, x2)) for x1, y1, x2, y2, r in segs
                if r in roles and abs(y2 - y1) <= abs(x2 - x1) * 0.026 and abs(x2 - x1) > 0)
    gaps = []
    for i, (c, a, b) in enumerate(hs):
        for c2, a2, b2 in hs[i + 1:i + 60]:
            d = c2 - c
            if d <= (b - a) * 1e-3:
                continue
            if min(b, b2) - max(a, a2) > (b - a) * 0.3:
                gaps.append(d)
                break
    if len(gaps) < 6:
        return None
    gaps.sort()
    return gaps[len(gaps) // 3]   # terzile basso: i muri, non le stanze


def _scale(units: int, segs) -> float:
    """Metri per unità di disegno. L'unità dichiarata ($INSUNITS) vale solo se lo spessore tipico dei muri
    risulta plausibile (6-50 cm): molti file la dichiarano sbagliata. Altrimenti si sceglie l'unità che lo
    rende plausibile; senza muri riconoscibili, quella che dà una casa entro 60 m."""
    known = {1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1.0, 14: 0.1}
    gap = _typical_gap(segs)
    cands = ([known[units]] if units in known else []) + [1.0, 0.01, 0.001, 0.0254, 0.1, 0.3048]
    if gap:
        for k in cands:
            if 0.06 <= gap * k <= 0.5:
                return k
    if units in known:
        return known[units]
    xs = [v for s in segs for v in (s[0], s[2])]
    ys = [v for s in segs for v in (s[1], s[3])]
    if not xs:
        return 1.0
    size = max(max(xs) - min(xs), max(ys) - min(ys))
    return next((f for f in (1.0, 0.01, 0.001) if size * f <= 60), 0.001)


# ----------------------------------------------------------------------------
# 3. muri
# ----------------------------------------------------------------------------
def _axis_segments(segs, k, roles):
    """Segmenti orizzontali (y, x0, x1) e verticali (x, y0, y1) in metri, solo con i ruoli dati."""
    hs, vs, slanted = [], [], []
    for x1, y1, x2, y2, role in segs:
        if role not in roles:
            continue
        x1, y1, x2, y2 = x1 * k, y1 * k, x2 * k, y2 * k
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy)
        if length < 0.03:
            continue
        a = math.atan2(abs(dy), abs(dx))
        if a < ANG:
            hs.append(((y1 + y2) / 2, min(x1, x2), max(x1, x2)))
        elif abs(a - math.pi / 2) < ANG:
            vs.append(((x1 + x2) / 2, min(y1, y2), max(y1, y2)))
        elif length > 0.5:
            slanted.append((x1, y1, x2, y2))
    return hs, vs, slanted


def _pair_walls(lines):
    """Coppie di linee parallele vicine → tratti di muro (asse, inizio, fine, spessore)."""
    lines = sorted(lines)
    pieces = []
    for i, (c1, a1, b1) in enumerate(lines):
        best = None
        for c2, a2, b2 in lines[i + 1:]:
            d = c2 - c1
            if d < T_MIN:
                continue
            if d > T_MAX:
                break
            lo, hi = max(a1, a2), min(b1, b2)
            # la linea più vicina; a parità di distanza quella che si sovrappone di più (non una spalletta)
            if hi - lo >= PIECE_MIN and (best is None or (round(d, 2), lo - hi) < (round(best[0], 2), best[1] - best[2])):
                best = (d, lo, hi)
        if best:
            d, lo, hi = best
            # le spallette (linee corte, lunghe quanto lo spessore del muro) accoppiate tra loro non sono muri
            if hi - lo >= PIECE_MIN and (hi - lo >= d * 1.2 or hi - lo >= 0.4):
                pieces.append((round(c1 + d / 2, 3), lo, hi, d))
    return pieces


def _split_infill(pieces):
    """Tratti molto più sottili, sullo stesso asse e tra due tratti di muro: sono le linee del vetro di una finestra."""
    by: Dict[float, list] = {}
    for p in pieces:
        key = next((kk for kk in by if abs(kk - p[0]) <= AXIS_TOL), p[0])
        by.setdefault(key, []).append(p)
    walls, hints = [], []
    for c, ps in by.items():
        ps.sort(key=lambda p: p[1])
        for i, p in enumerate(ps):
            left = next((q for q in ps[:i][::-1] if abs(q[2] - p[1]) <= 0.06), None)
            right = next((q for q in ps[i + 1:] if abs(q[1] - p[2]) <= 0.06), None)
            if left and right and p[3] < 0.7 * min(left[3], right[3]) and OPEN_MIN <= p[2] - p[1] <= OPEN_MAX:
                hints.append(p)
            else:
                walls.append(p)
    return walls, hints


def _cut_windows(walls: Dict[float, list], glass):
    """Finestre disegnate dentro un muro continuo (il vano chiuso da linee sul layer dei muri, il vetro su un
    layer di finestre): dove le linee del vetro corrono dentro lo spessore del muro, il muro si apre."""
    for c, ivs in walls.items():
        spans = []
        for gc, a, b in glass:
            for lo, hi, t in ivs:
                if abs(gc - c) <= t / 2 + 0.03 and min(b, hi) - max(a, lo) >= 0.3:
                    spans.append([max(a, lo), min(b, hi)])
        if not spans:
            continue
        spans.sort()
        merged = [spans[0]]
        for a, b in spans[1:]:
            if a <= merged[-1][1] + 0.05:
                merged[-1][1] = max(merged[-1][1], b)
            else:
                merged.append([a, b])
        out = []
        for lo, hi, t in ivs:
            cur = lo
            for a, b in merged:
                if b <= cur or a >= hi or b - a < OPEN_MIN:
                    continue
                if a - cur > 0.02:
                    out.append([cur, a, t])
                cur = max(cur, b)
            if hi - cur > 0.02:
                out.append([cur, hi, t])
        walls[c] = out
    return walls


def _merge(pieces):
    """Tratti sullo stesso asse uniti: {asse: [(inizio, fine, spessore)]} ordinati."""
    by: Dict[float, list] = {}
    for c, lo, hi, t in sorted(pieces, key=lambda p: (p[0], p[1])):
        key = next((kk for kk in by if abs(kk - c) <= AXIS_TOL), c)
        by.setdefault(key, []).append([lo, hi, t])
    out = {}
    for c, ivs in by.items():
        ivs.sort()
        merged = [ivs[0][:]]
        for lo, hi, t in ivs[1:]:
            if lo <= merged[-1][1] + 0.02:
                merged[-1][1] = max(merged[-1][1], hi)
                merged[-1][2] = max(merged[-1][2], t)
            else:
                merged.append([lo, hi, t])
        out[c] = merged
    return out


# ----------------------------------------------------------------------------
# 4. aperture
# ----------------------------------------------------------------------------
def _gaps(lines: Dict[float, list], cross: Dict[float, list]):
    """Interruzioni lungo gli assi: tra due tratti, o tra un tratto e la faccia del muro perpendicolare."""
    out = []
    for c, ivs in lines.items():
        t = sum(iv[2] for iv in ivs) / len(ivs)
        for (lo1, hi1, _), (lo2, hi2, _) in zip(ivs, ivs[1:]):
            g0, g1 = hi1, lo2
            if OPEN_MIN <= g1 - g0 <= OPEN_MAX and not _crossed(cross, c, t, g0, g1) \
                    and not (_passes(cross, c, g0) and _passes(cross, c, g1)):
                out.append((c, g0, g1, t))
        # estremi: un muro perpendicolare che taglia l'asse oltre la fine del primo / ultimo tratto
        # (porta vicino a un angolo); si tengono solo se il disegno mostra una porta o una finestra
        for end, sign in ((ivs[0][0], -1), (ivs[-1][1], 1)):
            face = _cross_face(cross, c, t, end, sign)
            if face is not None:
                g0, g1 = sorted((end, face))
                if OPEN_MIN <= g1 - g0 <= END_OPEN_MAX:
                    out.append((c, g0, g1, t, True))
    return [g if len(g) == 5 else (*g, False) for g in out]


def _passes(cross, c, end) -> bool:
    """All'estremo di un varco passa un muro perpendicolare che prosegue da entrambe le parti dell'asse?
    Se succede ai due estremi, il «varco» è un corridoio che attraversa la linea dei muri, non un'apertura."""
    for cc, ivs in cross.items():
        for lo, hi, tt in ivs:
            if abs(cc - end) <= tt / 2 + 0.12 and lo <= c - 0.3 and hi >= c + 0.3:
                return True
    return False


def _crossed(cross, c, t, g0, g1) -> bool:
    """Il vano è in realtà l'incrocio con un muro perpendicolare?"""
    for cc, ivs in cross.items():
        if g0 - 0.02 <= cc <= g1 + 0.02:
            for lo, hi, tt in ivs:
                if lo - 0.05 <= c <= hi + 0.05 and tt >= (g1 - g0) * 0.6:
                    return True
    return False


def _cross_face(cross, c, t, end, sign) -> Optional[float]:
    best = None
    for cc, ivs in cross.items():
        dist = (cc - end) * sign
        if dist <= 0 or dist > OPEN_MAX + 0.4:
            continue
        for lo, hi, tt in ivs:
            if lo - t <= c <= hi + t:
                face = cc - sign * tt / 2
                if (face - end) * sign > 0.02 and (best is None or abs(face - end) < abs(best - end)):
                    best = face
    return best


def _classify(gap, orient, arcs, boxes, wsegs, k, exterior: bool):
    """('door', lato dell'anta ±1) | ('window', 0) | ('passage', 0)."""
    c, g0, g1, t = gap
    w = g1 - g0
    if orient == "h":
        to_xy = lambda along, across: (along, across)
    else:
        to_xy = lambda along, across: (across, along)
    # arco dell'anta: raggio ≈ vano (o metà, porta a due ante), centro vicino a un estremo
    for cx, cy, r, a0, a1, role in arcs:
        if role == "ignore":
            continue
        cx, cy, r = cx * k, cy * k, r * k
        along, across = (cx, cy) if orient == "h" else (cy, cx)
        if not (abs(r - w) <= 0.2 * w + 0.05 or abs(r - w / 2) <= 0.12 * w + 0.05):
            continue
        if min(abs(along - g0), abs(along - g1)) > 0.3 or abs(across - c) > t / 2 + 0.3:
            continue
        mid = math.radians((a0 + ((a1 - a0) % 360) / 2))
        my = (cy + r * math.sin(mid)) if orient == "h" else (cx + r * math.cos(mid))
        return "door", (1 if my > c else -1)
    for x0, y0, x1, y1, role in boxes:
        x0, y0, x1, y1 = x0 * k, y0 * k, x1 * k, y1 * k
        lo, hi = (x0, x1) if orient == "h" else (y0, y1)
        a_lo, a_hi = (y0, y1) if orient == "h" else (x0, x1)
        if min(hi, g1) - max(lo, g0) >= w * 0.5 and a_lo - 0.3 <= c <= a_hi + 0.3:
            if role == "door":
                mid = (a_lo + a_hi) / 2
                return "door", (1 if mid > c else -1)
            return "window", 0
    # linee di finestra nel vano
    for x1, y1, x2, y2, role in wsegs:
        if role != "window":
            continue
        p = (x1 * k, y1 * k, x2 * k, y2 * k)
        along = (p[0], p[2]) if orient == "h" else (p[1], p[3])
        across = (p[1] + p[3]) / 2 if orient == "h" else (p[0] + p[2]) / 2
        if min(max(along), g1) - max(min(along), g0) >= w * 0.5 and abs(across - c) <= t / 2 + 0.1:
            return "window", 0
    return ("window", 0) if exterior else ("passage", 0)


# ----------------------------------------------------------------------------
# 5. locali
# ----------------------------------------------------------------------------
class Grid:
    def __init__(self, x0, y0, x1, y1, step):
        self.x0, self.y0, self.step = x0, y0, step
        self.nx, self.ny = int(math.ceil((x1 - x0) / step)) + 1, int(math.ceil((y1 - y0) / step)) + 1
        self.v = array("i", bytes(4 * self.nx * self.ny))   # 0 libero, 1 muro, 2 esterno, >=3 locale

    def ij(self, x, y):
        return int((x - self.x0) / self.step), int((y - self.y0) / self.step)

    def line(self, x1, y1, x2, y2, val):
        """Segmento qualsiasi (muri obliqui), spesso due celle."""
        n = int(math.hypot(x2 - x1, y2 - y1) / (self.step / 2)) + 1
        for s in range(n + 1):
            i, j = self.ij(x1 + (x2 - x1) * s / n, y1 + (y2 - y1) * s / n)
            for a, b in ((i, j), (i + 1, j), (i, j + 1)):
                if 0 <= a < self.nx and 0 <= b < self.ny:
                    self.v[b * self.nx + a] = val

    def fill_rect(self, x0, y0, x1, y1, val):
        i0, j0 = self.ij(x0, y0)
        i1, j1 = self.ij(x1, y1)
        for j in range(max(0, j0), min(self.ny, j1 + 1)):
            row = j * self.nx
            for i in range(max(0, i0), min(self.nx, i1 + 1)):
                self.v[row + i] = val

    def flood(self, seeds, val):
        q = deque()
        for i, j in seeds:
            k = j * self.nx + i
            if 0 <= i < self.nx and 0 <= j < self.ny and self.v[k] == 0:
                self.v[k] = val
                q.append((i, j))
        cells = []
        while q:
            i, j = q.popleft()
            cells.append((i, j))
            for a, b in ((i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)):
                if 0 <= a < self.nx and 0 <= b < self.ny and self.v[b * self.nx + a] == 0:
                    self.v[b * self.nx + a] = val
                    q.append((a, b))
        return cells


def _rects(cells, nx_off, ny_off):
    """Scompone un insieme di celle in rettangoli (il più grande per primo, finché resta superficie utile)."""
    left = set(cells)
    out = []
    while left:
        # rettangolo massimo (istogrammi per riga) sulle celle rimaste
        xs = [c[0] for c in left]
        ys = [c[1] for c in left]
        i0, i1, j0, j1 = min(xs), max(xs), min(ys), max(ys)
        w = i1 - i0 + 1
        heights = [0] * w
        best = (0, None)
        for j in range(j0, j1 + 1):
            for i in range(w):
                heights[i] = heights[i] + 1 if (i0 + i, j) in left else 0
            stack = []
            for i in range(w + 1):
                h = heights[i] if i < w else 0
                start = i
                while stack and stack[-1][1] >= h:
                    s, hh = stack.pop()
                    area = hh * (i - s)
                    if area > best[0]:
                        best = (area, (i0 + s, j - hh + 1, i0 + i - 1, j))
                    start = s
                stack.append((start, h))
        area, r = best
        if not r or area < 40:   # meno di 0,1 m² a 5 cm: resto trascurabile
            break
        out.append(r)
        for j in range(r[1], r[3] + 1):
            for i in range(r[0], r[2] + 1):
                left.discard((i, j))
    return out


def _name_room(texts_in: List[str], area: float):
    """(tipo, nome, dal testo?) dai testi nel locale, altrimenti dalla superficie; (None, None, True) se è esterno."""
    joined = " ".join(_plain(t) for t in texts_in)
    if OUTSIDE_WORDS.search(joined):
        return None, None, True
    if re.search(ROOM_WORDS[1][0], joined) and re.search(ROOM_WORDS[3][0], joined):
        return "living_kitchen", "Soggiorno con Cucina", True
    for pat, kind, name in ROOM_WORDS:
        if re.search(pat, joined):
            return kind, name, True
    if area <= 3.0:
        return "storage", "Ripostiglio", False
    if area <= 6.0:
        return "bath", "Bagno", False
    if area >= 20:
        return "living", "Soggiorno", False
    if area >= 9:
        return "bed", "Camera", False
    return "study", "Locale", False


def _drawings(hp, vp, texts_m):
    """Gruppi di muri vicini (entro 1,5 m): un file di progetto ha più piante, prospetti e sezioni.
    Restituisce i gruppi ordinati per punteggio (muri + nomi di locali dentro), ognuno con il suo ingombro."""
    rects = [(lo, c - t / 2, hi, c + t / 2) for c, lo, hi, t in hp] + [(c - t / 2, lo, c + t / 2, hi) for c, lo, hi, t in vp]
    parent = list(range(len(rects)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    cell, gap = 2.0, 1.5
    buckets: Dict[Tuple[int, int], list] = {}
    for i, (x0, y0, x1, y1) in enumerate(rects):
        for bx in range(int(math.floor((x0 - gap) / cell)), int(math.floor((x1 + gap) / cell)) + 1):
            for by in range(int(math.floor((y0 - gap) / cell)), int(math.floor((y1 + gap) / cell)) + 1):
                for j in buckets.get((bx, by), ()):
                    a, b = rects[j], rects[i]
                    if a[0] - gap <= b[2] and b[0] - gap <= a[2] and a[1] - gap <= b[3] and b[1] - gap <= a[3]:
                        parent[find(i)] = find(j)
                buckets.setdefault((bx, by), []).append(i)
    groups: Dict[int, list] = {}
    for i in range(len(rects)):
        groups.setdefault(find(i), []).append(i)
    out = []
    for idx in groups.values():
        x0 = min(rects[i][0] for i in idx); y0 = min(rects[i][1] for i in idx)
        x1 = max(rects[i][2] for i in idx); y1 = max(rects[i][3] for i in idx)
        if x1 - x0 < 2.5 or y1 - y0 < 2.5:
            continue
        names = sum(1 for x, y, txt in texts_m if x0 <= x <= x1 and y0 <= y <= y1
                    and any(re.search(p, _plain(txt)) for p, _, _ in ROOM_WORDS))
        out.append({"box": (x0, y0, x1, y1), "pieces": len(idx), "names": names, "score": len(idx) + 8 * names})
    return sorted(out, key=lambda g: -g["score"])


# ----------------------------------------------------------------------------
# procedura completa
# ----------------------------------------------------------------------------
def import_real_dxf(text: str, Layout, Opening, snap):
    """DXF di studio → planner.Layout con stanze, porte e finestre (non arredato), o None."""
    if ezdxf is None:
        return None
    data = _read(text)
    if not data:
        return None
    segs, arcs, texts, boxes, units = data
    k = _scale(units, segs)
    roles = {"wall"} if any(s[4] == "wall" for s in segs) else {"wall", "other"}
    # l'anta di una porta va dal centro dell'arco (cardine) a uno dei suoi estremi: non è un muro.
    # Indice dei cardini a celle di ~1 m, così ogni linea si confronta solo con gli archi vicini.
    cell = 1.0 / k
    hinges: Dict[Tuple[int, int], list] = {}
    for cx, cy, r, a0, a1, _ in arcs:
        ends = [(cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))) for a in (a0, a1)]
        hinges.setdefault((int(cx // cell), int(cy // cell)), []).append((cx, cy, r, ends))

    def leaf(s):
        x1, y1, x2, y2, _ = s
        for (hx, hy), (fx, fy) in (((x1, y1), (x2, y2)), ((x2, y2), (x1, y1))):
            bx, by = int(hx // cell), int(hy // cell)
            for i in (bx - 1, bx, bx + 1):
                for j in (by - 1, by, by + 1):
                    for cx, cy, r, ends in hinges.get((i, j), ()):
                        if math.hypot(hx - cx, hy - cy) <= 0.05 * r and \
                                min(math.hypot(fx - ex, fy - ey) for ex, ey in ends) <= 0.1 * r:
                            return True
        return False
    wall_segs = [s for s in segs if s[4] in roles and not leaf(s)] if hinges else segs
    hs, vs, slanted = _axis_segments(wall_segs, k, roles)
    hp, hh = _split_infill(_pair_walls(hs))
    vp, vh = _split_infill(_pair_walls(vs))
    # più disegni nello stesso file (piani, prospetti, sezioni): si importa la pianta più ricca di muri e nomi
    others = []
    groups = _drawings(hp, vp, [(x * k, y * k, t) for x, y, t in texts])
    if len(groups) > 1:
        bx0, by0, bx1, by1 = groups[0]["box"]
        keep = lambda x0, y0, x1, y1: x0 >= bx0 - 1 and x1 <= bx1 + 1 and y0 >= by0 - 1 and y1 <= by1 + 1
        hp = [p for p in hp if keep(p[1], p[0], p[2], p[0])]
        vp = [p for p in vp if keep(p[0], p[1], p[0], p[2])]
        hh = [p for p in hh if keep(p[1], p[0], p[2], p[0])]
        vh = [p for p in vh if keep(p[0], p[1], p[0], p[2])]
        inside = lambda x, y: bx0 - 1 <= x * k <= bx1 + 1 and by0 - 1 <= y * k <= by1 + 1
        texts = [t for t in texts if inside(t[0], t[1])]
        arcs = [a for a in arcs if inside(a[0], a[1])]
        boxes = [b for b in boxes if inside((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)]
        segs = [sg for sg in segs if inside(sg[0], sg[1]) or inside(sg[2], sg[3])]
        others = [g for g in groups[1:] if g["names"] >= 2 or g["pieces"] >= groups[0]["pieces"] * 0.4]
    hwalls, vwalls = _merge(hp), _merge(vp)     # asse → tratti [inizio, fine, spessore]
    whs, wvs, _ = _axis_segments([sg for sg in segs if sg[4] == "window"], k, {"window"})
    hwalls, vwalls = _cut_windows(hwalls, whs), _cut_windows(vwalls, wvs)

    # linee lunghe sul layer dei muri rimaste senza coppia (muri a linea singola, recinzioni, l'altra faccia
    # su un layer di travi…): non diventano muri della pianta, ma separano i locali dall'esterno
    def lonely(lines, walls_by_axis):
        out = []
        for c, a, b in lines:
            if b - a < 0.8:
                continue
            covered = 0.0
            for cc, ivs in walls_by_axis.items():
                if abs(cc - c) <= T_MAX / 2 + 0.01:
                    covered += sum(max(0.0, min(b, hi) - max(a, lo)) for lo, hi, _ in ivs)
            if covered < (b - a) * 0.5:
                out.append((c, a, b))
        return out
    h_single = lonely(hs, hwalls) if groups else []
    v_single = lonely(vs, vwalls) if groups else []
    if len(groups) > 1:
        bx0, by0, bx1, by1 = groups[0]["box"]
        h_single = [l for l in h_single if bx0 - 1 <= l[1] and l[2] <= bx1 + 1 and by0 - 1 <= l[0] <= by1 + 1]
        slanted = [l for l in slanted if bx0 - 1 <= min(l[0], l[2]) and max(l[0], l[2]) <= bx1 + 1
                   and by0 - 1 <= min(l[1], l[3]) and max(l[1], l[3]) <= by1 + 1]
        v_single = [l for l in v_single if by0 - 1 <= l[1] and l[2] <= by1 + 1 and bx0 - 1 <= l[0] <= bx1 + 1]
    # le linee di vetro diventano indizi di finestra (ingombri in unità del disegno, come quelli dei blocchi)
    for c, lo, hi, t in hh:
        boxes.append((lo / k, (c - t) / k, hi / k, (c + t) / k, "window"))
    for c, lo, hi, t in vh:
        boxes.append(((c - t) / k, lo / k, (c + t) / k, hi / k, "window"))
    n_pieces = sum(len(v) for v in hwalls.values()) + sum(len(v) for v in vwalls.values())
    if n_pieces < 4:
        return None

    # ingombro dei muri
    xs = [lo for ivs in hwalls.values() for lo, _, _ in ivs] + [hi for ivs in hwalls.values() for _, hi, _ in ivs] + list(vwalls)
    ys = list(hwalls) + [lo for ivs in vwalls.values() for lo, _, _ in ivs] + [hi for ivs in vwalls.values() for _, hi, _ in ivs]
    X0, X1, Y0, Y1 = min(xs), max(xs), min(ys), max(ys)
    if X1 - X0 > 80 or Y1 - Y0 > 80 or X1 - X0 < 2 or Y1 - Y0 < 2:
        return None

    # aperture: quelle all'estremità di un muro valgono subito solo con un indizio (arco, blocco, vetro)
    all_gaps, gaps = [], []
    # anche i muri a linea singola chiudono un'apertura che arriva fino a loro
    hcross = {c: list(ivs) for c, ivs in hwalls.items()}
    vcross = {c: list(ivs) for c, ivs in vwalls.items()}
    for c, a, b in h_single:
        hcross.setdefault(c, []).append([a, b, 0.02])
    for c, a, b in v_single:
        vcross.setdefault(c, []).append([a, b, 0.02])
    for orient, g in [("h", g) for g in _gaps(hwalls, vcross)] + [("v", g) for g in _gaps(vwalls, hcross)]:
        c, g0, g1, t, at_end = g
        all_gaps.append((orient, (c, g0, g1, t)))
        # senza un indizio (arco, blocco, vetro) chiude i locali solo un varco tra due tratti largo come una porta
        # (spesso il simbolo c'è ma non si aggancia); la fine di un muro dentro un locale o un passaggio più largo
        # (un corridoio che attraversa) restano aperti. Se poi l'esterno entra da lì, li chiude la seconda passata.
        if (at_end or g1 - g0 > DOOR_LIKE) and \
                _classify((c, g0, g1, t), orient, arcs, boxes, segs, k, False)[0] == "passage":
            continue
        gaps.append((orient, (c, g0, g1, t)))

    # griglia: muri e aperture chiusi, esterno dal bordo, zone libere rimaste = locali
    step = 0.05 if max(X1 - X0, Y1 - Y0) <= 30 else 0.1

    def partition(closed):
        grid = Grid(X0 - 1, Y0 - 1, X1 + 1, Y1 + 1, step)
        for c, ivs in hwalls.items():
            for lo, hi, t in ivs:
                grid.fill_rect(lo - step, c - t / 2 - step / 2, hi + step, c + t / 2 + step / 2, 1)
        for c, ivs in vwalls.items():
            for lo, hi, t in ivs:
                grid.fill_rect(c - t / 2 - step / 2, lo - step, c + t / 2 + step / 2, hi + step, 1)
        for x1, y1, x2, y2 in slanted:
            grid.line(x1, y1, x2, y2, 1)
        for c, a, b in h_single:
            grid.fill_rect(a, c - step / 2, b, c + step / 2, 1)
        for c, a, b in v_single:
            grid.fill_rect(c - step / 2, a, c + step / 2, b, 1)
        for o, (c, g0, g1, t) in closed:
            if o == "h":
                grid.fill_rect(g0, c - t / 2, g1, c + t / 2, 1)
            else:
                grid.fill_rect(c - t / 2, g0, c + t / 2, g1, 1)
        border = [(i, 0) for i in range(grid.nx)] + [(i, grid.ny - 1) for i in range(grid.nx)] + \
                 [(0, j) for j in range(grid.ny)] + [(grid.nx - 1, j) for j in range(grid.ny)]
        grid.flood(border, 2)
        comps, label = [], 3
        for j in range(grid.ny):
            for i in range(grid.nx):
                if grid.v[j * grid.nx + i] == 0:
                    cells = grid.flood([(i, j)], label)
                    if len(cells) * step * step >= 1.0:
                        comps.append(cells)
                    label += 1
        return grid, comps

    named = [(x * k, y * k) for x, y, t in texts
             if any(re.search(p, _plain(t)) for p, _, _ in ROOM_WORDS) and not OUTSIDE_WORDS.search(_plain(t))]
    grid, comps = partition(gaps)
    # un locale con il nome finito «fuori»: l'esterno entra da un'apertura senza porta né finestra disegnata
    # (es. verso il portico). Si chiudono anche quelle e si tengono le zone con un nome o già interne prima,
    # così i pezzi di giardino tra la casa e la recinzione non diventano locali.
    leaked = [p for p in named if grid.v[grid.ij(*p)[1] * grid.nx + grid.ij(*p)[0]] == 2]
    if leaked and len(all_gaps) > len(gaps):
        before = grid

        def keep_indoor(grid, comps2):
            """Zone da tenere: con un nome, già interne nella prima passata, o dentro l'ingombro dei locali con
            un nome; le altre sono giardino (tra casa e recinzione). Restituisce anche le etichette scartate."""
            name_cells = {grid.ij(*p) for p in named}
            with_name = [c for c in comps2 if any(cell in name_cells for cell in c)]
            ci = [i for c in with_name for i, _ in c]
            cj = [j for c in with_name for _, j in c]
            pad = int(0.3 / step)
            box = (min(ci) - pad, min(cj) - pad, max(ci) + pad, max(cj) + pad) if ci else None

            def indoor(c):
                if c in with_name or not any(before.v[j * before.nx + i] == 2 for i, j in c[:: max(1, len(c) // 200)]):
                    return True
                return box is not None and all(box[0] <= i <= box[2] and box[1] <= j <= box[3] for i, j in c)
            kept = [c for c in comps2 if indoor(c)]
            dropped = {grid.v[c[0][1] * grid.nx + c[0][0]] for c in comps2 if not indoor(c)}
            return kept, dropped

        grid, comps2 = partition(all_gaps)
        comps, dropped = keep_indoor(grid, comps2)
        # le chiusure in più servono solo dove separano un locale dall'esterno o dal giardino: le altre (es. un
        # muretto che finisce a metà corridoio) spezzerebbero un locale in pezzi troppo piccoli, e si riaprono
        extra = [g for g in all_gaps if g not in gaps]

        def needed(o, c, g0, g1, t):
            m, off = (g0 + g1) / 2, t / 2 + 2 * step
            pts = [(m, c - off), (m, c + off)] if o == "h" else [(c - off, m), (c + off, m)]
            vals = [grid.v[j * grid.nx + i] for i, j in (grid.ij(*q) for q in pts)
                    if 0 <= i < grid.nx and 0 <= j < grid.ny]
            return any(v == 2 or v in dropped for v in vals)
        keep_extra = [(o, g) for o, g in extra if needed(o, *g)]
        if len(keep_extra) < len(extra):
            grid, comps2 = partition(gaps + keep_extra)
            comps, _ = keep_indoor(grid, comps2)
        gaps = gaps + keep_extra
    if DEBUG_GRID:
        DEBUG_GRID.append(grid)
    if not comps:
        return None

    # assi dei muri per portare i lati dei locali sulla mezzeria
    def snap_edge(v, axes, lo, hi, side):
        """Lato del locale (faccia interna) → asse del muro accanto, se c'è un muro su quel lato."""
        best = None
        for c, ivs in axes.items():
            for a, b, t in ivs:
                if a - 0.1 <= hi and b + 0.1 >= lo and abs((c - side * t / 2) - v) <= 0.12:
                    if best is None or abs(c - v) < abs(best - v):
                        best = c
        return best if best is not None else v

    rooms = []   # (x0, y0, x1, y1, gruppo, testi) in metri, y verso l'alto
    tpts = [(x * k, y * k, s) for x, y, s in texts]
    for gid, cells in enumerate(comps, 1):
        cellset = set(cells)
        inside = [(grid.ij(x, y), s) for x, y, s in tpts if grid.ij(x, y) in cellset]
        pieces = _rects(cells, 0, 0)
        own = lambda r: [s for (i, j), s in inside if r[0] <= i <= r[2] and r[1] <= j <= r[3]]
        # testi caduti fuori da ogni rettangolo (negli scarti della scomposizione): al pezzo principale
        stray = [s for (i, j), s in inside if not any(r[0] <= i <= r[2] and r[1] <= j <= r[3] for r in pieces)]
        for n, (i0, j0, i1, j1) in enumerate(pieces):
            x0, y0 = grid.x0 + i0 * step, grid.y0 + j0 * step
            x1, y1 = grid.x0 + (i1 + 1) * step, grid.y0 + (j1 + 1) * step
            mine = own((i0, j0, i1, j1)) + (stray if n == 0 else [])
            x0 = snap_edge(x0, vwalls, y0, y1, -1)
            x1 = snap_edge(x1, vwalls, y0, y1, 1)
            y0 = snap_edge(y0, hwalls, x0, x1, -1)
            y1 = snap_edge(y1, hwalls, x0, x1, 1)
            if (x1 - x0) * (y1 - y0) < 0.8 and n:
                continue
            rooms.append([x0, y0, x1, y1, gid, mine, n])

    # pezzi dello stesso locale (L, T): il lato aperto tocca esattamente il pezzo accanto
    for r in rooms:
        for q in rooms:
            if q is r or q[4] != r[4] or r[6] <= q[6]:   # si muove il pezzo minore verso quello più grande
                continue
            for i, opp in ((0, 2), (2, 0), (1, 3), (3, 1)):
                if abs(r[i] - q[opp]) <= 0.15:
                    r[i] = q[opp]
    # aggancio dei lati vicini (2 cm) perché i locali confinanti condividano lo stesso bordo
    for idx in (0, 2, 1, 3):
        vals = sorted({r[idx] for r in rooms} | {r[idx ^ 2] for r in rooms})
        for r in rooms:
            for v in vals:
                if abs(r[idx] - v) <= 0.03:
                    r[idx] = v
                    break

    # Layout del motore: origine in alto a sinistra, y verso il basso
    RX0 = min(r[0] for r in rooms)
    RY1 = max(r[3] for r in rooms)
    W = max(r[2] for r in rooms) - RX0
    L = RY1 - min(r[1] for r in rooms)
    lay = Layout(round(W, 3), round(L, 3))
    lay.shape = "rect"
    counts: Dict[str, int] = {}
    group_room: Dict[int, int] = {}
    outside = guessed = 0
    for x0, y0, x1, y1, gid, inside, n in sorted(rooms, key=lambda r: (r[6], -(r[2] - r[0]) * (r[3] - r[1]))):
        area = (x1 - x0) * (y1 - y0)
        if n == 0:
            kind, name, named = _name_room(inside, area)
            guessed += not named
            if kind is None:
                outside += 1
                group_room[gid] = -1
                continue
            counts[name] = counts.get(name, 0) + 1
            if counts[name] > 1:
                name = f"{name} {counts[name]}"
            room = lay.add_room(name, kind, x0 - RX0, RY1 - y1, x1 - RX0, RY1 - y0,
                                size=("double" if "Matrimoniale" in name or (kind == "bed" and area >= 12) else
                                      "single" if kind == "bed" else ""))
            group_room[gid] = room.id
        else:
            main = group_room.get(gid)
            if main in (None, -1):
                continue
            # pezzo di un locale aperto (soggiorno a L, zona giorno con cucina e pranzo): col suo nome se ne ha uno
            kind, name, named = _name_room(inside, area) if inside else (None, None, False)
            if not named or kind is None:
                kind, name = "corridor", ""
            else:
                counts[name] = counts.get(name, 0) + 1
                if counts[name] > 1:
                    name = f"{name} {counts[name]}"
            lay.add_room(name, kind, x0 - RX0, RY1 - y1, x1 - RX0, RY1 - y0, group=lay.room(main).group)

    # porte e finestre sugli assi (coordinate del layout)
    def room_at(px, py):
        for r in lay.rooms:
            q = r.rect
            if q.x - 1e-6 <= px <= q.x2 + 1e-6 and q.y - 1e-6 <= py <= q.y2 + 1e-6:
                return r
        return None

    def edge_line(orient, line):
        vals = {round(v, 3) for r in lay.rooms for v in ((r.rect.y, r.rect.y2) if orient == "h" else (r.rect.x, r.rect.x2))}
        near = min(vals, key=lambda v: abs(v - line)) if vals else line
        return near if abs(near - line) <= 0.2 else line

    n_doors = n_win = n_pass = 0
    for orient, (c, g0, g1, t) in gaps:
        if orient == "h":
            line, start = RY1 - c, g0 - RX0
            mid = (start + (g1 - g0) / 2, line)
            pa, pb = (mid[0], line - t / 2 - 0.15), (mid[0], line + t / 2 + 0.15)
        else:
            line, start = c - RX0, RY1 - g1
            mid = (line, start + (g1 - g0) / 2)
            pa, pb = (line - t / 2 - 0.15, mid[1]), (line + t / 2 + 0.15, mid[1])
        ra, rb = room_at(*pa), room_at(*pb)
        if ra is None and rb is None:
            continue
        if ra is not None and rb is not None and ra.group == rb.group:
            continue   # vano interno allo stesso locale
        exterior = ra is None or rb is None
        kind, side = _classify((c, g0, g1, t), orient, arcs, boxes, segs, k, exterior)
        line = edge_line(orient, line)
        w = round(g1 - g0, 3)
        start = round(start, 3)
        inner_room = ra or rb
        if kind == "window":
            if not exterior:
                kind = "passage"
            else:
                lay.windows.append(Opening(orient, line, start, w, inner_room.id, None))
                n_win += 1
                continue
        # porta (o passaggio senza anta, trattato come porta): verso l'anta → locale da quel lato
        a_id, b_id = (ra.id if ra else None), (rb.id if rb else None)
        if exterior:
            a_id, b_id = inner_room.id, None
            into = inner_room.id
        else:
            # nel DXF y cresce verso l'alto, nel layout verso il basso: lato +1 (y maggiore) = sopra = ra per 'h'
            if orient == "h":
                into = ra.id if side > 0 else rb.id
            else:
                into = rb.id if side > 0 else ra.id
            if kind == "passage":
                into = rb.id
        lay.doors.append(Opening(orient, line, start, w, a_id, b_id, into))
        if kind == "door":
            n_doors += 1
        else:
            n_pass += 1

    if not lay.rooms:
        return None
    thick = sorted(t for d in (hwalls, vwalls) for ivs in d.values() for _, _, t in ivs)
    msg = (f"Pianta importata dal DXF: {len(lay.rooms)} locali, {n_doors} porte"
           f"{f', {n_pass} passaggi' if n_pass else ''}, {n_win} finestre riconosciute dal disegno.")
    lay.notes.append(msg)
    if thick:
        lay.notes.append(f"Muri del disegno da {thick[0] * 100:.0f} a {thick[-1] * 100:.0f} cm: nella pianta hanno lo spessore "
                         "standard di 20 cm, centrati sull'asse del muro originale.")
    if slanted:
        lay.notes.append(f"{len(slanted)} tratti di muro obliqui usati solo per separare i locali: la pianta ha muri "
                         "orizzontali e verticali, quindi lì il muro non compare.")
    if others:
        lay.notes.append(f"Il file contiene altri {len(others)} disegni simili a una pianta (altri piani, prospetti o sezioni): "
                         "importata la pianta con più muri e nomi di locali.")
    if outside:
        lay.notes.append(f"{outside} spazi esterni (balconi, terrazzi) esclusi dai locali.")
    if guessed:
        lay.notes.append(f"{guessed} locali senza nome nel disegno: tipo stimato dalla superficie, modificabile dal pannello del locale.")
    return lay
