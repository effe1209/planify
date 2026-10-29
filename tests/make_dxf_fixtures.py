"""Genera DXF di prova disegnati «come in uno studio»: muri a doppia linea, porte e finestre come blocchi o a mano.

    python tests/make_dxf_fixtures.py      → tests/fixtures/appartamento_cm.dxf, appartamento_mm_layer0.dxf
"""
import math
import os

import ezdxf

HERE = os.path.join(os.path.dirname(__file__), "fixtures")


def draw(path, rooms, openings, *, unit=100.0, insunits=5, layers=True, blocks=True, texts=None, ext=0.3, inner=0.1, skip=()):
    """rooms: rettangoli sugli assi dei muri (m, y verso l'alto); openings: (tipo, orient, asse, inizio, larghezza, verso)."""
    doc = ezdxf.new("R2010")
    doc.header["$INSUNITS"] = insunits
    msp = doc.modelspace()
    L = (lambda name: name) if layers else (lambda name: "0")
    for name in ("MURI", "PORTE", "FINESTRE", "TESTI", "QUOTE", "CAMPITURE", "ARREDI"):
        if layers:
            doc.layers.add(name)
    u = lambda v: v * unit

    # muri: ogni lato dei rettangoli è un tratto di muro; esterno se sul perimetro
    xs = [v for r in rooms for v in (r[0], r[2])]
    ys = [v for r in rooms for v in (r[1], r[3])]
    X0, X1, Y0, Y1 = min(xs), max(xs), min(ys), max(ys)
    segs = set()
    for x0, y0, x1, y1 in rooms:
        segs |= {("h", y0, x0, x1), ("h", y1, x0, x1), ("v", x0, y0, y1), ("v", x1, y0, y1)}
    # unisci i tratti collineari
    merged = {}
    for o, c, a, b in segs:
        merged.setdefault((o, round(c, 3)), []).append((a, b))
    walls = []
    for (o, c), ivs in merged.items():
        ivs.sort()
        cur = list(ivs[0])
        for a, b in ivs[1:]:
            if a <= cur[1] + 1e-6:
                cur[1] = max(cur[1], b)
            else:
                walls.append((o, c, *cur))
                cur = [a, b]
        walls.append((o, c, *cur))
    # tratti senza muro (locali aperti, es. soggiorno a L)
    for so, sc, sa, sb in skip:
        out = []
        for o, c, a, b in walls:
            if o == so and abs(c - sc) < 1e-6 and a < sb and sa < b:
                if a < sa:
                    out.append((o, c, a, sa))
                if sb < b:
                    out.append((o, c, sb, b))
            else:
                out.append((o, c, a, b))
        walls = out

    def thick(o, c):
        return ext if (o == "h" and c in (Y0, Y1)) or (o == "v" and c in (X0, X1)) else inner

    for o, c, a, b in walls:
        t = thick(o, c)
        # estremi estesi fino alla faccia del muro perpendicolare (giunzioni come in un disegno vero)
        a2, b2 = a - (ext / 2 if a in ((X0, Y0)[o == "v"],) else inner / 2), b + (ext / 2 if b in ((X1, Y1)[o == "v"],) else inner / 2)
        cuts = sorted((s, s + w) for k, oo, cc, s, w, _ in openings if oo == o and abs(cc - c) < 1e-6)
        pieces, cur = [], a2
        for s, e in cuts:
            pieces.append((cur, s))
            cur = e
        pieces.append((cur, b2))
        for p0, p1 in pieces:
            if p1 - p0 < 1e-6:
                continue
            for side in (-1, 1):
                d = c + side * t / 2
                if o == "h":
                    msp.add_line((u(p0), u(d)), (u(p1), u(d)), dxfattribs={"layer": L("MURI")})
                else:
                    msp.add_line((u(d), u(p0)), (u(d), u(p1)), dxfattribs={"layer": L("MURI")})
        for s, e in cuts:   # spallette
            for v in (s, e):
                if o == "h":
                    msp.add_line((u(v), u(c - t / 2)), (u(v), u(c + t / 2)), dxfattribs={"layer": L("MURI")})
                else:
                    msp.add_line((u(c - t / 2), u(v)), (u(c + t / 2), u(v)), dxfattribs={"layer": L("MURI")})
        # campitura dei muri (sul suo layer, da ignorare)
        if layers:
            for p0, p1 in pieces:
                if p1 - p0 > 0.05:
                    h = msp.add_hatch(dxfattribs={"layer": "CAMPITURE"})
                    if o == "h":
                        h.paths.add_polyline_path([(u(p0), u(c - t / 2)), (u(p1), u(c - t / 2)), (u(p1), u(c + t / 2)), (u(p0), u(c + t / 2))])
                    else:
                        h.paths.add_polyline_path([(u(c - t / 2), u(p0)), (u(c + t / 2), u(p0)), (u(c + t / 2), u(p1)), (u(c - t / 2), u(p1))])

    # blocchi porta (anta + arco, larghezza 1 unità di disegno scalata) e finestra (3 linee)
    if blocks:
        bp = doc.blocks.new("PORTA")
        bp.add_line((0, 0), (0, 1))
        bp.add_arc((0, 0), 1, 0, 90)
        bf = doc.blocks.new("FINESTRA")
        for f in (0.0, 0.5, 1.0):
            bf.add_line((0, f), (1, f))
    for k, o, c, s, w, side in openings:
        t = thick(o, c)
        if k == "door":
            # cardine sull'inizio del vano, anta che apre verso `side` (+1 su, -1 giù / destra, sinistra)
            hx, hy = (s, c + side * t / 2) if o == "h" else (c + side * t / 2, s)
            if blocks:
                rot = (0 if side > 0 else -90) if o == "h" else (90 if side > 0 else 180)
                sx = 1 if o == "h" else 1
                msp.add_blockref("PORTA", (u(hx), u(hy)), dxfattribs={"layer": L("PORTE"), "xscale": u(w) * sx, "yscale": u(w), "rotation": rot if o == "h" else rot - 90})
            else:
                if o == "h":
                    msp.add_line((u(hx), u(hy)), (u(hx), u(hy + side * w)), dxfattribs={"layer": L("PORTE")})
                    msp.add_arc((u(hx), u(hy)), u(w), 0 if side > 0 else 270, 90 if side > 0 else 360, dxfattribs={"layer": L("PORTE")})
                else:
                    msp.add_line((u(hx), u(hy)), (u(hx + side * w), u(hy)), dxfattribs={"layer": L("PORTE")})
                    msp.add_arc((u(hx), u(hy)), u(w), 0 if side > 0 else 90, 90 if side > 0 else 180, dxfattribs={"layer": L("PORTE")})
        else:
            if blocks:
                if o == "h":
                    msp.add_blockref("FINESTRA", (u(s), u(c - t / 2)), dxfattribs={"layer": L("FINESTRE"), "xscale": u(w), "yscale": u(t)})
                else:
                    msp.add_blockref("FINESTRA", (u(c + t / 2), u(s)), dxfattribs={"layer": L("FINESTRE"), "xscale": u(w), "yscale": u(t), "rotation": 90})
            else:
                for f in (-t / 6, t / 6):
                    if o == "h":
                        msp.add_line((u(s), u(c + f)), (u(s + w), u(c + f)), dxfattribs={"layer": L("FINESTRE")})
                    else:
                        msp.add_line((u(c + f), u(s)), (u(c + f), u(s + w)), dxfattribs={"layer": L("FINESTRE")})

    for txt, x, y in texts or []:
        msp.add_text(txt, dxfattribs={"layer": L("TESTI"), "height": u(0.25)}).set_placement((u(x), u(y)))
    # quote d'ingombro e un arredo (da ignorare)
    if layers:
        msp.add_linear_dim(base=(u(X0), u(Y0 - 1)), p1=(u(X0), u(Y0)), p2=(u(X1), u(Y0)), dxfattribs={"layer": "QUOTE"}).render()
        msp.add_lwpolyline([(u(1), u(1)), (u(3), u(1)), (u(3), u(1.9)), (u(1), u(1.9))], close=True, dxfattribs={"layer": "ARREDI"})
    doc.saveas(path)


