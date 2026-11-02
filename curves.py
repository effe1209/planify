"""
Muri curvi nel motore: facciata ad arco (bow) applicata a una pianta finita.

La pianta generata ha solo stanze rettangolari e muri orizzontali e verticali. Qui una facciata (N, S, E o O) diventa un arco di
cerchio che sporge verso l'esterno di `bulge` metri (la freccia dell'arco):
- le stanze che toccano la facciata prendono un contorno libero (`poly`) con l'arco al posto del lato dritto;
- il muro dritto della facciata sparisce e al suo posto c'è una polilinea (`wallLines`) lungo l'arco, interrotta dove c'è un'apertura;
- i tramezzi che arrivano alla facciata si allungano fino all'arco;
- porte e finestre della facciata si spostano sull'arco, ruotate lungo la tangente (`rot` qualsiasi, come negli schizzi);
- il riquadro cresce di `bulge` (per N e O la pianta intera scorre di `bulge`, così non c'è nulla di negativo).
Arredi, scale e soppalco non cambiano: l'arco aggiunge spazio, non ne toglie.
"""
import math
from typing import List, Optional, Tuple

EPS = 1e-3
STEP = 0.12            # lunghezza massima di un tratto dell'arco (m)
SKIP_KEYS = ("design", "stats", "notes")


def _sag(span: float, bulge: float) -> Tuple[float, float]:
    """Raggio dell'arco e distanza del centro dalla corda."""
    r = (span * span / 4 + bulge * bulge) / (2 * bulge)
    return r, r - bulge


def arc_h(s: float, span: float, bulge: float) -> float:
    """Altezza dell'arco sopra la corda alla distanza s dall'inizio (0 agli estremi, `bulge` a metà)."""
    r, d = _sag(span, bulge)
    return math.sqrt(max(0.0, r * r - (s - span / 2) ** 2)) - d


def arc_slope(s: float, span: float, bulge: float) -> float:
    r, _ = _sag(span, bulge)
    q = math.sqrt(max(1e-9, r * r - (s - span / 2) ** 2))
    return -(s - span / 2) / q


def _shift(node, dx: float, dy: float, key: str = ""):
    """Sposta tutte le coordinate della pianta (rettangoli x/y, punti di contorni e polilinee)."""
    if isinstance(node, dict):
        if "x" in node and "y" in node and isinstance(node["x"], (int, float)):
            node["x"] = round(node["x"] + dx, 3)
            node["y"] = round(node["y"] + dy, 3)
        for k, v in node.items():
            if k in SKIP_KEYS or k in ("x", "y"):
                continue
            _shift(v, dx, dy, k)
    elif isinstance(node, list):
        if key in ("poly", "pts", "label") and node and isinstance(node[0], (list, tuple)):
            for i, p in enumerate(node):
                node[i] = [round(p[0] + dx, 3), round(p[1] + dy, 3)]
        elif key == "label" and len(node) == 2 and all(isinstance(v, (int, float)) for v in node):
            node[0], node[1] = round(node[0] + dx, 3), round(node[1] + dy, 3)
        else:
            for v in node:
                _shift(v, dx, dy, key)


def _area(poly: List[List[float]]) -> float:
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(poly, poly[1:] + poly[:1]))) / 2


