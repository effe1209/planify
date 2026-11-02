"""Disegni CAD sintetici nello stile di AutoCAD: lo stesso appartamento (due locali, ingresso a sud, finestra a nord, porta interna)
disegnato in modi diversi, per provare che l'importazione DXF dia sempre la stessa pianta.
"""
import io

import ezdxf

T = 0.2   # spessore muro
# interno 6 x 4: muri esterni con asse a 0 e 6.2 / 0 e 4.2 ; tramezzo verticale a x=3.6 con porta 0.9 a y 1.0..1.9
OUT = [(0, 0, 6.2, 0), (6.2, 0, 6.2, 4.2), (6.2, 4.2, 0, 4.2), (0, 4.2, 0, 0)]

def rects():
    """muri come rettangoli (x0,y0,x1,y1) con gli apertura: ingresso a sud (y=0) x 1.2..2.1, finestra nord x 4..5.4, porta interna"""
    r = []
    # sud (y=0 asse) con porta 1.2..2.1
    r += [(-0.1, -0.1, 1.2, 0.1), (2.1, -0.1, 6.3, 0.1)]
    # nord con finestra 4.0..5.4
    r += [(-0.1, 4.1, 4.0, 4.3), (5.4, 4.1, 6.3, 4.3)]
    # ovest, est
    r += [(-0.1, 0.1, 0.1, 4.1), (6.1, 0.1, 6.3, 4.1)]
    # tramezzo x=3.6 con porta y 1.0..1.9
    r += [(3.5, 0.1, 3.7, 1.0), (3.5, 1.9, 3.7, 4.1)]
    return r

def build(style, door_style='arc', win_style='lines', sym_layer=None):
    doc = ezdxf.new('R2018'); doc.header['$INSUNITS'] = 6
    msp = doc.modelspace()
    for n in ('A-WALL', 'A-WALL-INSUL', 'A-DOOR', 'A-GLAZ', 'A-FURN', 'A-ANNO-TEXT', 'A-WALL-PATT'):
        doc.layers.add(n)
    rs = rects()
    if style in ('pairs', 'pairs_hatch', 'insulation'):
        for x0, y0, x1, y1 in rs:
            # le due facce: il rettangolo senza i lati corti
            if (x1 - x0) >= (y1 - y0):
                msp.add_line((x0, y0), (x1, y0), dxfattribs={'layer': 'A-WALL'}); msp.add_line((x0, y1), (x1, y1), dxfattribs={'layer': 'A-WALL'})
            else:
                msp.add_line((x0, y0), (x0, y1), dxfattribs={'layer': 'A-WALL'}); msp.add_line((x1, y0), (x1, y1), dxfattribs={'layer': 'A-WALL'})
    if style == 'wide_poly':
        # l'asse del muro come polilinea con spessore 0,2 m (un tratto per ogni muro, con le aperture)
        for x0, y0, x1, y1 in rs:
            if (x1 - x0) >= (y1 - y0):
                msp.add_lwpolyline([(x0 + 0.1, (y0 + y1) / 2), (x1 - 0.1, (y0 + y1) / 2)], dxfattribs={'layer': 'A-WALL', 'const_width': 0.2})
            else:
                msp.add_lwpolyline([((x0 + x1) / 2, y0 + 0.1), ((x0 + x1) / 2, y1 - 0.1)], dxfattribs={'layer': 'A-WALL', 'const_width': 0.2})
    if style == 'closed_polys':
        for x0, y0, x1, y1 in rs:
            msp.add_lwpolyline([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], close=True, dxfattribs={'layer': 'A-WALL'})
    if style == 'pairs_hatch':
        for x0, y0, x1, y1 in rs:
            h = msp.add_hatch(color=7, dxfattribs={'layer': 'A-WALL-PATT'})
            h.paths.add_polyline_path([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], is_closed=True)
    if style == 'insulation':
        # cappotto: linea esterna a 0.12 m dalla faccia esterna, sullo stesso layer
        d = 0.12
        msp.add_line((-0.1 - d, -0.1 - d), (6.3 + d, -0.1 - d), dxfattribs={'layer': 'A-WALL-INSUL'})
        msp.add_line((-0.1 - d, 4.3 + d), (6.3 + d, 4.3 + d), dxfattribs={'layer': 'A-WALL-INSUL'})
        msp.add_line((-0.1 - d, -0.1 - d), (-0.1 - d, 4.3 + d), dxfattribs={'layer': 'A-WALL-INSUL'})
        msp.add_line((6.3 + d, -0.1 - d), (6.3 + d, 4.3 + d), dxfattribs={'layer': 'A-WALL-INSUL'})
    # porte: ingresso sud 1.2..2.1 e interna x=3.6 y 1.0..1.9
    def door(cx, cy, w, hinge, orient):
        if door_style == 'none':
            return
        if door_style == 'arc':
            if orient == 'h':
                msp.add_arc((cx - w / 2, cy), w, 0, 90, dxfattribs={'layer': sym_layer or 'A-DOOR'})
                msp.add_line((cx - w / 2, cy), (cx - w / 2, cy + w), dxfattribs={'layer': sym_layer or 'A-DOOR'})
            else:
                msp.add_arc((cx, cy - w / 2), w, 0, 90, dxfattribs={'layer': sym_layer or 'A-DOOR'})
                msp.add_line((cx, cy - w / 2), (cx + w, cy - w / 2), dxfattribs={'layer': sym_layer or 'A-DOOR'})
        elif door_style == 'block_named':
            if 'D90' not in doc.blocks:
                blk = doc.blocks.new('D90')
                blk.add_arc((0, 0), 0.9, 0, 90); blk.add_line((0, 0), (0, 0.9))
            msp.add_blockref('D90', (cx - w / 2, cy) if orient == 'h' else (cx, cy - w / 2), dxfattribs={'layer': 'A-DOOR', 'rotation': 0 if orient == 'h' else -90})
    door(1.65, 0.0, 0.9, 0, 'h'); door(3.6, 1.45, 0.9, 0, 'v')
    # finestra nord 4.0..5.4 (y 4.1..4.3): linee di vetro
    if win_style == 'lines':
        for y in (4.15, 4.2, 4.25):
            msp.add_line((4.0, y), (5.4, y), dxfattribs={'layer': sym_layer or 'A-GLAZ'})
    elif win_style == 'block_named':
        blk = doc.blocks.new('W140')
        for y in (0.05, 0.1, 0.15): blk.add_line((0, y), (1.4, y))
        msp.add_blockref('W140', (4.0, 4.1), dxfattribs={'layer': sym_layer or 'A-GLAZ'})
    s = io.StringIO(); doc.write(s); return s.getvalue()