if __name__ == "__main__":
    os.makedirs(HERE, exist_ok=True)
    # appartamento 10 × 8 m: zona giorno a sud, disimpegno, due camere e bagno a nord (assi dei muri, y verso l'alto)
    rooms = [(0, 0, 6, 4.5), (6, 0, 10, 4.5), (0, 4.5, 4, 8), (4, 4.5, 6, 6), (4, 6, 6, 8), (6, 4.5, 10, 8)]
    texts = [("SOGGIORNO", 2.5, 2), ("mq 27,0", 2.5, 1.6), ("CUCINA", 7.5, 2), ("CAMERA MATRIMONIALE", 1, 6.3), ("DISIMPEGNO", 4.2, 5.2),
             ("BAGNO", 4.6, 7), ("CAMERA", 7.5, 6.3)]
    ops = [
        ("door", "h", 0, 2.0, 0.9, 1),        # ingresso a sud nel soggiorno
        ("window", "h", 0, 3.5, 1.8, 1),
        ("window", "h", 0, 7.4, 1.4, 1),
        ("door", "v", 6, 1.5, 0.8, 1),        # soggiorno → cucina
        ("door", "h", 4.5, 4.6, 0.8, 1),      # soggiorno → disimpegno
        ("door", "v", 4, 5.0, 0.8, -1),       # disimpegno → camera matrimoniale
        ("door", "h", 6, 4.6, 0.7, 1),        # disimpegno → bagno
        ("door", "v", 6, 5.0, 0.8, 1),        # disimpegno → camera
        ("window", "v", 0, 5.8, 1.4, 1),
        ("window", "h", 8, 4.7, 0.6, 1),
        ("window", "h", 8, 7.5, 1.4, 1),
        ("window", "v", 10, 1.0, 1.2, 1),
    ]
    draw(os.path.join(HERE, "appartamento_cm.dxf"), rooms, ops, texts=texts)
    # stessa casa in millimetri, tutto sul layer 0, porte e finestre disegnate a mano, senza unità nell'intestazione
    draw(os.path.join(HERE, "appartamento_mm_layer0.dxf"), rooms, ops, unit=1000.0, insunits=0, layers=False, blocks=False, texts=texts)
    # soggiorno a L, porta attaccata all'angolo (senza tratto di muro), un locale senza nome, balcone fuori
    rooms3 = [(0, 0, 7, 4), (0, 4, 3, 7), (7, 0, 10, 4), (3, 4, 7, 7), (7, 4, 10, 5.5), (7, 5.5, 10, 7)]
    texts3 = [("SOGGIORNO", 1.5, 2), ("CUCINA", 8, 2), ("CAMERA", 4.5, 5.5), ("BAGNO", 8, 6.2), ("BALCONE", 4, -1)]
    ops3 = [
        ("door", "h", 0, 1.0, 0.9, 1),
        ("window", "h", 0, 3.0, 2.4, 1),
        ("window", "v", 0, 4.6, 1.6, 1),
        ("door", "v", 7, 1.2, 0.8, 1),
        ("door", "h", 4, 3.05, 0.8, 1),      # camera: vano attaccato al muro del soggiorno
        ("door", "v", 7, 4.6, 0.7, 1),       # camera → locale senza nome (ripostiglio)
        ("door", "v", 7, 6.0, 0.8, 1),       # camera → bagno
        ("window", "h", 7, 4.6, 1.4, 1),
        ("window", "h", 7, 8.0, 0.6, 1),
        ("window", "v", 10, 1.4, 1.2, 1),
    ]
    draw(os.path.join(HERE, "casa_soggiorno_L.dxf"), rooms3, ops3, texts=texts3, skip=[("h", 4, 0, 3)])
    print("ok")