def bow_facade(plan: dict, side: str, bulge: float, flat: bool = False) -> dict:
    """Facciata ad arco: vedi il modulo. `plan` si modifica sul posto e si ritorna. Senza effetto se la misura non è plausibile.
    flat = solo lo scorrimento e il riquadro più grande, senza arco: per i piani sotto (garage) che devono restare allineati agli altri."""
    side = (side or "").upper()
    dims = plan.get("dimensions") or {}
    W, L = float(dims.get("width", 0)), float(dims.get("length", 0))
    t = float(plan.get("wallThickness", 10)) / float(plan.get("scale", 50) or 50)
    if side not in ("N", "S", "E", "W") or W <= 0 or L <= 0 or plan.get("curve"):
        return plan
    span = W if side in "NS" else L
    b = max(0.0, min(float(bulge or 0), 0.4 * span, 3.0))
    if b < 0.2 or span < 3.0:
        return plan
    dir_ = 1 if side in "SE" else -1
    # il riquadro cresce di b; N e O: tutto scorre di b perché l'arco sporge a coordinate minori
    dx = b if side == "W" else 0.0
    dy = b if side == "N" else 0.0
    if dx or dy:
        _shift(plan, dx, dy)
    if side in "NS":
        plan["dimensions"] = {**dims, "length": round(L + b, 3)}
        F = L if side == "S" else b                     # facciata (faccia esterna del muro), dopo lo scorrimento
    else:
        plan["dimensions"] = {**dims, "width": round(W + b, 3)}
        F = W if side == "E" else b
    sc = float(plan.get("scale", 50))
    plan["svgWidth"], plan["svgHeight"] = plan["dimensions"]["width"] * sc, plan["dimensions"]["length"] * sc
    if isinstance(plan.get("stats"), dict):
        plan["stats"]["boundingBox"] = round(plan["dimensions"]["width"] * plan["dimensions"]["length"], 2)
    if flat:
        return plan
    Fc = F - dir_ * t / 2                                # linea centrale del muro curvo, prima dell'arco

    def point(s: float):
        h = arc_h(s, span, b)
        return [round(s, 3), round(F + dir_ * h, 3)] if side in "NS" else [round(F + dir_ * h, 3), round(s, 3)]

    def centre(s: float):
        h = arc_h(s, span, b)
        return (s, Fc + dir_ * h) if side in "NS" else (Fc + dir_ * h, s)

    def arc_pts(a0: float, a1: float):
        n = max(2, int(math.ceil((a1 - a0) / STEP)) + 1)
        return [point(a0 + (a1 - a0) * i / (n - 1)) for i in range(n)]

    # stanze che toccano la facciata: contorno con l'arco
    for r in plan.get("rooms", []):
        if r.get("poly"):
            continue
        x, y, w, h = r["x"], r["y"], r["w"], r["h"]
        touch = {"S": abs(y + h - F) < EPS, "N": abs(y - F) < EPS, "E": abs(x + w - F) < EPS, "W": abs(x - F) < EPS}[side]
        if not touch:
            continue
        a0, a1 = (x, x + w) if side in "NS" else (y, y + h)
        arc = arc_pts(a0, a1)[::-1]
        base = {"S": [[x, y], [x + w, y]], "N": [[x, y + h], [x + w, y + h]],
                "E": [[x, y], [x, y + h]], "W": [[x + w, y], [x + w, y + h]]}[side]
        poly = [[round(p[0], 3), round(p[1], 3)] for p in base] + arc
        xs, ys = [p[0] for p in poly], [p[1] for p in poly]
        r["label"] = [round(x + w / 2, 3), round(y + h / 2, 3)]
        r["poly"] = poly
        r["x"], r["y"] = round(min(xs), 3), round(min(ys), 3)
        r["w"], r["h"] = round(max(xs) - min(xs), 3), round(max(ys) - min(ys), 3)
        r["area"] = round(_area(poly), 2)
    if isinstance(plan.get("stats"), dict):
        plan["stats"]["grossArea"] = round(sum(r.get("area", r["w"] * r["h"]) for r in plan.get("rooms", [])), 2)

    # muri: via quello dritto della facciata, i tramezzi che ci arrivano si allungano fino all'arco
    walls = []
    for w in plan.get("walls", []):
        x, y, ww, hh = w["x"], w["y"], w["w"], w["h"]
        horiz = ww >= hh
        if side in "NS" and horiz and abs((y + hh if side == "S" else y) - F) < EPS:
            continue
        if side in "EW" and not horiz and abs((x + ww if side == "E" else x) - F) < EPS:
            continue
        if side == "S" and not horiz and abs(y + hh - F) < EPS:
            w = {**w, "h": round(hh + arc_h(x + ww / 2, span, b), 3)}
        elif side == "N" and not horiz and abs(y - F) < EPS:
            ext = arc_h(x + ww / 2, span, b)
            w = {**w, "y": round(y - ext, 3), "h": round(hh + ext, 3)}
        elif side == "E" and horiz and abs(x + ww - F) < EPS:
            w = {**w, "w": round(ww + arc_h(y + hh / 2, span, b), 3)}
        elif side == "W" and horiz and abs(x - F) < EPS:
            ext = arc_h(y + hh / 2, span, b)
            w = {**w, "x": round(x - ext, 3), "w": round(ww + ext, 3)}
        walls.append(w)
    plan["walls"] = walls

    # aperture della facciata: sull'arco, lungo la tangente
    gaps: List[Tuple[float, float]] = []

    def on_facade(o: dict) -> bool:
        rot = o.get("rot", 0)
        if side in "NS" and rot == 0:
            return abs(o["y"] + (t if side == "S" else 0) - F) < 0.05 and o.get("kind") not in ("garage", "gate")
        if side in "EW" and rot == 90:
            return abs(o["x"] - (F if side == "E" else F + t)) < 0.05 and o.get("kind") not in ("garage", "gate")
        return False

    for key in ("doors", "windows"):
        for o in plan.get(key, []):
            if not on_facade(o):
                continue
            wdt = float(o["w"])
            s_c = (o["x"] if side in "NS" else o["y"]) + wdt / 2
            s_c = max(wdt / 2, min(span - wdt / 2, s_c))
            m = arc_slope(s_c, span, b)
            tx, ty = {"S": (1.0, m), "N": (1.0, -m), "E": (m, 1.0), "W": (-m, 1.0)}[side]
            n_ = math.hypot(tx, ty)
            ux, uy = tx / n_, ty / n_
            cx, cy = centre(s_c)
            nx, ny = -uy, ux
            o["x"] = round(cx - ux * wdt / 2 - nx * t / 2, 3)
            o["y"] = round(cy - uy * wdt / 2 - ny * t / 2, 3)
            o["rot"] = round(math.degrees(math.atan2(uy, ux)), 2)
            half = wdt * abs(ux if side in "NS" else uy) / 2
            gaps.append((s_c - half, s_c + half))

    # muro curvo: una polilinea per ogni tratto tra due aperture
    gaps.sort()
    cuts, cur = [], 0.0
    for g0, g1 in gaps:
        if g0 > cur + 0.02:
            cuts.append((cur, g0))
        cur = max(cur, g1)
    if span - cur > 0.02:
        cuts.append((cur, span))
    lines = []
    for a0, a1 in cuts:
        n = max(2, int(math.ceil((a1 - a0) / STEP)) + 1)
        lines.append({"pts": [[round(centre(a0 + (a1 - a0) * i / (n - 1))[0], 3), round(centre(a0 + (a1 - a0) * i / (n - 1))[1], 3)]
                              for i in range(n)], "closed": False})
    plan["wallLines"] = list(plan.get("wallLines") or []) + lines
    plan["curve"] = {"type": "facade", "side": side, "bulge": round(b, 2)}
    plan["notes"] = list(plan.get("notes") or []) + [
        f"Facciata {'nord' if side == 'N' else 'sud' if side == 'S' else 'est' if side == 'E' else 'ovest'} ad arco: "
        f"freccia di {b:.1f} m sulla corda di {span:.1f} m.".replace(".", ",")]
    return plan
