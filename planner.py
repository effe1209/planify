"""
planner.py - Motore di generazione planimetrie (Python puro, zero dipendenze).

Pipeline:
  1. LAYOUT    -> stanze rettangolari che riempiono una sagoma (rettangolo, L, U, T, scalare)
  2. MURI      -> derivati dai confini tra stanze (nessun muro "a mano")
  3. PORTE     -> create solo tra stanze che condividono un muro (grafo connesso)
  4. FINESTRE  -> solo sui muri perimetrali, mai sopra porte
  5. ARREDI    -> posizionati con controllo collisioni, rispetto di porte e finestre

Tutte le coordinate sono in metri, origine in alto a sinistra, y verso il basso.
"""
from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

# ----------------------------------------------------------------------------
# COSTANTI
# ----------------------------------------------------------------------------
WALL = 0.20            # spessore muri
SCALE = 45.0           # pixel per metro
EPS = 1e-6
CORRIDOR = 1.3         # larghezza disimpegno
DOOR_W = 0.90
DOOR_W_BATH = 0.80
DAY_MIN = 3.8          # larghezza minima zona giorno
# Vano scala nelle file accanto al disimpegno: (larghezza del vano lungo la fila, profondità minima della fila).
# Si parte e si arriva sempre dal lato del disimpegno: a U le due rampe tornano indietro; a L e a rampa
# unica al piano di sopra si torna al disimpegno lungo il passaggio accanto alla rampa.
STAIR_SLOT = {"u": (2.3, 3.0), "l": (2.5, 3.4), "straight": (2.2, 3.8)}
STAIR_PICK = (("u", 0.5), ("l", 0.25), ("straight", 0.25))

# Convenzione per le aperture verticali (rot=90). Il frontend ruota l'elemento
# attorno al punto (x, y): con True x = bordo DESTRO del muro, con False = bordo sinistro.
ROT90_PIVOT_AT_WALL_RIGHT = True

# Se il frontend sa disegnare anche "wardrobe", metti True.
EXTENDED_FURNITURE = True

OPP = {"N": "S", "S": "N", "E": "W", "W": "E"}
# lato del mondo che sta alla destra (asse x locale) di un arredo rivolto verso la chiave
LOCAL_RIGHT = {"S": "E", "N": "W", "E": "N", "W": "S"}
TRANSPOSE_SIDE = {"N": "W", "W": "N", "S": "E", "E": "S"}
FLIP_X = {"E": "W", "W": "E"}
FLIP_Y = {"N": "S", "S": "N"}

PALETTES = {
    "modern": {"living": "#f8fafc", "kitchen": "#f1f5f9", "bed": "#f8fafc", "bath": "#e0f2fe",
               "corridor": "#e2e8f0", "office": "#f8fafc", "meeting": "#f1f5f9", "study": "#f1f5f9",
               "hotel_room": "#f8fafc"},
    "classic": {"living": "#fdf6e3", "kitchen": "#fef3c7", "bed": "#fef9ef", "bath": "#e7f0f7",
                "corridor": "#efe7d6", "office": "#fdf6e3", "meeting": "#f5ecd7", "study": "#f5ecd7",
                "hotel_room": "#fef9ef"},
    "nordic": {"living": "#fafaf9", "kitchen": "#f5f5f4", "bed": "#fafaf9", "bath": "#e8f5e9",
               "corridor": "#f5f5f4", "office": "#fafaf9", "meeting": "#f0fdf4", "study": "#f0fdf4",
               "hotel_room": "#fafaf9"},
    "industrial": {"living": "#eceff1", "kitchen": "#e2e8f0", "bed": "#f1f5f9", "bath": "#cfd8dc",
                  "corridor": "#e2e8f0", "office": "#eceff1", "meeting": "#e2e8f0", "study": "#e2e8f0",
                  "hotel_room": "#eceff1"},
    "japandi": {"living": "#f7f4ea", "kitchen": "#f3efe6", "bed": "#faf7f0", "bath": "#eaf0e8",
                "corridor": "#f3efe6", "office": "#f7f4ea", "meeting": "#f3efe6", "study": "#faf7f0",
                "hotel_room": "#f7f4ea"},
    "luxury": {"living": "#f9f6f0", "kitchen": "#f5efe6", "bed": "#fbf8f5", "bath": "#e2e8f0",
               "corridor": "#f3eee5", "office": "#f9f6f0", "meeting": "#f5efe6", "study": "#fbf8f5",
               "hotel_room": "#fbf8f5"},
    "hotel": {"hotel_room": "#fdf8f2", "bath": "#e8f4f8", "corridor": "#f0ece4"},
}
for _p in PALETTES.values():
    _p.setdefault("garage", "#eceef1")
    _p.setdefault("garden", "#e3efd9")
KIND_GROUP = {"living": "living", "living_kitchen": "living", "zone_day": "living", "kitchen": "kitchen",
              "bed": "bed", "zone_night": "bed", "bath": "bath", "wc": "bath", "corridor": "corridor",
              "office_open": "office", "meeting": "meeting", "director": "meeting", "study": "study",
              "hotel_room": "living", "closet": "bed", "storage": "corridor", "entry": "corridor",
              "dining": "living", "garage": "garage", "laundry": "bath", "garden": "garden",
              "stairs": "corridor"}


def snap(v: float, step: float = 0.05) -> float:
    return round(round(v / step) * step, 3)


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


# ----------------------------------------------------------------------------
# GEOMETRIA
# ----------------------------------------------------------------------------
@dataclass(frozen=True)
class Rect:
    x: float
    y: float
    w: float
    h: float

    @property
    def x2(self): return self.x + self.w
    @property
    def y2(self): return self.y + self.h
    @property
    def cx(self): return self.x + self.w / 2
    @property
    def cy(self): return self.y + self.h / 2

    def overlaps(self, o: "Rect", gap: float = 0.0) -> bool:
        return not (self.x2 + gap <= o.x + EPS or o.x2 + gap <= self.x + EPS or
                    self.y2 + gap <= o.y + EPS or o.y2 + gap <= self.y + EPS)

    def inside(self, o: "Rect") -> bool:
        return (self.x >= o.x - EPS and self.y >= o.y - EPS and
                self.x2 <= o.x2 + EPS and self.y2 <= o.y2 + EPS)

    def transposed(self) -> "Rect":
        return Rect(self.y, self.x, self.h, self.w)


@dataclass
class Room:
    id: int
    name: str
    kind: str
    rect: Rect
    group: int
    master: bool = False
    size: str = ""          # camere: "double" (matrimoniale) | "single"
    suite: bool = False     # camera padronale con bagno privato e cabina armadio
    # vano scala: {type, entry, hand, core: Rect}; entry = lato verso il disimpegno, hand = muro lungo cui
    # corre la prima rampa, core = ingombro comune a tutti i piani (può essere più piccolo del locale)
    stair: Optional[dict] = None


@dataclass
class Opening:
    orient: str            # 'h' = muro lungo x, 'v' = muro lungo y
    line: float            # coordinata (asse perpendicolare) della mezzeria del muro
    start: float           # inizio lungo il muro
    w: float
    room_a: int
    room_b: Optional[int]  # None = esterno
    swing_into: Optional[int] = None
    kind: str = ""         # "" porta | "garage" basculante | "gate" cancello del giardino


@dataclass
class Item:
    type: str
    rect: Rect
    room_id: int
    gap: float = 0.05
    keep: Optional[Rect] = None   # area di rispetto (es. davanti al WC)
    facing: str = ""
    flip: bool = False            # disegno specchiato (pezzi asimmetrici: doccia angolare, divano angolare)

    def __post_init__(self):
        if self.keep is None:
            self.keep = self.rect


def shared_edge(a: Rect, b: Rect):
    """Bordo comune più lungo tra due rettangoli: (orient, line, lo, hi) o None."""
    best = None
    for ax, bx in ((a.x2, b.x), (a.x, b.x2)):
        if abs(ax - bx) < 1e-4:
            lo, hi = max(a.y, b.y), min(a.y2, b.y2)
            if hi - lo > 1e-4 and (best is None or hi - lo > best[3] - best[2]):
                best = ("v", ax, lo, hi)
    for ay, by in ((a.y2, b.y), (a.y, b.y2)):
        if abs(ay - by) < 1e-4:
            lo, hi = max(a.x, b.x), min(a.x2, b.x2)
            if hi - lo > 1e-4 and (best is None or hi - lo > best[3] - best[2]):
                best = ("h", ay, lo, hi)
    return best


# ----------------------------------------------------------------------------
# LAYOUT (stanze, aperture)
# ----------------------------------------------------------------------------
class Layout:
    def __init__(self, W: float, L: float):
        self.W, self.L = float(W), float(L)
        self.rooms: List[Room] = []
        self.doors: List[Opening] = []
        self.windows: List[Opening] = []
        self.items: List[Item] = []
        self.notes: List[str] = []
        self._by_id: Dict[int, Room] = {}
        self.shape = "rect"
        self.room_type = ""
        self.options: dict = {}   # preferenze dell'utente (es. penisola)
        self.mirror: Optional[Tuple[bool, bool]] = None   # specchiatura imposta dalla scala di un altro piano

    # -- stanze --------------------------------------------------------------
    def add_room(self, name, kind, x0, y0, x1, y1, group=None, master=False, size="") -> Room:
        rid = len(self.rooms) + 1
        rect = Rect(round(x0, 3), round(y0, 3), round(x1 - x0, 3), round(y1 - y0, 3))
        room = Room(rid, name, kind, rect, group or rid, master, size)
        self.rooms.append(room)
        self._by_id[rid] = room
        return room

    def room(self, rid: int) -> Room:
        return self._by_id[rid]

    def group_at(self, px: float, py: float) -> Optional[int]:
        for r in self.rooms:
            q = r.rect
            if q.x - EPS <= px <= q.x2 + EPS and q.y - EPS <= py <= q.y2 + EPS:
                return r.group
        return None

    def side_state(self, room: Room, side: str) -> Tuple[bool, bool, bool]:
        """(tutto esterno, c'è un muro, c'è un'apertura libera verso la stessa zona)"""
        r, d = room.rect, 0.02
        ts = (0.1, 0.3, 0.5, 0.7, 0.9)
        if side == "N":   pts = [(r.x + r.w * t, r.y - d) for t in ts]
        elif side == "S": pts = [(r.x + r.w * t, r.y2 + d) for t in ts]
        elif side == "W": pts = [(r.x - d, r.y + r.h * t) for t in ts]
        else:             pts = [(r.x2 + d, r.y + r.h * t) for t in ts]
        gs = [self.group_at(px, py) for px, py in pts]
        all_ext = all(g is None for g in gs)
        any_open = any(g == room.group for g in gs)
        any_wall = any(g is None or g != room.group for g in gs)
        return all_ext, any_wall, any_open

    def ext_sides(self, room: Room) -> List[str]:
        return [s for s in "NESW" if self.side_state(room, s)[0]]

    def open_sides(self, room: Room) -> set:
        return {s for s in "NESW" if self.side_state(room, s)[2]}

    def _on_edge(self, room: Room, side: str) -> bool:
        r = room.rect
        return ((side == "N" and r.y <= EPS) or (side == "S" and r.y2 >= self.L - EPS) or
                (side == "W" and r.x <= EPS) or (side == "E" and r.x2 >= self.W - EPS))

    def inner(self, room: Room) -> Rect:
        r = room.rect
        ins = {}
        for s in "NESW":
            ext, wall, opn = self.side_state(room, s)
            # muro sul bordo della pianta = tutto dentro (WALL); muro verso una rientranza
            # (L/U/T) o verso un'altra stanza = centrato sulla linea di confine.
            ins[s] = WALL if self._on_edge(room, s) else (WALL / 2 if wall else 0.0)
        return Rect(r.x + ins["W"], r.y + ins["N"],
                    r.w - ins["W"] - ins["E"], r.h - ins["N"] - ins["S"])

    # -- geometria lati ------------------------------------------------------
    def _side_geom(self, room: Room, side: str):
        r = room.rect
        if side == "N": return "h", r.y, r.x, r.x2
        if side == "S": return "h", r.y2, r.x, r.x2
        if side == "W": return "v", r.x, r.y, r.y2
        return "v", r.x2, r.y, r.y2

    def _conflict(self, orient, line, a, b, pad=0.25) -> bool:
        for o in self.doors + self.windows:
            if o.orient == orient and abs(o.line - line) < 1e-3:
                if a - pad < o.start + o.w and o.start - pad < b:
                    return True
        return False

    # -- porte ---------------------------------------------------------------
    def add_door(self, a: int, b: int, width: float = DOOR_W, at: float = 0.5,
                 into: Optional[int] = None, margin: float = 0.15) -> Optional[Opening]:
        ra, rb = self.room(a), self.room(b)
        e = shared_edge(ra.rect, rb.rect)
        if e is None:
            self.notes.append(f"Nessun muro in comune tra {ra.name} e {rb.name}: porta omessa")
            return None
        orient, line, lo, hi = e
        avail = hi - lo - 2 * margin
        w = min(width, avail)
        if w < 0.7:
            self.notes.append(f"Muro troppo corto per una porta tra {ra.name} e {rb.name}")
            return None
        start = snap(lo + margin + (avail - w) * at)
        start = clamp(start, lo + margin, hi - margin - w)
        d = Opening(orient, line, round(start, 3), round(w, 3), a, b, into or b)
        self.doors.append(d)
        return d

    def add_entrance(self, room_id: int, side: str, width: float = DOOR_W, at: float = 0.5,
                     kind: str = "") -> Opening:
        room = self.room(room_id)
        orient, line, lo, hi = self._side_geom(room, side)
        margin = 0.35 if kind != "garage" else 0.25
        avail = hi - lo - 2 * margin
        w = min(width, avail)
        start = snap(lo + margin + (avail - w) * at)
        start = clamp(start, lo + margin, hi - margin - w)
        d = Opening(orient, line, round(start, 3), round(w, 3), room_id, None, room_id, kind)
        self.doors.append(d)
        return d

    # -- finestre ------------------------------------------------------------
    def ext_spans(self, room: Room, side: str) -> List[Tuple[float, float]]:
        """Tratti del lato (lungo il muro) che affacciano all'esterno, anche solo in parte."""
        orient, line, lo, hi = self._side_geom(room, side)
        cuts = {round(lo, 3), round(hi, 3)}
        for r in self.rooms:
            for v in ((r.rect.x, r.rect.x2) if orient == "h" else (r.rect.y, r.rect.y2)):
                if lo + 1e-3 < v < hi - 1e-3:
                    cuts.add(round(v, 3))
        pts = sorted(cuts)
        d = 0.02
        spans: List[List[float]] = []
        for a, b in zip(pts, pts[1:]):
            m = (a + b) / 2
            if orient == "h":
                q = (m, line - d if side == "N" else line + d)
            else:
                q = (line - d if side == "W" else line + d, m)
            if self.group_at(*q) is None:
                if spans and abs(spans[-1][1] - a) < 1e-3:
                    spans[-1][1] = b
                else:
                    spans.append([a, b])
        return [(a, b) for a, b in spans]

    def add_windows(self, room_id: int, side: str, width: float, max_count: int = 3) -> int:
        if side not in ("N", "E", "S", "W"):
            return 0
        room = self.room(room_id)
        orient, line, _, _ = self._side_geom(room, side)
        placed = 0
        for lo, hi in self.ext_spans(room, side):
            length = hi - lo
            count = max(1, min(max_count, int(length // 3.2)))
            slot = length / count
            w = min(width, slot - 0.9)
            if w < 0.5:
                continue
            for k in range(count):
                center = lo + slot * (k + 0.5)
                for sh in (0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6):
                    s = snap(center - w / 2 + sh)
                    if s < lo + 0.45 or s + w > hi - 0.45:
                        continue
                    if self._conflict(orient, line, s, s + w):
                        continue
                    self.windows.append(Opening(orient, line, round(s, 3), round(w, 3), room_id, None))
                    placed += 1
                    break
        return placed

    def add_partial_windows(self):
        """Finestre sui tratti di muro che affacciano su una rientranza (L/U/T) senza coprire tutto il lato."""
        widths = {"bed": 1.3, "study": 1.2, "bath": 0.6, "wc": 0.6}
        for room in list(self.rooms):
            if room.kind in ("corridor", "entry", "closet", "storage", "garage", "garden"):
                continue
            full = set(self.ext_sides(room))
            for s in "NESW":
                if s not in full and self.ext_spans(room, s):
                    self.add_windows(room.id, s, widths.get(room.kind, 1.5), 1)

    def best_ext_side(self, room: Room, avoid: Tuple[str, ...] = ()) -> Optional[str]:
        best, blen = None, -1
        for s in self.ext_sides(room):
            if s in avoid:
                continue
            _, _, lo, hi = self._side_geom(room, s)
            if hi - lo > blen:
                best, blen = s, hi - lo
        return best

    # -- trasposizione (scambia x<->y) ----------------------------------------
    def transpose(self):
        self.W, self.L = self.L, self.W
        for r in self.rooms:
            r.rect = r.rect.transposed()
            if r.stair:
                st = r.stair
                st.update(core=st["core"].transposed(), entry=TRANSPOSE_SIDE[st["entry"]],
                          hand=TRANSPOSE_SIDE[st["hand"]])
        for o in self.doors + self.windows:
            o.orient = "v" if o.orient == "h" else "h"
        for it in self.items:
            it.rect = it.rect.transposed()
            it.keep = it.keep.transposed()
            it.facing = TRANSPOSE_SIDE.get(it.facing, it.facing)
            it.flip = not it.flip

    # -- specchiatura (varianti della stessa pianta) -----------------------------
    def flip(self, fx: bool, fy: bool):
        if not (fx or fy):
            return
        W, L = self.W, self.L

        def fr(r: Rect) -> Rect:
            return Rect(round(W - r.x2, 3) if fx else r.x, round(L - r.y2, 3) if fy else r.y, r.w, r.h)

        for r in self.rooms:
            r.rect = fr(r.rect)
            if r.stair:
                st = r.stair
                st["core"] = fr(st["core"])
                for k in ("entry", "hand"):
                    if fx: st[k] = FLIP_X.get(st[k], st[k])
                    if fy: st[k] = FLIP_Y.get(st[k], st[k])
        for o in self.doors + self.windows:
            if o.orient == "h":
                if fx: o.start = round(W - (o.start + o.w), 3)
                if fy: o.line = round(L - o.line, 3)
            else:
                if fy: o.start = round(L - (o.start + o.w), 3)
                if fx: o.line = round(W - o.line, 3)
        for it in self.items:
            it.rect = fr(it.rect)
            it.keep = fr(it.keep)
            f = it.facing
            if fx: f = FLIP_X.get(f, f)
            if fy: f = FLIP_Y.get(f, f)
            it.facing = f
            if fx != fy:
                it.flip = not it.flip


# ----------------------------------------------------------------------------
# MURI (derivati dai confini tra zone)
# ----------------------------------------------------------------------------
def build_walls(lay: Layout) -> List[Tuple[float, float, float, float]]:
    xs = sorted({round(v, 3) for r in lay.rooms for v in (r.rect.x, r.rect.x2)})
    ys = sorted({round(v, 3) for r in lay.rooms for v in (r.rect.y, r.rect.y2)})
    hs, vs = [], []
    for y in ys:
        for i in range(len(xs) - 1):
            xm = (xs[i] + xs[i + 1]) / 2
            a, b = lay.group_at(xm, y - 0.01), lay.group_at(xm, y + 0.01)
            if a != b:
                hs.append((y, xs[i], xs[i + 1], a is None or b is None))
    for x in xs:
        for j in range(len(ys) - 1):
            ym = (ys[j] + ys[j + 1]) / 2
            a, b = lay.group_at(x - 0.01, ym), lay.group_at(x + 0.01, ym)
            if a != b:
                vs.append((x, ys[j], ys[j + 1], a is None or b is None))

    def merge(segs):
        segs = sorted(segs, key=lambda s: (s[0], s[3], s[1]))
        out = []
        for s in segs:
            if out and out[-1][0] == s[0] and out[-1][3] == s[3] and abs(out[-1][2] - s[1]) < 1e-6:
                out[-1] = (s[0], out[-1][1], s[2], s[3])
            else:
                out.append(s)
        return out

    W, L, t = lay.W, lay.L, WALL
    walls = []
    # Muro sul bordo della pianta: tutto dentro. Muro verso una rientranza (L/U/T) o interno:
    # centrato sulla linea di confine, esteso di t/2 per chiudere bene gli angoli.
    for y, x0, x1, per in merge(hs):
        if per and (y <= EPS or y >= L - EPS):
            yy = 0.0 if y <= EPS else L - t
            walls.append((x0, yy, x1 - x0, t))
        else:
            a, b = max(0.0, x0 - t / 2), min(W, x1 + t / 2)
            walls.append((a, y - t / 2, b - a, t))
    for x, y0, y1, per in merge(vs):
        if per and (x <= EPS or x >= W - EPS):
            xx = 0.0 if x <= EPS else W - t
            walls.append((xx, y0, t, y1 - y0))
        else:
            a, b = max(0.0, y0 - t / 2), min(L, y1 + t / 2)
            walls.append((x - t / 2, a, t, b - a))
    return [tuple(round(v, 3) for v in w) for w in walls]


# ----------------------------------------------------------------------------
# POSIZIONAMENTO ARREDI
# ----------------------------------------------------------------------------
def _extend(r: Rect, side: str, front: float) -> Rect:
    if front <= 0: return r
    if side == "N": return Rect(r.x, r.y, r.w, r.h + front)
    if side == "S": return Rect(r.x, r.y - front, r.w, r.h + front)
    if side == "W": return Rect(r.x, r.y, r.w + front, r.h)
    return Rect(r.x - front, r.y, r.w + front, r.h)


class Placer:
    def __init__(self, lay: Layout):
        self.lay = lay
        self.placed: Dict[int, List[Item]] = {r.id: [] for r in lay.rooms}
        self._dz: Dict[int, List[Rect]] = {}
        self._inner: Dict[int, Rect] = {}
        self._open: Dict[int, set] = {}

    def invalidate(self):
        self._dz.clear()

    # -- info stanza ---------------------------------------------------------
    def inner(self, room: Room) -> Rect:
        if room.id not in self._inner:
            self._inner[room.id] = self.lay.inner(room)
        return self._inner[room.id]

    def open_sides(self, room: Room) -> set:
        # dipende solo dalla geometria delle stanze, che non cambia durante l'arredo: si calcola una volta
        if room.id not in self._open:
            self._open[room.id] = self.lay.open_sides(room)
        return self._open[room.id]

    def door_zones(self, room: Room) -> List[Rect]:
        """Aree che devono restare libere: arco di apertura + passaggio."""
        if room.id in self._dz:
            return self._dz[room.id]
        zones = []
        for d in self.lay.doors:
            if room.id not in (d.room_a, d.room_b):
                continue
            into = d.swing_into == room.id
            if d.kind in ("garage", "gate"):
                # basculante o cancello: basta lasciare libera la soglia
                depth = 0.6 if d.kind == "garage" else 1.2
                if d.orient == "h":
                    below = room.rect.cy > d.line
                    zones.append(Rect(d.start, d.line if below else d.line - depth, d.w, depth))
                else:
                    right = room.rect.cx > d.line
                    zones.append(Rect(d.line if right else d.line - depth, d.start, depth, d.w))
                continue
            depth = d.w + 0.1 if into else 0.9
            if d.orient == "h":
                below = room.rect.cy > d.line
                zones.append(Rect(d.start, d.line if below else d.line - depth, d.w, depth))
                if d.room_b is None:   # ingresso: atrio libero
                    zones.append(Rect(d.start - 0.5, d.line if below else d.line - 1.8, d.w + 1.0, 1.8))
            else:
                right = room.rect.cx > d.line
                zones.append(Rect(d.line if right else d.line - depth, d.start, depth, d.w))
                if d.room_b is None:
                    zones.append(Rect(d.line if right else d.line - 1.8, d.start - 0.5, 1.8, d.w + 1.0))
        self._dz[room.id] = zones
        return zones

    def window_zones(self, room: Room) -> List[Rect]:
        lay, zs = self.lay, []
        t = WALL + 0.4
        for w in lay.windows:
            if w.room_a != room.id:
                continue
            horiz = w.orient == "h"
            pos = room.rect.cy > w.line if horiz else room.rect.cx > w.line   # stanza sul lato +
            edge = w.line <= EPS or w.line >= (lay.L if horiz else lay.W) - EPS
            if edge:
                lo = w.line if pos else w.line - t
            else:
                lo = w.line - WALL / 2 if pos else w.line + WALL / 2 - t
            zs.append(Rect(w.start, lo, w.w, t) if horiz else Rect(lo, w.start, t, w.w))
        return zs

    def window_sides(self, room: Room) -> List[str]:
        out = []
        for w in self.lay.windows:
            if w.room_a != room.id:
                continue
            if w.orient == "h": s = "N" if room.rect.cy > w.line else "S"
            else:               s = "W" if room.rect.cx > w.line else "E"
            if s not in out: out.append(s)
        return out

    def door_centers(self, room: Room) -> List[Tuple[float, float]]:
        out = []
        for d in self.lay.doors:
            if room.id in (d.room_a, d.room_b):
                out.append((d.start + d.w / 2, d.line) if d.orient == "h" else (d.line, d.start + d.w / 2))
        return out

    def sides_far_from_door(self, room: Room) -> List[str]:
        inn, dcs = self.inner(room), self.door_centers(room)
        if not dcs:
            return list("NSEW")
        mids = {"N": (inn.cx, inn.y), "S": (inn.cx, inn.y2), "W": (inn.x, inn.cy), "E": (inn.x2, inn.cy)}
        def dist(s):
            return min(((mids[s][0] - x) ** 2 + (mids[s][1] - y) ** 2) ** 0.5 for x, y in dcs)
        return sorted("NSEW", key=lambda s: -dist(s))

    # -- verifica collisioni -------------------------------------------------
    def fits(self, room: Room, r: Rect, gap: float = 0.0, avoid_windows: bool = False,
             zone_gap: float = 0.0) -> bool:
        if not r.inside(self.inner(room)):
            return False
        for z in self.door_zones(room):
            if r.overlaps(z, zone_gap):
                return False
        if avoid_windows:
            for z in self.window_zones(room):
                if r.overlaps(z):
                    return False
        for it in self.placed[room.id]:
            if r.overlaps(it.keep, max(gap, it.gap)):
                return False
        return True

    def _put(self, room, typ, r, gap, keep=None, facing="") -> Item:
        it = Item(typ, r, room.id, gap, keep, facing)
        self.placed[room.id].append(it)
        return it

    def remove(self, item: Item):
        self.placed[item.room_id].remove(item)

    def clear(self, room: Room):
        self.placed[room.id] = []

    # -- strategie di piazzamento -------------------------------------------
    def place_wall(self, room, typ, along, depth, sides="NESW", order="center", gap=0.05,
                   avoid_windows=False, target=None, front=0.0, zone_gap=0.0,
                   allow_open=False) -> Optional[Item]:
        inn = self.inner(room)
        opened = self.open_sides(room)
        for side in sides:
            if side in opened and not allow_open:
                continue
            horiz = side in "NS"
            span = (inn.w if horiz else inn.h) - along
            if span < -EPS:
                continue
            n = int(span / 0.1 + EPS)
            offs = [i * 0.1 for i in range(n + 1)]
            if span - n * 0.1 > 1e-3:
                offs.append(span)
            if order == "start":   offs.sort()
            elif order == "end":   offs.sort(reverse=True)
            else:
                pivot = span / 2
                if target is not None:
                    pivot = target - (inn.x if horiz else inn.y) - along / 2
                offs.sort(key=lambda o: abs(o - pivot))
            for o in offs:
                if side == "N":   r = Rect(inn.x + o, inn.y, along, depth)
                elif side == "S": r = Rect(inn.x + o, inn.y2 - depth, along, depth)
                elif side == "W": r = Rect(inn.x, inn.y + o, depth, along)
                else:             r = Rect(inn.x2 - depth, inn.y + o, depth, along)
                keep = _extend(r, side, front)
                if self.fits(room, keep, gap, avoid_windows, zone_gap):
                    return self._put(room, typ, r, gap, keep, OPP[side])
        return None

    def place_corner(self, room, typ, w, h, gap=0.0, far_from_door=True, front=0.0) -> Optional[Item]:
        """Arredo in un angolo. Rivolto verso l'interno, col disegno specchiato in modo che la parte
        "aperta" (es. l'arco della doccia angolare) guardi la stanza e non il muro laterale."""
        inn, opened = self.inner(room), self.open_sides(room)
        cands = []
        for sy, sx in (("N", "W"), ("N", "E"), ("S", "W"), ("S", "E")):
            if sy in opened or sx in opened:
                continue
            x = inn.x if sx == "W" else inn.x2 - w
            y = inn.y if sy == "N" else inn.y2 - h
            cands.append((Rect(x, y, w, h), sy, sx))
        dcs = self.door_centers(room)
        def score(c):
            r = c[0]
            return -min(((r.cx - x) ** 2 + (r.cy - y) ** 2) ** 0.5 for x, y in dcs) if dcs and far_from_door else 0
        for r, sy, sx in sorted(cands, key=score):
            keep = _extend(r, sy, front)
            if self.fits(room, keep, gap):
                it = self._put(room, typ, r, gap, keep, OPP[sy])
                it.flip = sx == LOCAL_RIGHT[it.facing]
                return it
        return None

    def place_beside(self, room, typ, anchor: Item, along, depth, gap=0.02, sides=("left", "right"),
                     front=0.0) -> List[Item]:
        """Arredi appoggiati allo stesso muro di `anchor`, subito ai suoi lati (comodini, bidet)."""
        f, a = anchor.facing, anchor.rect
        horiz = f in "NS"
        out = []
        for side in sides:
            # "left"/"right" nel riferimento dell'arredo (guardando nella sua direzione)
            right_world = LOCAL_RIGHT[f]
            positive = (right_world in "ES") == (side == "right")
            if horiz:
                x = a.x2 + gap if positive else a.x - gap - along
                y = a.y if f == "S" else a.y2 - depth
                r = Rect(x, y, along, depth)
            else:
                y = a.y2 + gap if positive else a.y - gap - along
                x = a.x if f == "E" else a.x2 - depth
                r = Rect(x, y, depth, along)
            keep = _extend(r, OPP[f], front)
            if not keep.inside(self.inner(room)) or any(keep.overlaps(z) for z in self.door_zones(room)):
                continue
            if any(keep.overlaps(it.keep, 0.0 if it is anchor else max(gap, it.gap))
                   for it in self.placed[room.id]):
                continue
            out.append(self._put(room, typ, r, gap, keep, f))
        return out

    def strip_free(self, room, item: Item, width: float, right: bool = True) -> bool:
        """C'è una fascia libera larga `width` al fianco (destro/sinistro) dell'arredo? (sgabelli, passaggio)"""
        a, side = item.rect, LOCAL_RIGHT[item.facing]
        if not right:
            side = OPP[side]
        if side == "E":   r = Rect(a.x2, a.y, width, a.h)
        elif side == "W": r = Rect(a.x - width, a.y, width, a.h)
        elif side == "S": r = Rect(a.x, a.y2, a.w, width)
        else:             r = Rect(a.x, a.y - width, a.w, width)
        if not r.inside(self.inner(room)) or any(r.overlaps(z) for z in self.door_zones(room)):
            return False
        return not any(r.overlaps(it.keep) for it in self.placed[room.id] if it is not item)

    def place_free(self, room, typ, w, h, near=None, gap=0.05, zone_gap=0.0, step=0.2) -> Optional[Item]:
        inn = self.inner(room)
        if inn.w < w - EPS or inn.h < h - EPS:
            return None
        near = near or (inn.cx, inn.cy)
        cands = []
        x = inn.x
        while x <= inn.x2 - w + EPS:
            y = inn.y
            while y <= inn.y2 - h + EPS:
                cands.append(Rect(x, y, w, h))
                y += step
            x += step
        cands.sort(key=lambda r: (r.cx - near[0]) ** 2 + (r.cy - near[1]) ** 2)
        for r in cands:
            if self.fits(room, r, gap, zone_gap=zone_gap):
                return self._put(room, typ, r, gap)
        return None


# ----------------------------------------------------------------------------
# ARREDO STANZE
# ----------------------------------------------------------------------------
def _place_shower(P: Placer, room: Room) -> Optional[Item]:
    """Doccia adatta alla stanza: walk-in nei bagni lunghi, angolare tonda o quadrata altrove."""
    inn = P.inner(room)
    area = room.rect.w * room.rect.h
    if area >= 5.0 and max(inn.w, inn.h) >= 2.6:
        it = P.place_wall(room, "shower_walkin", 1.4, 0.9, P.sides_far_from_door(room), order="start", front=0.3)
        if it:
            return it
    return (P.place_corner(room, "shower_round", 0.9, 0.9, front=0.2) or
            P.place_corner(room, "shower", 0.8, 0.8) or
            P.place_corner(room, "shower", 0.8, 0.8, far_from_door=False) or
            P.place_wall(room, "shower", 0.8, 0.8, P.sides_far_from_door(room), order="start"))


def furnish_bath(P: Placer, room: Room, shower: bool = True) -> bool:
    """Bagno: vasca (bagno principale spazioso) o doccia, WC + bidet affiancati, lavabo (doppio se c'è spazio)."""
    lay = P.lay
    inn = P.inner(room)
    main_bath = not any(r.kind == "bath" and r.id < room.id for r in lay.rooms)
    area = room.rect.w * room.rect.h

    def attempt(with_tub: bool) -> bool:
        P.clear(room)
        sides = P.sides_far_from_door(room)
        if shower:
            ok = None
            if with_tub:
                ok = P.place_wall(room, "bathtub", 1.7, 0.75, sides, order="start", front=0.5)
            if not (ok or _place_shower(P, room)):
                return False
        wc = (P.place_wall(room, "toilet", 0.4, 0.7, sides, gap=0.2, front=0.55) or
              P.place_wall(room, "toilet", 0.4, 0.6, sides, gap=0.15, front=0.4))
        if not wc:
            return False
        if shower:   # niente bidet nei WC di servizio
            if not P.place_beside(room, "bidet", wc, 0.38, 0.55, gap=0.25, sides=("right",), front=0.5):
                P.place_beside(room, "bidet", wc, 0.38, 0.55, gap=0.25, sides=("left",), front=0.5)
        double = area >= 7.0 and max(inn.w, inn.h) >= 2.4
        return bool((double and P.place_wall(room, "sink", 1.2, 0.5, sides, gap=0.1, front=0.5)) or
                    P.place_wall(room, "sink", 0.6, 0.5, sides, gap=0.1, front=0.45) or
                    P.place_wall(room, "sink", 0.5, 0.4, sides, gap=0.05, front=0.3))

    tub_ok = shower and main_bath and area >= 5.5 and max(inn.w, inn.h) >= 1.75
    for with_tub in ((True, False) if tub_ok else (False,)):
        if attempt(with_tub):
            return True
    # secondo giro: la porta si apre verso l'esterno per liberare spazio
    for d in lay.doors:
        if d.swing_into == room.id and d.room_b is not None:
            d.swing_into = d.room_a if d.room_b == room.id else d.room_b
    P.invalidate()
    if attempt(False):
        return True
    lay.notes.append(f"{room.name}: spazio insufficiente per tutti i sanitari")
    return False


def furnish_bedroom(P: Placer, room: Room):
    """Camera progettata come farebbe un arredatore: si provano le combinazioni di misura del letto
    e parete d'appoggio, e si tiene quella in cui entrano letto, comodini e armadio con i passaggi.
    Matrimoniale: letto lontano dalla porta, comodini su entrambi i lati.
    Singola: letto in un angolo (libera il centro), un comodino, scrivania vicino alla finestra."""
    r = room.rect
    area, short = r.w * r.h, min(r.w, r.h)
    double = room.size != "single"
    if double:
        widths = [1.8, 1.6, 1.4] if (room.master and area >= 14 and short >= 3.3) else [1.6, 1.4]
    else:
        widths = [0.9]
    wins = P.window_sides(room)
    desk_sides = wins + [s for s in "NSEW" if s not in wins]
    # nella suite la cabina armadio sostituisce l'armadio: basta un mobile più piccolo, se entra
    wardrobe_lengths = (1.2,) if room.suite else (2.4, 1.8, 1.2) if double else (1.2, 1.0)

    def attempt(width, side, order, avoid, commit, foot=0.6) -> float:
        P.clear(room)
        # passaggio ai piedi del letto (foot) e ~25 cm attorno: con l'area libera davanti
        # all'armadio fanno ~90 cm di passaggio tra i due
        bed = P.place_wall(room, "bed", width, 2.0, [side], order=order, gap=0.25, front=foot,
                           avoid_windows=avoid, zone_gap=0.3)
        if not bed:
            return -1.0
        stands = P.place_beside(room, "nightstand", bed, 0.45, 0.4,
                                sides=("left", "right") if double else ("right", "left")[:1])
        if not double and not stands:
            stands = P.place_beside(room, "nightstand", bed, 0.45, 0.4, sides=("left",))
        wardrobe = None
        for avoid_w in (True, False):   # meglio non davanti a una finestra, ma un armadio serve
            for wl in wardrobe_lengths:
                wardrobe = P.place_wall(room, "wardrobe", wl, 0.6, "NSEW", gap=0.05, zone_gap=0.3,
                                        front=0.65, avoid_windows=avoid_w)
                if wardrobe:
                    break
            if wardrobe:
                break
        if commit and ((not double and area >= 8) or area >= 13):
            P.place_wall(room, "desk", 1.2 if double else 1.0, 0.55, desk_sides, gap=0.1, zone_gap=0.2, front=0.6)
        return (100 if wardrobe else 0) + 10 * len(stands) + (wardrobe.rect.w * wardrobe.rect.h if wardrobe else 0) \
            + width * 3 + (2 if avoid else 0) + (1 if side in P.sides_far_from_door(room)[:2] else 0) + foot * 5

    best, best_args = -1.0, None
    orders = ("center",) if double else ("start", "end")
    for foot in (0.6, 0.3, 0.0):   # nelle stanze strette si accetta un passaggio ridotto ai piedi del letto
        for width in widths:
            for avoid in (True, False):
                for side in P.sides_far_from_door(room):
                    for order in orders:
                        sc = attempt(width, side, order, avoid, False, foot)
                        if sc > best:
                            best, best_args = sc, (width, side, order, avoid)
                            best_foot = foot
        if best >= 100:
            break
    if best_args is None and double:
        for foot, side in ((f, sd) for f in (0.3, 0.0) for sd in P.sides_far_from_door(room)):
            if attempt(0.9, side, "center", False, False, foot) >= 0:
                best_args, best, best_foot = (0.9, side, "center", False), 0, foot
                P.lay.notes.append(f"{room.name}: entra solo un letto singolo")
                break
    if best_args is None:
        P.clear(room)
        P.lay.notes.append(f"{room.name}: letto non inserito (stanza troppo piccola)")
        return
    attempt(*best_args, True, best_foot)
    if not room.suite and not any(it.type == "wardrobe" for it in P.placed[room.id]):
        P.lay.notes.append(f"{room.name}: armadio non inserito, valuta una cabina o un armadio a muro")


def _sofa_options(P: Placer, room: Room):
    """Divano proporzionato al soggiorno: angolare nei soggiorni grandi, 3 o 2 posti negli altri.
    Se nella stanza ci sono anche cucina e pranzo, l'angolare richiede molta più superficie."""
    inn = P.inner(room)
    area, short = inn.w * inn.h, min(inn.w, inn.h)
    opts = []
    if area >= (30 if room.kind in ("living_kitchen", "zone_day") else 20) and short >= 3.4:
        opts.append(("sofa_corner", 2.6, 1.7))
    opts += [("sofa", 2.2, 0.9), ("sofa", 1.8, 0.9), ("sofa", 1.6, 0.85)]
    return opts


def _place_lounge(P: Placer, room: Room, sofa: Item):
    """Tavolino davanti al divano (la poltrona arriva dopo il tavolo da pranzo, che ha la precedenza)."""
    dx, dy = {"S": (0, 1), "N": (0, -1), "E": (1, 0), "W": (-1, 0)}[sofa.facing]
    half = (sofa.rect.h if sofa.facing in "NS" else sofa.rect.w) / 2
    near = (sofa.rect.cx + dx * (half + 0.6), sofa.rect.cy + dy * (half + 0.6))
    horiz = sofa.facing in "NS"
    w, h = (1.0, 0.55) if horiz else (0.55, 1.0)
    P.place_free(room, "coffee_table", w, h, near=near, gap=0.35, zone_gap=0.2, step=0.1)


def _place_armchair(P: Placer, room: Room):
    """Poltrona di fianco al tavolino, rivolta verso di lui, nei soggiorni ampi."""
    table = next((it for it in P.placed[room.id] if it.type == "coffee_table"), None)
    if not table or room.rect.w * room.rect.h < 20:
        return
    sofa = next(it for it in P.placed[room.id] if it.type in ("sofa", "sofa_corner"))
    dx, dy = {"S": (0, 1), "N": (0, -1), "E": (1, 0), "W": (-1, 0)}[sofa.facing]
    near = (table.rect.cx + dy * 1.3, table.rect.cy + dx * 1.3)
    chair = P.place_free(room, "armchair", 0.8, 0.8, near=near, gap=0.4, zone_gap=0.3, step=0.1)
    if chair:
        cx, cy = chair.rect.cx - table.rect.cx, chair.rect.cy - table.rect.cy
        chair.facing = ("W" if cx > 0 else "E") if abs(cx) > abs(cy) else ("N" if cy > 0 else "S")


def _place_media(P: Placer, room: Room) -> bool:
    inn = P.inner(room)
    axes = [("WE", inn.w), ("NS", inn.h)]
    axes.sort(key=lambda a: -a[1])
    # passata 1: entrambi su muri pieni; passata 2: il divano può dare le spalle a una zona aperta
    for allow_open_sofa in (False, True):
        for pair, span in axes:
            if span < 3.0:
                continue
            for tv_side, sofa_side in ((pair[0], pair[1]), (pair[1], pair[0])):
                for avoid in (True, False):
                    tv = P.place_wall(room, "tv", 1.6, 0.25, [tv_side], gap=0.05,
                                      avoid_windows=avoid, zone_gap=0.2)
                    if not tv:
                        continue
                    horiz = tv_side in "NS"
                    target = tv.rect.cx if horiz else tv.rect.cy
                    for typ, along, depth in _sofa_options(P, room):
                        # distanza di visione: almeno ~2 m tra TV e divano
                        if span - depth - 0.25 < 2.0:
                            continue
                        sofa = P.place_wall(room, typ, along, depth, [sofa_side], target=target,
                                            gap=0.3, zone_gap=0.3, allow_open=allow_open_sofa)
                        if sofa:
                            _place_lounge(P, room, sofa)
                            return True
                    P.remove(tv)
    return False


def _place_media_free(P: Placer, room: Room) -> bool:
    """Ultima spiaggia per stanze piccolissime: TV a muro, divano libero davanti alla TV."""
    inn = P.inner(room)
    for side in P.sides_far_from_door(room):
        if inn.w < 1.8 and side in "NS" or inn.h < 1.8 and side in "EW":
            continue
        tv = (P.place_wall(room, "tv", 1.6, 0.25, [side], gap=0.05, avoid_windows=True, zone_gap=0.2) or
              P.place_wall(room, "tv", 1.6, 0.25, [side], gap=0.05, zone_gap=0.2))
        if not tv:
            continue
        dx, dy = {"S": (0, 1.9), "N": (0, -1.9), "E": (1.9, 0), "W": (-1.9, 0)}[tv.facing]
        near = (tv.rect.cx + dx, tv.rect.cy + dy)
        horiz_tv = side in "NS"
        dims = ((2.2, 0.9), (0.9, 2.2)) if horiz_tv else ((0.9, 2.2), (2.2, 0.9))
        for w, h in dims + ((1.8, 0.9), (0.9, 1.8)):
            sofa = P.place_free(room, "sofa", w, h, near=near, gap=0.3, zone_gap=0.3, step=0.1)
            if sofa:
                sofa.facing = OPP[tv.facing]
                return True
        P.remove(tv)
    return False


def _place_counter(P: Placer, room: Room, prefer: List[str], lengths=(3.6, 3.0, 2.4, 1.8, 1.2)) -> Optional[Item]:
    inn = P.inner(room)
    # davanti al piano servono ~1 m per lavorare e aprire i cassetti; negli spazi minimi si accetta meno
    for front in (1.0, 0.0):
        for length in lengths:
            for side in prefer:
                span = inn.w if side in "NS" else inn.h
                if span < length:
                    continue
                it = P.place_wall(room, "kitchen_counter", length, 0.6, [side], order="start",
                                  gap=0.1, zone_gap=0.1, front=front)
                if it:
                    return it
    return None


def _place_peninsula(P: Placer, room: Room, counter: Item) -> bool:
    """Penisola attaccata al muro del piano cucina, subito dopo la sua estremità libera.
    Servono il passaggio in testa (90 cm) e la fascia per gli sgabelli su un fianco."""
    side = OPP[counter.facing]
    horiz = side in "NS"
    end = counter.rect.x2 if horiz else counter.rect.y2
    for depth in (2.0, 1.6, 1.4):
        it = P.place_wall(room, "kitchen_peninsula", 0.9, depth, [side], target=end + 0.5,
                          gap=0.05, zone_gap=0.3, front=0.8)
        if not it:
            continue
        stools = P.strip_free(room, it, 0.5, right=True)
        if not stools and P.strip_free(room, it, 0.5, right=False):
            it.flip, stools = True, True
        if stools:
            it.gap = 0.8   # gli arredi successivi lasciano il passaggio attorno alla penisola
            return True
        P.remove(it)
    return False


def _counter_and_peninsula(P: Placer, room: Room, prefer: List[str]):
    """Piano cucina + penisola alla sua estremità libera. Il piano più lungo non è sempre il migliore:
    se occupa tutta la parete la penisola non ha dove attaccarsi, quindi si prova ad accorciarlo.
    Ritorna (piano, penisola inserita?)."""
    for length in (3.6, 3.0, 2.4, 1.8):
        counter = _place_counter(P, room, prefer, lengths=(length,))
        if not counter:
            continue
        if _place_peninsula(P, room, counter):
            return counter, True
        P.remove(counter)
    return _place_counter(P, room, prefer), False


def furnish_kitchen(P: Placer, room: Room):
    wins = P.window_sides(room)
    prefer = wins + [s for s in "NSEW" if s not in wins]
    want = P.lay.options.get("peninsula")
    counter, peninsula = _counter_and_peninsula(P, room, prefer) if want else (_place_counter(P, room, prefer), False)
    if not counter:
        P.lay.notes.append(f"{room.name}: piano cucina non inserito")
        return
    if want and not peninsula:
        P.lay.notes.append(f"{room.name}: la penisola non entra (servono circa 2 × 2,5 m liberi oltre al piano)")
    if room.rect.w * room.rect.h >= 8 and not peninsula:
        for typ, w, h in (("table_round", 1.0, 1.0), ("table", 1.2, 0.8), ("table_round", 0.8, 0.8)):
            if P.place_free(room, typ, w, h, gap=0.75, zone_gap=0.3):
                break


def _place_dining(P: Placer, room: Room, near=None) -> bool:
    """Tavolo da pranzo: tondo negli spazi raccolti o quasi quadrati, rettangolare in quelli lunghi."""
    inn = P.inner(room)
    area = room.rect.w * room.rect.h
    square = 0.75 <= inn.w / inn.h <= 1.33 or area < 22
    opts = [("table_round", 1.1, 1.1), ("table", 1.6, 0.9), ("table", 1.2, 0.8), ("table_round", 0.9, 0.9)]
    if not square:
        opts = [opts[1], opts[0], opts[2], opts[3]]
    return any(P.place_free(room, typ, w, h, near=near, gap=0.85, zone_gap=0.3) for typ, w, h in opts)


def furnish_living(P: Placer, room: Room, with_kitchen: bool = False):
    """Soggiorno: con la cucina, prima l'angolo cottura e la zona pranzo vicino a lei, poi la zona
    divano/TV nello spazio che resta (così il tavolo non viene sacrificato a un divano enorme)."""
    peninsula = False
    counter = None
    area = room.rect.w * room.rect.h
    if with_kitchen:
        # cucina sul lato più lontano dall'ingresso, preferibilmente con finestra
        far = P.sides_far_from_door(room)
        prefer = [s for s in far if s in P.window_sides(room)] + far
        want = P.lay.options.get("peninsula")
        counter, peninsula = _counter_and_peninsula(P, room, prefer) if want else (_place_counter(P, room, prefer), False)
        if not counter:
            P.lay.notes.append(f"{room.name}: angolo cottura non inserito")
        elif want and not peninsula:
            P.lay.notes.append(f"{room.name}: la penisola non entra con questo soggiorno")
        if not peninsula:
            _place_dining(P, room, near=(counter.rect.cx, counter.rect.cy) if counter else None)
    has_dining = any(r.kind == "dining" and r.group == room.group for r in P.lay.rooms)
    media = _place_media(P, room) or _place_media_free(P, room)
    if not media and with_kitchen:
        # spazio piccolo: il divano ha la precedenza sul tavolo, che si riprova dopo nello spazio rimasto
        tables = [it for it in P.placed[room.id] if it.type in ("table", "table_round")]
        for it in tables:
            P.remove(it)
        media = _place_media(P, room) or _place_media_free(P, room)
        if tables:
            _place_dining(P, room, near=(counter.rect.cx, counter.rect.cy) if counter else None)
    if not media and area >= 14:
        P.lay.notes.append(f"{room.name}: zona TV/divano non inserita")
    if not with_kitchen and area >= 18 and not has_dining:
        _place_dining(P, room)
    _place_armchair(P, room)
    if area >= 16:   # una pianta in un angolo libero, lontano dalla porta
        P.place_corner(room, "plant", 0.5, 0.5, gap=0.15)


def furnish_dining(P: Placer, room: Room):
    """Zona pranzo: tavolo al centro e una credenza a muro."""
    if not _place_dining(P, room):
        P.lay.notes.append(f"{room.name}: tavolo non inserito")
    P.place_wall(room, "console", 1.6, 0.45, P.sides_far_from_door(room), gap=0.3, zone_gap=0.3, front=0.6)


def furnish_sleep_zone(P: Placer, room: Room):
    sides = P.sides_far_from_door(room)
    bed = None
    for width in (1.6, 0.9):
        bed = P.place_wall(room, "bed", width, 2.0, sides, gap=0.45, avoid_windows=True, zone_gap=0.3) or \
              P.place_wall(room, "bed", width, 2.0, sides, gap=0.45, zone_gap=0.3)
        if bed: break
    if not bed:
        P.lay.notes.append(f"{room.name}: letto non inserito")


def furnish_study(P: Placer, room: Room):
    wins = P.window_sides(room)
    sides = wins + [s for s in "NSEW" if s not in wins]
    P.place_wall(room, "desk", 1.4, 0.7, sides, gap=0.4, zone_gap=0.3)


def furnish_meeting(P: Placer, room: Room):
    inn = P.inner(room)
    tw = snap(min(3.6, inn.w - 1.6) - 0.025)
    th = snap(min(1.4, inn.h - 1.6) - 0.025)
    for w, h in ((tw, th), (1.6, 0.8)):
        if w >= 1.2 and h >= 0.7 and P.place_free(room, "table", w, h, gap=0.6, zone_gap=0.3):
            return
    P.lay.notes.append(f"{room.name}: tavolo non inserito")


def furnish_director(P: Placer, room: Room):
    wins = P.window_sides(room)
    sides = wins + [s for s in "NSEW" if s not in wins]
    P.place_wall(room, "desk", 1.6, 0.8, sides, gap=0.5, zone_gap=0.3)
    if room.rect.w * room.rect.h >= 14:
        P.place_free(room, "table", 1.2, 0.8, gap=0.7, zone_gap=0.3)


def _desk_grid(P: Placer, room: Room, y_off: float, max_desks: int) -> List[Tuple[Rect, str]]:
    inn = P.inner(room)
    dw, dh = 1.4, 0.7
    out: List[Tuple[Rect, str]] = []
    y = inn.y + y_off
    while y + 2 * dh <= inn.y2 + EPS and len(out) < max_desks:
        x, col = inn.x + 0.3, 0
        while x + dw <= inn.x2 - 0.2 + EPS and len(out) < max_desks:
            for yy, face in ((y, "N"), (y + dh, "S")):
                r = Rect(x, yy, dw, dh)
                if len(out) < max_desks and P.fits(room, r, 0.0, zone_gap=0.5):
                    out.append((r, face))
            x += dw + (1.3 if col % 3 == 2 else 0.15)
            col += 1
        y += 2 * dh + 1.4
    return out


def furnish_office_open(P: Placer, room: Room):
    lay, inn = P.lay, P.inner(room)
    area = room.rect.w * room.rect.h
    max_desks = max(2, int(area / 6.5))

    def best_grid():
        best: List[Rect] = []
        for k in range(0, 14):
            g = _desk_grid(P, room, 0.2 + 0.2 * k, max_desks)
            if len(g) > len(best):
                best = g
        return best

    far = P.sides_far_from_door(room)
    pantry = P.place_wall(room, "kitchen_counter", 2.4 if inn.w > 4 else 1.8, 0.6, far, order="end",
                          gap=0.7, zone_gap=0.2)
    grid = best_grid()
    if pantry and len(grid) < min(3, max_desks):
        P.remove(pantry)                      # in uffici minuscoli le scrivanie hanno la precedenza
        grid = best_grid()
    for r, face in grid:
        P._put(room, "desk", r, 0.0, None, face)
    if not grid:
        lay.notes.append(f"{room.name}: nessuna scrivania inserita")


def furnish_service(P: Placer, room: Room):
    """Cabina armadio: armadiature sulle pareti lunghe. Ripostiglio: lavatrice e scaffale.
    Ingresso: un mobile basso per scarpe e chiavi, se non intralcia il passaggio."""
    inn = P.inner(room)
    if room.kind == "closet":
        horiz = inn.w >= inn.h
        sides = "NS" if horiz else "EW"
        for side in sides:
            span = inn.w if side in "NS" else inn.h
            if span >= 0.9:
                P.place_wall(room, "wardrobe", snap(min(span - 0.05, 2.4) - 0.024), 0.55, side, gap=0.0, front=0.6)
        if not P.placed[room.id]:
            P.place_wall(room, "wardrobe", snap(min(max(inn.w, inn.h) - 0.05, 2.0) - 0.024), 0.5, "NSEW", gap=0.0)
    elif room.kind == "entry":
        P.place_wall(room, "console", 1.0, 0.35, "NSEW", gap=0.05, zone_gap=0.3, front=0.9)


def furnish(lay: Layout):
    P = Placer(lay)
    for r in lay.rooms:                     # prima i bagni (possono invertire il verso porta)
        if r.kind in ("bath", "wc"):
            if lay.room_type == "hotel-room":
                furnish_hotel_bath(P, r)
            else:
                furnish_bath(P, r, shower=(r.kind == "bath"))
    for r in lay.rooms:
        k = r.kind
        if k == "bed":              furnish_bedroom(P, r)
        elif k == "hotel_room":     furnish_hotel_room(P, r)
        elif k == "corridor" and lay.room_type == "hotel-room":
            P.place_wall(r, "wardrobe", 1.4, 0.6, "EWNS", gap=0.1, zone_gap=0.2)
            P.place_wall(r, "minibar", 0.8, 0.5, "EWNS", gap=0.1, zone_gap=0.1)
        elif k == "living":         furnish_living(P, r)
        elif k in ("living_kitchen", "zone_day"): furnish_living(P, r, with_kitchen=True)
        elif k == "dining":         furnish_dining(P, r)
        elif k == "kitchen":        furnish_kitchen(P, r)
        elif k == "zone_night":     furnish_sleep_zone(P, r)
        elif k == "study":          furnish_study(P, r)
        elif k == "meeting":        furnish_meeting(P, r)
        elif k == "director":       furnish_director(P, r)
        elif k == "office_open":    furnish_office_open(P, r)
        elif k in ("closet", "entry"): furnish_service(P, r)
        elif k == "storage":        furnish_storage(P, r)
        elif k == "laundry":        furnish_laundry(P, r)
        elif k == "garage":         furnish_garage(P, r)
        elif k == "garden":         furnish_garden(P, r)
    for plist in P.placed.values():
        lay.items.extend(plist)


# ----------------------------------------------------------------------------
# HOTEL ROOM LAYOUT
# ----------------------------------------------------------------------------
def layout_hotel_room(W: float, L: float, shape: str = "auto",
                      rng: Optional[random.Random] = None) -> Layout:
    """Hotel room: foyer con guardaroba/minibar + bagno en-suite + camera matrimoniale."""
    rng = rng or random.Random(0)
    lay = Layout(W, L)
    lay.room_type = "hotel-room"
    lay.shape = "rect"

    # Foyer / ingresso e bagno nella fascia nord (corridoio dell'albergo)
    foyer_h = snap(clamp(L * rng.uniform(0.33, 0.38), 2.1, 2.7))
    bath_w = snap(clamp(W * rng.uniform(0.50, 0.56), 2.0, 2.8))
    foyer_w = snap(W - bath_w)

    bath = lay.add_room("Bagno en-suite", "bath", 0, 0, bath_w, foyer_h, group=2)
    corridor = lay.add_room("Ingresso / Guardaroba", "corridor", bath_w, 0, W, foyer_h, group=1)
    main = lay.add_room("Camera", "hotel_room", 0, foyer_h, W, L, group=3)

    # Ingresso dalla parete Nord nel foyer/guardaroba
    lay.add_entrance(corridor.id, "N", DOOR_W, 0.5)
    # Porta tra foyer e bagno (si apre verso il foyer per non ingombrare il bagno)
    lay.add_door(corridor.id, bath.id, DOOR_W_BATH, 0.5, into=corridor.id)
    # Porta o passaggio tra foyer e camera
    lay.add_door(corridor.id, main.id, DOOR_W, 0.5, into=main.id)

    # Finestre panoramiche sulla parete Sud della camera
    lay.add_windows(main.id, "S", 2.2 if W >= 4.0 else 1.6, 2)
    if "E" in lay.ext_sides(main):
        lay.add_windows(main.id, "E", 1.4, 1)
    if "W" in lay.ext_sides(main):
        lay.add_windows(main.id, "W", 1.4, 1)

    side = lay.best_ext_side(bath)
    if side:
        lay.add_windows(bath.id, side, 0.7, 1)
    lay.add_partial_windows()
    return lay


def furnish_hotel_room(P: Placer, room: Room):
    """Furnish the main hotel room area."""
    r = room.rect
    sides = P.sides_far_from_door(room)
    wins = P.window_sides(room)

    # King bed contro una parete laterale (E o W preferibilmente)
    bed_cands = [s for s in sides if s in "EW"] + [s for s in sides if s not in "EW"]
    bed = None
    for width in (1.8, 1.6):
        bed = P.place_wall(room, "bed", width, 2.0, bed_cands, gap=0.45,
                           avoid_windows=True, zone_gap=0.35)
        if bed:
            break
        bed = P.place_wall(room, "bed", width, 2.0, sides, gap=0.45, zone_gap=0.35)
        if bed:
            break

    if not bed:
        P.lay.notes.append(f"{room.name}: letto non inserito")
        return

    # TV on wall facing the bed
    bed_facing = bed.facing  # direction the bed faces (opposite of the wall it's against)
    opp_sides = [bed_facing] + [s for s in "NSEW" if s != bed_facing]
    P.place_wall(room, "tv", 1.6, 0.25, opp_sides, gap=0.05, zone_gap=0.2)

    # Desk near window
    desk_sides = wins + [s for s in "NSEW" if s not in wins]
    P.place_wall(room, "desk", 1.2, 0.6, desk_sides, gap=0.4, zone_gap=0.2)

    # Small sofa or armchair near window/TV area
    if r.w * r.h >= 18:
        for w, h in ((1.4, 0.8), (0.8, 0.8)):
            if P.place_free(room, "sofa", w, h, gap=0.5, zone_gap=0.3):
                break


def furnish_hotel_bath(P: Placer, room: Room):
    """Furnish hotel en-suite bathroom with bathtub or walk-in shower, toilet, sink."""
    P.clear(room)
    sides = P.sides_far_from_door(room)
    placed_tub = False
    if room.rect.w * room.rect.h >= 4.5:
        for bw, bh in ((1.4, 0.7), (1.3, 0.65)):
            if P.place_wall(room, "bathtub", bw, bh, sides, gap=0.05):
                if P.place_wall(room, "toilet", 0.4, 0.65, "NSEW", gap=0.1, front=0.3) and \
                   P.place_wall(room, "sink", 0.55, 0.45, "NSEW", gap=0.05, front=0.3):
                    placed_tub = True
                    break
                P.clear(room)
    if not placed_tub:
        furnish_bath(P, room, shower=True)


# ----------------------------------------------------------------------------
# GENERATORI DI LAYOUT
# ----------------------------------------------------------------------------
def distribute(total: float, specs: List[Tuple[float, float, float]]) -> List[float]:
    """Divide `total` tra elementi (min, peso, max). Il max è "morbido": se avanza spazio si sfora."""
    n = len(specs)
    widths = [s[0] for s in specs]
    caps = [s[2] for s in specs]
    rem = total - sum(widths)
    flex = [i for i in range(n) if specs[i][1] > 0] or list(range(n))   # peso 0 = larghezza fissa (vano scala)
    weight = lambda i: specs[i][1] or 1.0
    for _ in range(8):
        if rem < 0.005:
            break
        elig = [i for i in flex if widths[i] < caps[i] - EPS]
        if not elig:
            caps = [float("inf")] * n
            elig = flex
        wsum = sum(weight(i) for i in elig)
        used = 0.0
        for i in elig:
            add = min(rem * weight(i) / wsum, caps[i] - widths[i])
            widths[i] += add
            used += add
        rem -= used
    return widths


def _edges(x0: float, x1: float, widths: List[float]) -> List[float]:
    xs, acc = [x0], x0
    for w in widths[:-1]:
        acc += w
        xs.append(snap(acc))
    xs.append(x1)
    return xs


# Larghezze (lungo la fila) per tipo di locale: minimo, peso nella ripartizione, massimo "morbido".
# Matrimoniale: letto 160 + 2 passaggi da 60 + muri. Singola: letto 90, passaggio e scrivania.
ROOM_W = {
    ("bed", "double"): (3.0, 1.0, 4.6),
    ("bed", "single"): (2.5, 0.75, 3.4),
    ("bath", "main"): (2.3, 0.6, 3.2),
    ("bath", "service"): (1.8, 0.45, 2.6),
    ("study", ""): (2.6, 0.7, 3.4),
    ("storage", ""): (1.4, 0.3, 1.9),
    ("laundry", ""): (1.8, 0.35, 2.6),
    ("wc", ""): (1.6, 0.4, 2.3),
    **{("stairs", t): (w, 0.0, w) for t, (w, _) in STAIR_SLOT.items()},
}
SUITE_STRIP = 1.9   # larghezza della fascia bagno privato + cabina armadio nella suite


# Superfici minime abitabili (DM 5/7/1975): camera doppia 14 m², singola 9 m².
MIN_AREA = {("bed", "double"): 14.0, ("bed", "suite"): 14.0, ("bed", "single"): 9.0}


def _room_w(item, depth: float = 0.0) -> Tuple[float, float, float]:
    """(min, peso, max) della larghezza; con la profondità della fila il minimo garantisce anche la superficie."""
    k, i, size = item
    if k == "bath":
        return ROOM_W[("bath", "main" if i == 0 else "service")]
    mn, wg, cap = ROOM_W[(k, "double" if size == "suite" else size)]
    need = MIN_AREA.get((k, size))
    if need and depth > 0:
        mn = max(mn, snap(need / depth + 0.024))
        cap = max(cap, mn + 0.6)
    if size == "suite":   # camera + fascia con bagno privato e cabina armadio
        mn, wg, cap = mn + SUITE_STRIP, wg * 1.3, cap + SUITE_STRIP
    return mn, wg, cap


def _row_min(items, depth: float = 0.0) -> float:
    return sum(_room_w(it, depth)[0] for it in items)


def _night_config(beds: List[str], baths: int, two_sided: bool, depth: float = 0.0, extras=(),
                  stair=None, stair_row: Optional[str] = None):
    """Locali della zona notte disposti su una fila (nord) o due (nord e sud del disimpegno).
    `beds` elenca le camere ("suite"/"double"/"single"), la prima è la padronale;
    `extras` sono locali di servizio richiesti ("study", "storage", "wc");
    `stair` è il vano scala, nella fila `stair_row` ("N"/"S") o in quella più corta."""
    bed_items = [("bed", i, size) for i, size in enumerate(beds)]
    bath_items = [("bath", j, "") for j in range(baths)]
    extra_items = [(k, 0, "") for k in extras]
    if two_sided:
        south = list(bath_items)
        north: list = []
        for b in bed_items + extra_items:
            (north if _row_min(north, depth) <= _row_min(south, depth) else south).append(b)
        if len(north) + len(south) < 3 and "study" not in extras:
            south.append(("study", 0, ""))
        north.reverse()                        # camera padronale in fondo (est)
    else:
        north = bath_items + extra_items + bed_items[::-1]
        south = []
    if stair:
        if not two_sided or stair_row == "N" or (stair_row is None and _row_min(north, depth) <= _row_min(south, depth)):
            north.append(stair)
        else:
            south.append(stair)
    return north, south


def _night_depth(L: float, two: bool) -> float:
    return snap((L - CORRIDOR) / 2) if two else snap(L - CORRIDOR)


def _fit_night(doubles: int, singles: int, baths: int, two_order, W: float, L: float,
               suite: bool = False, extras=(), day_min: float = DAY_MIN, fixed=(),
               stairs=(), stair_row: Optional[str] = None):
    """Prima configurazione che entra. Se lo spazio non basta si rinuncia, nell'ordine, a:
    ripostiglio, studio, bagni in più, suite (diventa una matrimoniale), singole, matrimoniali.
    Le camere rispettano le superfici minime, quindi conta anche la profondità della fila.
    `baths` comprende il bagno della suite. `day_min` è la larghezza da lasciare alla zona giorno,
    `fixed` sono locali sempre presenti (es. bagno di servizio), `stairs` i tipi di scala in ordine
    di preferenza (vuoto = nessuna scala): si usa il primo che entra nella profondità della fila."""
    cur = {"doubles": doubles, "singles": singles, "baths": baths, "suite": suite and doubles > 0,
           "extras": [e for e in ("storage", "laundry", "study") if e in extras]}
    while True:
        beds = ["double"] * cur["doubles"] + ["single"] * cur["singles"]
        if cur["suite"]:
            beds[0] = "suite"
        row_baths = max(0, cur["baths"] - (1 if cur["suite"] else 0))
        for two in two_order:
            depth = _night_depth(L, two)
            if cur["suite"] and depth < 3.3:
                continue
            st = next((t for t in stairs if STAIR_SLOT[t][1] <= depth + EPS), None)
            if stairs and st is None:
                continue
            north, south = _night_config(beds, row_baths, two, depth, cur["extras"] + list(fixed),
                                         ("stairs", 0, st) if st else None, stair_row)
            nmin = max(_row_min(north, depth), _row_min(south, depth))
            if W - nmin >= day_min:
                return {**cur, "stair": st}, two, north, south, nmin
        if cur["extras"]:
            cur["extras"] = cur["extras"][1:]
        elif cur["baths"] > (2 if cur["suite"] else 1):
            cur["baths"] -= 1
        elif cur["suite"]:
            cur["suite"], cur["baths"] = False, max(1, cur["baths"] - 1)
        elif cur["singles"] > 0 and cur["doubles"] + cur["singles"] > 1:
            cur["singles"] -= 1
        elif cur["doubles"] > 1:
            cur["doubles"] -= 1
        else:
            return None


def _plural(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


# ----------------------------------------------------------------------------
# SAGOME (rettangolo, L, U, T, scalare)
# ----------------------------------------------------------------------------
def _resolve_shape(shape: str, rng: random.Random, options: List[str]) -> str:
    """'auto' pesca a caso (le sagome irregolari pesano di più); una sagoma non disponibile ricade su 'l'."""
    if shape == "auto":
        return rng.choice(["rect"] + options * 2)
    if shape == "rect":
        return "rect"
    if shape in options:
        return shape
    return "l" if "l" in options else "rect"


def _apartment_notches(shape: str, rng: random.Random, n_north: int, n_south: int,
                       two: bool, row_h: float):
    """Sceglie quali stanze di ogni fila vengono accorciate (le rientranze).
    Ritorna ({'N': (i0, i1, profondità), 'S': ...}, sagoma effettiva); i1 è escluso."""
    max_d = row_h - 2.7
    if shape == "rect" or max_d < 0.8 or n_north < 1:
        return {}, "rect"
    d = snap(clamp(row_h * rng.uniform(0.25, 0.50), 0.8, max_d))
    m, s = n_north, n_south
    if shape == "t" and two and s >= 1:
        return {"N": (m - 1, m, d), "S": (s - 1, s, d)}, "t"
    if shape == "step" and two and s >= 1:
        return {"N": (m - 1, m, d), "S": (0, 1, d)}, "step"
    if shape == "u" and m >= 2:
        k = 2 if (m >= 4 and rng.random() < 0.5) else 1
        i0 = rng.randint(0, m - 1 - k)
        return {"N": (i0, i0 + k, d)}, "u"
    k = rng.randint(1, min(2, m))
    return {"N": (m - k, m, d)}, "l"


def _pick_order(items: list, sl, rng: random.Random) -> list:
    """Ordine casuale della fila, evitando (se possibile) di accorciare la camera matrimoniale."""
    opts = [items, items[::-1]]
    rng.shuffle(opts)
    if sl:
        for o in opts:
            if not any(k == "bed" and i == 0 for k, i, _ in o[sl[0]:sl[1]]):
                return o
    return opts[0]


def layout_compact_apartment(W: float, L: float, beds: Optional[List[str]] = None, shape: str = "auto",
                             rng: Optional[random.Random] = None, kitchen: str = "auto") -> Layout:
    """Planimetria compatta ottimizzata per bilocali e trilocali (5-9m).
    Tutte le camere da letto hanno pareti chiuse indipendenti, porte e finestre."""
    rng = rng or random.Random(0)
    beds = beds or ["double"]
    lay = Layout(W, L)
    lay.shape = "rect"
    if kitchen == "closed":
        lay.notes.append("In una pianta così compatta la cucina separata non entra: cucina a vista nel soggiorno.")

    # Divisione tra zona giorno e zona notte
    xw = snap(clamp(W * rng.uniform(0.48, 0.56), 3.2, W - 2.8))

    # Lato sinistro: Zona giorno
    liv = lay.add_room("Soggiorno con Cucina", "living_kitchen", 0, 0, xw, L, group=1)

    # Lato destro: notte e servizi
    bath_h = snap(clamp(L * 0.38, 2.3, 2.8))
    bed_h = snap(L - bath_h)

    if len(beds) >= 2 and L >= 7.5 and (W - xw) >= 3.0:
        # Due camere chiuse separate
        h1 = snap(bed_h * 0.55)
        s1, s2 = beds[0], beds[1]
        bed1 = lay.add_room("Camera Matrimoniale" if s1 == "double" else "Camera Singola", "bed",
                            xw, 0, W, h1, group=2, master=s1 == "double", size=s1)
        bed2 = lay.add_room("Camera Matrimoniale 2" if s2 == "double" else "Camera Singola", "bed",
                            xw, h1, W, bed_h, group=3, size=s2)
        corr_w = 1.2
        corr = lay.add_room("Disimpegno", "corridor", xw, bed_h, xw + corr_w, L, group=4)
        bath = lay.add_room("Bagno", "bath", xw + corr_w, bed_h, W, L, group=5)

        lay.add_entrance(liv.id, "S", DOOR_W, 0.3)
        lay.add_door(liv.id, corr.id, DOOR_W, 0.5, into=corr.id)
        lay.add_door(corr.id, bed1.id, DOOR_W, 0.5, into=bed1.id)
        lay.add_door(corr.id, bed2.id, DOOR_W, 0.5, into=bed2.id)
        lay.add_door(corr.id, bath.id, DOOR_W_BATH, 0.2, into=corr.id)

        lay.add_windows(bed1.id, "E", 1.5, 1)
        lay.add_windows(bed2.id, "E", 1.4, 1)
        lay.add_windows(bath.id, "S", 0.7, 1)
    else:
        # Bilocale: camera chiusa con muri e porta
        s1 = beds[0]
        bed = lay.add_room("Camera Matrimoniale" if s1 == "double" else "Camera Singola", "bed",
                           xw, 0, W, bed_h, group=2, master=s1 == "double", size=s1)
        corr_w = 1.2
        corr = lay.add_room("Disimpegno", "corridor", xw, bed_h, xw + corr_w, L, group=3)
        bath = lay.add_room("Bagno", "bath", xw + corr_w, bed_h, W, L, group=4)

        lay.add_entrance(liv.id, "S", DOOR_W, 0.3)
        lay.add_door(liv.id, corr.id, DOOR_W, 0.5, into=corr.id)
        lay.add_door(corr.id, bed.id, DOOR_W, 0.5, into=bed.id)
        lay.add_door(corr.id, bath.id, DOOR_W_BATH, 0.2, into=corr.id)

        lay.add_windows(bed.id, "E", 1.5, 2)
        if "N" in lay.ext_sides(bed):
            lay.add_windows(bed.id, "N", 1.4, 1)
        lay.add_windows(bath.id, "S", 0.7, 1)

    lay.add_windows(liv.id, "W", 1.8, 2)
    lay.add_windows(liv.id, "S", 1.6, 2)
    if "N" in lay.ext_sides(liv):
        lay.add_windows(liv.id, "N", 1.6, 1)

    lay.add_partial_windows()
    return lay


def _choose_entry(entry, rng: random.Random) -> bool:
    """Ingresso separato: True/False dall'utente, "auto" = a volte sì (il punteggio sceglie la variante migliore)."""
    if entry in (True, False):
        return entry
    return rng.random() < 0.65


def _stair_prefs(rng: random.Random) -> List[str]:
    """Tipi di scala in ordine di preferenza, pescati con i pesi di STAIR_PICK (la U è la più compatta)."""
    pool, out = list(STAIR_PICK), []
    while pool:
        t = rng.uniform(0, sum(w for _, w in pool))
        for i, (k, w) in enumerate(pool):
            t -= w
            if t <= 0 or i == len(pool) - 1:
                out.append(k)
                pool.pop(i)
                break
    return out


def _core_row(core: Rect, L: float, two: bool) -> Optional[str]:
    """Fila ("N"/"S") che coincide con l'ingombro della scala fissata da un altro piano, se c'è."""
    dn = _night_depth(L, two)
    rows = {"N": (0.0, dn)}
    if two:
        rows["S"] = (snap(dn + CORRIDOR), L)
    for k, (a, b) in rows.items():
        if abs(core.y - a) < 0.06 and abs(core.y2 - b) < 0.06:
            return k
    return None


def layout_apartment(W: float, L: float, doubles: int, singles: int, baths: Optional[int],
                     shape: str = "auto", rng: Optional[random.Random] = None,
                     kitchen: str = "auto", needs: Optional[dict] = None,
                     program: str = "full", access: str = "street",
                     stair: Optional[dict] = None) -> Optional[Layout]:
    """Appartamento: zona giorno a ovest, disimpegno, zona notte su una o due file.

    doubles/singles: camere matrimoniali e singole richieste; baths: bagni (None = automatico);
    kitchen: "open" (cucina nel soggiorno), "closed" (cucina separata) o "auto";
    needs: bisogni dell'utente — entry (ingresso separato: True/False/"auto"), suite (camera
    padronale con bagno privato e cabina armadio), study (studio), storage (ripostiglio/lavanderia).

    Case su più piani:
    program: "full" (giorno e notte), "day" (soggiorno, cucina, bagno di servizio) o "night" (camere e
    bagni; con molto spazio una zona relax); access: "street" (porta sulla facciata), "stairs" (si
    arriva dalla scala, niente porta d'ingresso) o "both"; stair: {type, core?, entry?, hand?} = vano
    scala nelle file del disimpegno; con `core` (Rect) la scala è già fissata da un altro piano e va
    esattamente lì. Ritorna None se la scala richiesta non entra.
    """
    rng = rng or random.Random(0)
    needs = needs or {}
    day = program != "night"       # c'è la zona giorno (soggiorno e cucina)
    sleep = program != "day"       # c'è la zona notte (camere e bagni)
    core = stair.get("core") if stair else None
    doubles, singles = (max(0, doubles), max(0, singles)) if sleep else (0, 0)
    if sleep and doubles + singles == 0:
        doubles = 1
    suite = bool(needs.get("suite")) and doubles > 0
    if not sleep:
        baths = 0
    elif baths is None:
        baths = 2 if (doubles + singles >= 3 and W * L >= 95) or suite else 1
    baths = int(clamp(baths, 1, 3)) if sleep else 0
    asked_baths = baths
    if suite and baths < 2:
        baths = 2   # il bagno privato della suite si aggiunge a quello per gli ospiti
    extras = [k for k in ("storage", "laundry", "study") if needs.get(k)]
    # una sola fila di camere solo se la pianta è poco profonda: altrimenti le camere diventano corridoi
    two_order = (True,) if L >= 8.5 else (True, False) if L >= 7.2 else (False,)
    if len(two_order) == 2 and shape not in ("t", "step") and rng.random() < 0.3:
        two_order = (False, True)
    stairs, stair_row = (), None
    if stair:
        if core is not None:
            # stessa scala del piano accanto: la fila (e quindi una o due file) è decisa da dove sta
            two_order = tuple(t for t in two_order + (True, False) if _core_row(core, L, t))[:1]
            if not two_order:
                return None
            stair_row = _core_row(core, L, two_order[0])
            stairs = (stair["type"],)
        else:
            stairs = (stair["type"],) if stair.get("type") in STAIR_SLOT else tuple(_stair_prefs(rng))
            # con una sola fila il vano scala sarebbe profondo quanto tutta la fila: meglio due file se si può
            if L >= 7.3:
                two_order = (True, False)
    fit = _fit_night(doubles, singles, baths, two_order, W, L, suite, extras,
                     day_min=DAY_MIN if day else 0.0, fixed=() if sleep else ("wc",),
                     stairs=stairs, stair_row=stair_row)
    if not fit and stair:
        return None
    if not fit:
        lay = layout_compact_apartment(W, L, beds=["double"] * doubles + ["single"] * singles,
                                       shape=shape, rng=rng, kitchen=kitchen)
        if doubles + singles > 2 or baths > 1 or suite or extras:
            lay.notes.append("Superficie ridotta: pianta compatta con al massimo 2 camere e 1 bagno.")
        return lay

    got, two, north, south, nmin = fit
    d = got["doubles"]
    lay = Layout(W, L)
    if (got["doubles"], got["singles"], got["baths"]) != (doubles, singles, baths):
        lay.notes.append(
            f"Con queste misure entrano {_plural(got['doubles'], 'matrimoniale', 'matrimoniali')}, "
            f"{_plural(got['singles'], 'singola', 'singole')} e {_plural(got['baths'], 'bagno', 'bagni')} "
            f"(richiesti {doubles}, {singles} e {baths}): aumenta la superficie per averli tutti.")
    if suite and not got["suite"]:
        lay.notes.append("La suite padronale (bagno privato e cabina armadio) non entra con queste misure.")
    elif suite and asked_baths < 2:
        lay.notes.append("Suite padronale: aggiunto il bagno privato oltre al bagno per gli ospiti.")
    for k, name in (("study", "Lo studio"), ("storage", "Il ripostiglio"), ("laundry", "La lavanderia")):
        if k in extras and k not in got["extras"]:
            lay.notes.append(f"{name} non entra con queste misure.")

    # la zona notte non va oltre la somma delle larghezze massime sensate dei suoi locali:
    # lo spazio in più va alla zona giorno invece di produrre camere enormi e allungate
    depth_n = _night_depth(L, two)
    ncap = max(sum(_room_w(it, depth_n)[2] for it in north), sum(_room_w(it, depth_n)[2] for it in south))
    if day:
        xd = snap(clamp(max(W * rng.uniform(0.40, 0.50), W - ncap), DAY_MIN, W - nmin))
    else:
        # solo zona notte: le file occupano tutta la larghezza; se avanza molto spazio, una zona relax a ovest
        xd = snap(W - ncap) if W - ncap >= 3.5 else 0.0
    st_item = next((it for it in north + south if it[0] == "stairs"), None)
    if core is not None:
        # dove sta la scala nella sua fila (quali locali a sinistra e quali a destra) e dove finisce la zona giorno
        row = north if stair_row == "N" else south
        other = south if stair_row == "N" else north
        rest = [it for it in row if it[0] != "stairs"]
        best = None
        for k in range(len(rest) + 1):
            left, right = rest[:k], rest[k:]
            rw = W - core.x2
            if (right and rw < _row_min(right, depth_n) - EPS) or (not right and rw > 1.5):
                continue      # a destra non entrano, oppure resta troppo spazio da lasciare al vano scala
            if left:
                x = min(xd, core.x - _row_min(left, depth_n))
                if not day and x < 3.5:
                    x = 0.0   # niente zona relax troppo stretta: le camere arrivano al muro esterno
            elif day or core.x >= 3.5:
                x = core.x
            elif core.x <= 1.5:
                x = 0.0       # il piccolo avanzo verso il muro esterno va al vano scala
            else:
                continue
            x = snap(x)
            if (day and x < DAY_MIN - EPS) or (not day and 0 < x < 3.5) or x > core.x + EPS:
                continue
            if left and core.x - x < _row_min(left, depth_n) - EPS:
                continue
            if other and W - x < _row_min(other, depth_n) - EPS:
                continue
            if best is None or abs(x - xd) < best[0]:
                best = (abs(x - xd), x, left + [st_item] + right)
        if best is None:
            return None
        xd = best[1]
        row[:] = best[2]
    if two:
        dn = snap((L - CORRIDOR) / 2)
        n_y0, n_y1 = 0.0, dn
        c_y0, c_y1 = dn, snap(dn + CORRIDOR)
        s_y0, s_y1 = c_y1, L
    else:
        dn = snap(L - CORRIDOR)
        n_y0, n_y1 = 0.0, dn
        c_y0, c_y1 = dn, L

    # sagoma: quali stanze delle file notte vengono accorciate (mai con la suite: il suo bagno ha bisogno della facciata)
    options = ["l", "u"] + (["t", "step"] if two else [])
    # con la scala tra i piani la sagoma resta rettangolare: tutti i piani devono sovrapporsi
    wanted = "rect" if got["suite"] or stair else _resolve_shape(shape, rng, options)
    notches, lay.shape = _apartment_notches(wanted, rng, len(north), len(south), two, dn)
    if shape not in ("auto", "rect") and lay.shape == "rect":
        lay.notes.append("Con la scala tra i piani la pianta è rettangolare." if stair else
                         "Con queste misure non è possibile una sagoma irregolare: pianta rettangolare.")
    if core is None:
        north = _pick_order(north, notches.get("N"), rng)
        south = _pick_order(south, notches.get("S"), rng)

    # circolazione: ingresso separato (le camere si raggiungono senza attraversare il soggiorno) + disimpegno
    hall = None
    if access != "stairs" and _choose_entry(needs.get("entry", "auto"), rng):
        ew = snap(clamp((W - xd) * 0.3, 1.8, 2.4))
        if not two:
            # una sola fila di camere: il disimpegno è sulla facciata, l'ingresso sta accanto al soggiorno
            hall = lay.add_room("Ingresso", "entry", xd, c_y0, xd + ew, c_y1)
            corridor = lay.add_room("Disimpegno", "corridor", xd + ew, c_y0, W, c_y1, group=hall.group)
        else:
            # due file: il disimpegno è interno, l'ingresso è in testa sulla facciata est
            corridor = lay.add_room("Disimpegno", "corridor", xd, c_y0, W - ew, c_y1)
            hall = lay.add_room("Ingresso", "entry", W - ew, c_y0, W, c_y1, group=corridor.group)
    else:
        corridor = lay.add_room("Disimpegno", "corridor", xd, c_y0, W, c_y1)

    if st_item and core is None:
        # scala accanto all'ingresso: con due file l'ingresso è in testa (est), con una fila accanto al soggiorno
        for row in (north, south):
            if st_item in row:
                row.remove(st_item)
                row.insert(len(row) if (hall is not None and two) else 0, st_item)
    suites = []

    def make_side(items, y0, y1, side, notch):
        def spread(its, x0, x1):
            specs = []
            for it in its:
                mn, wg, cap = _room_w(it, y1 - y0)
                cap += 0.6 if (it[0] == "bed" and it[1] == 0) else 0   # la padronale può essere più ampia
                specs.append((mn, wg * rng.uniform(0.85, 1.25), cap))
            return _edges(x0, x1, distribute(x1 - x0, specs))

        if core is not None and st_item in items:
            # la scala è fissata: i locali si dividono lo spazio a sinistra e a destra del vano
            i = items.index(st_item)
            left, right = items[:i], items[i + 1:]
            xs = ((spread(left, xd, core.x)[:-1] if left else []) +
                  [core.x if left else xd, core.x2 if right else W] +
                  (spread(right, core.x2, W)[1:] if right else []))
        else:
            xs = spread(items, xd, W)
        rooms = []
        n_double = sum(1 for k, _, sz in north + south if k == "bed" and sz in ("double", "suite"))
        n_single = sum(1 for k, _, sz in north + south if k == "bed" and sz == "single")
        for idx, (k, i, size) in enumerate(items):
            x0, x1 = xs[idx], xs[idx + 1]
            ya, yb = y0, y1
            if notch and notch[0] <= idx < notch[1]:
                # la rientranza della sagoma non può rendere il locale inabitabile: resta la superficie
                # minima per il suo uso e almeno 2,7 m di profondità
                need = {"bath": 3.5, "study": 7.0, "storage": 2.0, "laundry": 3.0}.get(k, MIN_AREA.get((k, size), 9.0))
                # +15% sul minimo: la stanza deve anche potersi arredare (letto, armadio, passaggi)
                keep = max(2.7 if k not in ("storage", "laundry") else 1.5, need * 1.15 / max(0.1, x1 - x0))
                cut = max(0.0, min(notch[2], (y1 - y0) - keep))
                if side == "N":
                    ya = snap(y0 + cut)
                else:
                    yb = snap(y1 - cut)
            if k == "stairs":
                room = lay.add_room("Scala", "stairs", x0, ya, x1, yb, group=corridor.group)
                hand = stair.get("hand") if core is not None else rng.choice("EW")
                room.stair = {"type": size, "entry": "S" if side == "N" else "N", "hand": hand,
                              "core": Rect(core.x, core.y, core.w, core.h) if core is not None else
                              Rect(room.rect.x, room.rect.y, room.rect.w, room.rect.h)}
                rooms.append((room, side))
                continue
            if k == "wc":
                rooms.append((lay.add_room("Bagno di servizio", "wc", x0, ya, x1, yb), side))
                continue
            if k == "bed" and size == "suite":
                # suite: camera + fascia con bagno privato (sulla facciata, con finestra) e cabina armadio
                xs_ = snap(x1 - SUITE_STRIP)
                depth = yb - ya
                bh = snap(clamp(depth * 0.55, 2.0, depth - 1.2)) if depth >= 3.2 else depth
                bed = lay.add_room("Camera Matrimoniale", "bed", x0, ya, xs_, yb, master=True, size="double")
                bed.suite = True
                if side == "N":
                    bath = lay.add_room("Bagno padronale", "bath", xs_, ya, x1, ya + bh)
                    closet = lay.add_room("Cabina armadio", "closet", xs_, ya + bh, x1, yb) if bh < depth else None
                else:
                    bath = lay.add_room("Bagno padronale", "bath", xs_, yb - bh, x1, yb)
                    closet = lay.add_room("Cabina armadio", "closet", xs_, ya, x1, yb - bh) if bh < depth else None
                suites.append((bed, bath, closet, side))
                rooms.append((bed, side))
                continue
            if k == "bed":
                master = (i == 0 and size == "double")
                if size == "double":
                    nm = "Camera Matrimoniale" + (f" {i + 1}" if n_double > 1 and i > 0 else "")
                else:
                    nm = "Camera Singola" + (f" {i - d + 1}" if n_single > 1 else "")
                room = lay.add_room(nm, "bed", x0, ya, x1, yb, master=master, size=size)
            elif k == "bath":
                room = lay.add_room("Bagno" if i == 0 else f"Bagno {i + 1}", "bath", x0, ya, x1, yb)
            elif k == "storage":
                room = lay.add_room("Ripostiglio", "storage", x0, ya, x1, yb)
            elif k == "laundry":
                room = lay.add_room("Lavanderia", "laundry", x0, ya, x1, yb)
            else:
                room = lay.add_room("Studio", "study", x0, ya, x1, yb)
            rooms.append((room, side))
        return rooms

    night = make_side(north, n_y0, n_y1, "N", notches.get("N"))
    if two:
        night += make_side(south, s_y0, s_y1, "S", notches.get("S"))

    # zona giorno (al piano notte, se avanza spazio, una zona relax)
    yk = snap(clamp(L * 0.36, 2.6, 3.6))
    yk = min(yk, snap(dn + CORRIDOR - 1.5))
    fits_closed = L >= 6.0 and xd * L >= 30 and yk >= 2.6 and (L - yk) >= 3.2
    liv = None
    if not day and xd > EPS:
        liv = lay.add_room("Zona relax", "living", 0, 0, xd, L)
    if day and kitchen == "closed" and not fits_closed:
        lay.notes.append("La cucina separata non entra con queste misure: cucina a vista nel soggiorno.")
    closed_kitchen = day and fits_closed and (kitchen == "closed" or (kitchen == "auto" and rng.random() < 0.8))
    if closed_kitchen:
        kw = snap(min(xd, 5.0)) if xd - 5.0 >= 2.8 else xd
        kit = lay.add_room("Cucina", "kitchen", 0, 0, kw, yk)
        liv = lay.add_room("Soggiorno", "living", 0, yk, xd, L)
        if kw < xd:
            # zona giorno molto ampia: accanto alla cucina una sala da pranzo aperta sul soggiorno
            din = lay.add_room("Zona Pranzo", "dining", kw, 0, xd, yk, group=liv.group)
            lay.add_door(kit.id, din.id, DOOR_W, 0.5, into=din.id)
            lay.add_windows(din.id, lay.best_ext_side(din), 1.6, 2)
        lay.add_door(kit.id, liv.id, DOOR_W, 0.5, into=liv.id)
        lay.add_windows(kit.id, lay.best_ext_side(kit), 1.3, 2)
    elif day:
        liv = lay.add_room("Soggiorno con Cucina", "living_kitchen", 0, 0, xd, L)

    if hall is not None:
        lay.add_entrance(hall.id, "E" if two else "S", DOOR_W, 0.5)
        lay.add_door(hall.id if not two else corridor.id, liv.id, DOOR_W, 0.5, into=liv.id)
    elif access == "stairs":
        # si arriva dalla scala nel disimpegno: niente porta sulla facciata
        if liv is not None:
            lay.add_door(liv.id, corridor.id, DOOR_W, 0.5, into=liv.id)
    else:
        lay.add_entrance(liv.id, "S", DOOR_W, 0.3)
        lay.add_door(liv.id, corridor.id, DOOR_W, 0.5, into=liv.id)
    if liv is not None:
        lay.add_windows(liv.id, "W", 2.0, 2)
        lay.add_windows(liv.id, "S", 1.6, 1)
        if "N" in lay.ext_sides(liv):
            lay.add_windows(liv.id, "N", 1.6, 2)

    def circulation_for(room):
        """Il locale di circolazione (disimpegno o ingresso) con cui il locale condivide più muro."""
        best, blen = corridor, -1.0
        for c in (corridor, hall):
            e = c and shared_edge(room.rect, c.rect)
            if e and e[3] - e[2] > blen:
                best, blen = c, e[3] - e[2]
        return best

    for room, side in night:
        if room.kind != "stairs":   # il vano scala è aperto sul disimpegno
            wd = DOOR_W_BATH if room.kind in ("bath", "wc", "storage", "laundry") else DOOR_W
            lay.add_door(room.id, circulation_for(room).id, wd, 0.15, into=room.id)
        ww = {"bed": 1.5, "bath": 0.7, "wc": 0.6, "study": 1.3, "laundry": 0.6, "stairs": 0.9}.get(room.kind)
        if ww:
            lay.add_windows(room.id, side, ww, 2)
    for bed, bath, closet, side in suites:
        lay.add_door(bed.id, bath.id, DOOR_W_BATH, 0.5, into=bath.id)
        lay.add_windows(bath.id, lay.best_ext_side(bath) or side, 0.7, 1)
        if closet is not None:
            lay.add_door(bed.id, closet.id, DOOR_W_BATH, 0.5, into=bed.id)
    lay.add_partial_windows()
    return lay


def layout_garage(W: float, L: float, rng: Optional[random.Random] = None,
                  needs: Optional[dict] = None) -> Layout:
    """Garage / piano interrato: box auto con basculante sulla facciata sud (lato W) e, sul fondo,
    una fascia di servizi (lavanderia, ripostiglio, cantina) se richiesti e se c'è profondità."""
    rng = rng or random.Random(0)
    needs = needs or {}
    lay = Layout(W, L)
    lay.room_type = "garage"
    lay.shape = "rect"
    # lavanderia e ripostiglio ci sono salvo indicazione contraria
    service = [k for k in ("laundry", "storage") if needs.get(k) is not False]
    strip = 2.2 if service and L >= 7.4 else 0.0
    if service and not strip:
        lay.notes.append("Garage poco profondo: lavanderia e ripostiglio non entrano (servono almeno 7,4 m).")
    garage = lay.add_room("Garage", "garage", 0, strip, W, L)
    rooms = []
    if strip:
        specs = [(1.8, 1.0, 3.2) if k == "laundry" else (1.4, 0.7, 2.6) for k in service]
        if W - sum(sp[2] for sp in specs) >= 1.8:
            service.append("cellar")
            specs.append((1.8, 1.2, 99.0))
        xs = _edges(0.0, W, distribute(W, specs))
        names = {"laundry": ("Lavanderia", "laundry"), "storage": ("Ripostiglio", "storage"),
                 "cellar": ("Cantina", "storage")}
        for i, k in enumerate(service):
            nm, kind = names[k]
            rooms.append(lay.add_room(nm, kind, xs[i], 0, xs[i + 1], strip))
    cars = int(clamp((W - 0.4) // 2.8, 1, 3))
    if rooms and L - strip < 6.4 and cars > 1:
        # box poco profondo: il passaggio verso i servizi sul fondo occupa lo spazio di un posto auto
        cars -= 1
        lay.notes.append(f"Garage: {cars} {'posto auto' if cars == 1 else 'posti auto'}, "
                         "lo spazio restante serve per accedere ai locali di servizio.")
    lay.add_entrance(garage.id, "S", min(W - 0.6, 2.5 * cars if cars > 1 else 2.5), 0.5, kind="garage")
    for r in rooms:
        # porte verso un'estremità: il resto della parete di fondo resta per il muso delle auto
        lay.add_door(garage.id, r.id, DOOR_W_BATH, 0.1, into=r.id)
        if r.kind == "laundry" and lay.ext_sides(r):
            lay.add_windows(r.id, lay.best_ext_side(r), 0.6, 1)
    # finestrature alte di aerazione sui lati del box
    for side in ("E", "W"):
        if side in lay.ext_sides(garage):
            lay.add_windows(garage.id, side, 0.8, 1)
    lay.options["cars"] = cars
    return lay


def layout_garden(W: float, L: float, rng: Optional[random.Random] = None) -> Layout:
    """Giardino / area esterna: nessun muro. La casa è sul lato nord, l'accesso dalla strada a sud
    con cancello pedonale e carrabile; recinzione su strada, siepi sui confini laterali."""
    lay = Layout(W, L)
    lay.room_type = "garden"
    lay.shape = "rect"
    garden = lay.add_room("Giardino", "garden", 0, 0, W, L)
    lay.add_entrance(garden.id, "S", 1.0, 0.18, kind="gate")
    lay.notes.append("Giardino: casa sul lato nord, strada sul lato sud.")
    return lay


def furnish_garden(P: Placer, room: Room) -> None:
    """Recinzione e cancelli su strada, siepi laterali, camminamento dal cancello alla casa,
    gazebo in un angolo e qualche albero dove resta spazio."""
    lay, r = P.lay, room.rect
    gate = next(d for d in lay.doors if d.kind == "gate")
    drive_w = 3.0 if r.w >= 7 else 0.0
    drive_x = snap(r.x2 - 0.6 - drive_w)
    # su strada (sud): recinzione con i varchi dei due cancelli
    cuts = sorted([(gate.start, gate.start + gate.w)] + ([(drive_x, drive_x + drive_w)] if drive_w else []))
    x = r.x
    for a, b in cuts + [(r.x2, r.x2)]:
        if a - x > 0.3:
            P._put(room, "fence", Rect(x, r.y2 - 0.15, a - x, 0.15), 0.0, None, "N")
        x = b
    if drive_w:
        P._put(room, "gate_driveway", Rect(drive_x, r.y2 - 0.15, drive_w, 0.15), 0.0, None, "N")
    P._put(room, "gate_pedestrian", Rect(gate.start, r.y2 - 0.15, gate.w, 0.15), 0.0, None, "N")
    # siepi sui confini laterali
    for xx in (r.x, r.x2 - 0.5):
        P._put(room, "hedge", Rect(xx, r.y, 0.5, r.h - 0.2), 0.0, None, "E" if xx == r.x else "W")
    # camminamento dal cancello pedonale verso la casa, vialetto carrabile
    P._put(room, "path", Rect(gate.start, r.y + 0.3, gate.w, r.h - 0.5), 0.0, None, "N")
    if drive_w:
        dl = min(6.0, r.h * 0.6)
        P._put(room, "path", Rect(drive_x, r.y2 - dl, drive_w, dl - 0.15), 0.0, None, "N")
    # gazebo in un angolo libero, poi alberi
    for gw in (3.0, 2.5):
        if P.place_free(room, "gazebo", gw, gw, near=(r.x2 - gw, r.y + gw), gap=0.6, step=0.25):
            break
    for near in ((r.x + 2, r.cy), (r.x2 - 2, r.cy + 2), (r.cx, r.y + 2)):
        P.place_free(room, "tree", 1.4, 1.4, near=near, gap=0.8, step=0.25)


def furnish_garage(P: Placer, room: Room) -> None:
    """Auto nei posti, muso verso la basculante; banco da lavoro e scaffalature sulle pareti libere."""
    cars = P.lay.options.get("cars", 1)
    inn = P.inner(room)
    bay = inn.w / cars
    for i in range(cars):
        target = inn.x + bay * (i + 0.5)
        if not (P.place_wall(room, "car", 1.9, 4.5, ["N"], target=target, gap=0.4, zone_gap=0.1) or
                P.place_free(room, "car", 1.9, 4.5, near=(target, inn.cy), gap=0.4, step=0.1)):
            P.lay.notes.append(f"{room.name}: posto auto {i + 1} troppo stretto per un'auto")
    P.place_wall(room, "workbench", 1.8, 0.6, "EW", gap=0.3, front=0.6)
    P.place_wall(room, "shelving_heavy", 2.0, 0.5, "EWN", gap=0.2, front=0.5)
    P.place_free(room, "motorbike", 0.8, 2.1, gap=0.3, step=0.1)


def furnish_laundry(P: Placer, room: Room) -> None:
    """Lavatrice e asciugatrice affiancate, lavatoio, cesto della biancheria."""
    washer = P.place_wall(room, "washer", 0.6, 0.6, P.sides_far_from_door(room), order="start", gap=0.02, front=0.7)
    if washer:
        if not P.place_beside(room, "dryer", washer, 0.6, 0.6, gap=0.02, sides=("right",), front=0.7):
            P.place_beside(room, "dryer", washer, 0.6, 0.6, gap=0.02, sides=("left",), front=0.7)
    else:
        P.lay.notes.append(f"{room.name}: lavatrice non inserita")
    P.place_wall(room, "utility_sink", 0.6, 0.5, "NSEW", gap=0.1, front=0.5)
    P.place_free(room, "laundry_basket", 0.45, 0.45, gap=0.1, step=0.1)


def furnish_storage(P: Placer, room: Room) -> None:
    """Scaffali modulari sulle pareti lunghe, aspirapolvere/elettrodomestici in un angolo."""
    inn = P.inner(room)
    for side in ("EW" if inn.h >= inn.w else "NS"):
        span = inn.h if side in "EW" else inn.w
        if span >= 0.8:
            P.place_wall(room, "shelving", snap(min(span - 0.2, 2.4) - 0.024), 0.4, side, gap=0.0, front=0.5)
    P.place_corner(room, "vacuum", 0.4, 0.4, gap=0.05)


def layout_loft(W: float, L: float, office: bool, shape: str = "auto",
                rng: Optional[random.Random] = None) -> Layout:
    """Open space: zona principale + zona secondaria aperta + bagno chiuso (anche con rientranza a L)."""
    rng = rng or random.Random(0)
    lay = Layout(W, L)
    bw = snap(clamp(W * rng.uniform(0.24, 0.31), 2.6, 3.6))
    bh = snap(min(clamp(L * rng.uniform(0.34, 0.42), 2.6, 3.4), L - 2.4))
    wanted = _resolve_shape(shape, rng, ["l"])
    nd = 0.0
    if wanted != "rect":
        room_h = L - bh
        max_d = room_h - 2.6
        if max_d >= 0.8:
            nd = snap(clamp(room_h * rng.uniform(0.25, 0.50), 0.8, max_d))
    if not office:
        # la camera deve restare abitabile (≥ 9 m²): se serve si allarga a scapito della zona giorno
        need = 9.5
        if bw * (L - bh - nd) < need:
            nd = 0.0
        if bw * (L - bh) < need:
            bw = snap(min(W * 0.45, need / (L - bh) + 0.024))
    lay.shape = "l" if nd > 0 else "rect"
    if shape not in ("auto", "rect") and nd == 0:
        lay.notes.append("Con queste misure non è possibile una sagoma irregolare: pianta rettangolare.")
    yb = L - nd
    if office:
        a = lay.add_room("Area Operativa", "office_open", 0, 0, W - bw, L, group=1)
        b = lay.add_room("Area Riunioni", "meeting", W - bw, bh, W, yb, group=2)
        bath = lay.add_room("Bagno", "wc", W - bw, 0, W, bh, group=3)
        lay.add_entrance(a.id, "S", 1.0, 0.3)
        lay.add_door(a.id, b.id, DOOR_W, 0.5, into=b.id)
        lay.add_door(bath.id, a.id, DOOR_W_BATH, 0.2, into=bath.id)
    else:
        a = lay.add_room("Soggiorno e Cucina", "living_kitchen", 0, 0, W - bw, L, group=1)
        double = bw * (yb - bh) >= 14
        b = lay.add_room("Camera Matrimoniale" if double else "Camera Singola", "bed", W - bw, bh, W, yb,
                         group=2, master=double, size="double" if double else "single")
        bath = lay.add_room("Bagno", "bath", W - bw, 0, W, bh, group=3)
        lay.add_entrance(a.id, "S", DOOR_W, 0.3)
        lay.add_door(a.id, b.id, DOOR_W, 0.5, into=b.id)
        lay.add_door(bath.id, a.id, DOOR_W_BATH, 0.2, into=bath.id)
    lay.add_windows(a.id, "W", 2.0 if not office else 1.8, 3)
    lay.add_windows(a.id, "N", 1.8, 3)
    lay.add_windows(a.id, "S", 1.6, 2)
    lay.add_windows(b.id, "E", 1.4, 2)
    if nd > 0:
        lay.add_windows(b.id, "S", 1.4, 1)
    side = lay.best_ext_side(bath)
    if side:
        lay.add_windows(bath.id, side, 0.7, 1)
    lay.add_partial_windows()
    return lay


def layout_office(W: float, L: float, n_closed: int, shape: str = "auto",
                  rng: Optional[random.Random] = None) -> Layout:
    rng = rng or random.Random(0)
    if W < 9.0:
        lay = layout_loft(W, L, office=True, shape=shape, rng=rng)
        lay.notes.append("Superficie ridotta: ufficio open space con angolo riunioni.")
        return lay
    ws = snap(clamp(W * rng.uniform(0.30, 0.38), 3.2, 6.0))
    xo = snap(W - ws)
    bath_h = 2.4 if L >= 6 else 2.2
    cap = int((L - bath_h) / 2.8 + 1e-6)
    n = max(1, min(n_closed, cap, 4))
    lay = Layout(W, L)
    if n < n_closed:
        lay.notes.append(f"Con queste dimensioni entrano al massimo {n} locali chiusi (richiesti {n_closed}).")

    # sagoma: larghezze diverse per i locali della colonna di destra (stanze chiuse + bagno)
    total = n + 1
    wanted = _resolve_shape(shape, rng, ["l", "u", "t", "step"])
    offs = [0.0] * total
    max_off = ws - 3.0
    if wanted != "rect" and max_off >= 0.6:
        d = snap(clamp(ws * rng.uniform(0.25, 0.40), 0.8, max_off))
        if wanted == "u" and total >= 3:
            offs[rng.randint(1, total - 2)] = d
            lay.shape = "u"
        elif wanted == "t" and total >= 3:
            offs = [d] + [0.0] * (total - 2) + [d]
            lay.shape = "t"
        elif wanted == "step" and total >= 3:
            offs = [snap(min(max_off, d * i / (total - 1))) for i in range(total)]
            lay.shape = "step"
        else:
            k = rng.randint(1, max(1, total // 2))
            offs = [0.0] * (total - k) + [d] * k
            lay.shape = "l"
    if shape not in ("auto", "rect") and lay.shape == "rect":
        lay.notes.append("Con queste misure non è possibile una sagoma irregolare: pianta rettangolare.")

    open_room = lay.add_room("Area Operativa", "office_open", 0, 0, xo, L)

    avail = L - bath_h
    specs = [(2.8, 1.3 if i == 0 else 1.0, 99.0) for i in range(n)]
    heights = distribute(avail, specs)
    ys = _edges(0.0, snap(avail), heights)
    names = ["Sala Riunioni", "Ufficio Direzione", "Ufficio 2", "Ufficio 3"]
    stack = []
    for i in range(n):
        kind = "meeting" if i == 0 else "director"
        stack.append(lay.add_room(names[i], kind, xo, ys[i], W - offs[i], ys[i + 1]))
    wc = lay.add_room("Bagno", "wc", xo, snap(avail), W - offs[-1], L)

    lay.add_entrance(open_room.id, "S", 1.0, 0.3)
    for r in stack:
        lay.add_door(open_room.id, r.id, DOOR_W, 0.5, into=r.id)
        lay.add_windows(r.id, "E", 1.8, 2)
    lay.add_door(open_room.id, wc.id, DOOR_W_BATH, 0.5, into=wc.id)
    lay.add_windows(wc.id, "E", 0.7, 1)
    lay.add_windows(open_room.id, "N", 1.8, 4)
    lay.add_windows(open_room.id, "W", 1.8, 3)
    lay.add_windows(open_room.id, "S", 1.8, 3)
    lay.add_partial_windows()
    return lay


# ----------------------------------------------------------------------------
# VALIDAZIONE (usata nei test e per riempire `notes`)
# ----------------------------------------------------------------------------
def validate(lay: Layout) -> List[str]:
    issues: List[str] = []
    P = Placer(lay)
    # 1) arredi
    for it in lay.items:
        room = lay.room(it.room_id)
        if room.kind == "garden":
            continue   # recinzioni e siepi stanno sul confine, il vialetto parte dal cancello: niente muri qui
        if not it.rect.inside(P.inner(room)):
            issues.append(f"{it.type} fuori da {room.name}")
        for z in P.door_zones(room):
            if it.rect.overlaps(z):
                issues.append(f"{it.type} blocca una porta in {room.name}")
    for i, a in enumerate(lay.items):
        for b in lay.items[i + 1:]:
            if a.room_id == b.room_id and a.rect.overlaps(b.rect):
                issues.append(f"{a.type} e {b.type} si sovrappongono in {lay.room(a.room_id).name}")
    # 2) connettività (le zone aperte sono la stessa zona)
    entrance = [d.room_a for d in lay.doors if d.room_b is None] or \
        [r.id for r in lay.rooms if r.kind == "stairs"]      # ai piani superiori si arriva dalla scala
    if not entrance:
        issues.append("manca l'ingresso")
    else:
        adj: Dict[int, set] = {}
        for d in lay.doors:
            if d.room_b is not None:
                ga, gb = lay.room(d.room_a).group, lay.room(d.room_b).group
                adj.setdefault(ga, set()).add(gb)
                adj.setdefault(gb, set()).add(ga)
        seen, stack = set(), [lay.room(entrance[0]).group]
        while stack:
            g = stack.pop()
            if g in seen: continue
            seen.add(g)
            stack.extend(adj.get(g, ()))
        for r in lay.rooms:
            if r.group not in seen:
                issues.append(f"{r.name} non raggiungibile")
    # 3) contenuti obbligatori
    for r in lay.rooms:
        types = [i.type for i in lay.items if i.room_id == r.id]
        wins = [w for w in lay.windows if w.room_a == r.id]
        if r.kind == "bed" and "bed" not in types: issues.append(f"{r.name} senza letto")
        if r.kind in ("bath", "wc") and not ("toilet" in types and "sink" in types):
            issues.append(f"{r.name} senza sanitari")
        if r.kind in ("living", "living_kitchen", "zone_day") and not {"sofa", "sofa_corner"} & set(types) \
                and r.rect.w * r.rect.h >= 14:
            issues.append(f"{r.name} senza divano")
        if r.kind in ("bed", "living", "living_kitchen", "kitchen", "office_open", "zone_day",
                      "zone_night", "study", "director", "meeting") and not wins and r.kind != "meeting":
            issues.append(f"{r.name} senza finestre")
    # 3b) superfici minime abitabili
    for r in lay.rooms:
        area = r.rect.w * r.rect.h
        need = 14.0 if (r.kind == "bed" and r.size != "single") else 9.0 if r.kind == "bed" else \
            14.0 if r.kind in ("living", "living_kitchen") and lay.room_type != "hotel-room" else 0.0
        if need and area < need - 0.3:
            issues.append(f"{r.name}: {area:.1f} m², sotto i {need:.0f} m² minimi per questo uso")
    # 4) aperture
    ops = [("porta", d) for d in lay.doors] + [("finestra", w) for w in lay.windows]
    for i, (ka, a) in enumerate(ops):
        for kb, b in ops[i + 1:]:
            if a.orient == b.orient and abs(a.line - b.line) < 1e-3 and \
               a.start < b.start + b.w - 1e-6 and b.start < a.start + a.w - 1e-6:
                issues.append(f"{ka} e {kb} si sovrappongono")
    # 5) geometria: stanze non sovrapposte e nessun vuoto interno (le rientranze toccano il bordo)
    for i, a in enumerate(lay.rooms):
        for b in lay.rooms[i + 1:]:
            if a.rect.overlaps(b.rect):
                issues.append(f"{a.name} e {b.name} si sovrappongono")
    for n in compute_notches(lay):
        if not (n["x"] <= EPS or n["y"] <= EPS or n["x"] + n["w"] >= lay.W - EPS
                or n["y"] + n["h"] >= lay.L - EPS):
            issues.append("vuoto interno alla pianta")
    return issues



HABITABLE = ("bed", "living", "living_kitchen", "kitchen", "study", "hotel_room", "dining")
WINDOW_H = 1.4   # altezza tipica di una finestra, per stimare la superficie finestrata


def ensure_daylight(lay: Layout) -> None:
    """Rapporto aero-illuminante: ogni locale abitabile deve avere una superficie finestrata di almeno
    1/8 del pavimento. Dove manca si aggiungono o allargano finestre sulle pareti esterne libere."""
    for r in lay.rooms:
        if r.kind not in HABITABLE:
            continue
        need = r.rect.w * r.rect.h / 8 / WINDOW_H          # metri lineari di finestra necessari
        have = lambda: sum(w.w for w in lay.windows if w.room_a == r.id)
        if have() >= need:
            continue
        sides = sorted(lay.ext_sides(r) or [s for s in "NESW" if lay.ext_spans(r, s)],
                       key=lambda s: -(r.rect.w if s in "NS" else r.rect.h))
        for side in sides:
            deficit = need - have()
            if deficit <= 0:
                break
            lay.add_windows(r.id, side, clamp(deficit, 1.2, 2.4), 3)


# ----------------------------------------------------------------------------
# VALUTAZIONE PROGETTUALE: come un interior designer sceglie tra più varianti
# ----------------------------------------------------------------------------
DAY_KINDS = ("living", "living_kitchen", "kitchen", "dining")


def _door_graph(lay: Layout) -> Dict[int, set]:
    """Stanze collegate da porte o aperte tra loro (stesso gruppo e muro in comune)."""
    g: Dict[int, set] = {r.id: set() for r in lay.rooms}
    for d in lay.doors:
        if d.room_b is not None:
            g[d.room_a].add(d.room_b)
            g[d.room_b].add(d.room_a)
    for i, a in enumerate(lay.rooms):
        for b in lay.rooms[i + 1:]:
            if a.group == b.group and shared_edge(a.rect, b.rect):
                g[a.id].add(b.id)
                g[b.id].add(a.id)
    return g


def _reachable(g: Dict[int, set], start: int, blocked: set) -> set:
    seen, stack = set(), [start]
    while stack:
        n = stack.pop()
        if n in seen or (n in blocked and n != start):
            continue
        seen.add(n)
        stack.extend(g[n])
    return seen


def design_review(lay: Layout, issues: List[str], wants: dict, furnished: bool = True) -> dict:
    """Punteggio 0-100 della variante con punti di forza e cose da migliorare.

    Criteri: luce naturale (superficie finestrata ≥ 1/8 del pavimento, soggiorno su più affacci),
    circolazione compatta, proporzioni dei locali, privacy (camere raggiungibili senza attraversare
    la zona giorno, bagni che non aprono sul soggiorno), equilibrio giorno/notte, arredo completo,
    bisogni richiesti soddisfatti, nessun problema di validazione.
    """
    score = 100.0
    good: List[str] = []
    bad: List[str] = []
    rooms = [r for r in lay.rooms if r.kind != "stairs"]   # il vano scala non conta nelle proporzioni del piano
    total = sum(r.rect.w * r.rect.h for r in rooms) or 1.0
    by_kind = lambda *k: [r for r in rooms if r.kind in k]
    items = {r.id: [i.type for i in lay.items if i.room_id == r.id] for r in rooms}

    # 1) validazione: un problema vero pesa più di ogni scelta estetica; poi gli arredi che non entrano
    if issues:
        score -= 10 * len(issues)
    missing = [n for n in lay.notes if "non inserit" in n or "insufficiente" in n]
    score -= 4 * len(missing)

    # 2) luce naturale (rapporto aero-illuminante 1/8)
    dark = []
    for r in by_kind(*HABITABLE):
        win = sum(w.w for w in lay.windows if w.room_a == r.id) * WINDOW_H
        need = r.rect.w * r.rect.h / 8
        if win < need - 1e-6:
            ratio = win / need if need else 1
            score -= 6 * (1 - ratio)
            dark.append(r.name)
    if dark:
        bad.append(f"Luce scarsa in: {', '.join(dark)} (finestre sotto 1/8 del pavimento)")
    elif by_kind(*HABITABLE):
        good.append("Tutti i locali abitabili hanno luce naturale adeguata (finestre ≥ 1/8 del pavimento)")
    living = by_kind("living", "living_kitchen")
    if living:
        sides = set()
        for w in lay.windows:
            if w.room_a == living[0].id:
                sides.add(w.orient + str(round(w.line, 2)))
        if len(sides) >= 2:
            score += 4
            good.append("Soggiorno luminoso, con finestre su due lati")

    # 3) circolazione: corridoi e ingresso oltre il 12-14% sono superficie sprecata
    circ = sum(r.rect.w * r.rect.h for r in by_kind("corridor", "entry"))
    pct = 100 * circ / total
    if pct > 14:
        score -= (pct - 14) * 1.2
        bad.append(f"Corridoi e ingresso occupano il {pct:.0f}% della superficie: si può recuperare spazio")
    elif circ:
        good.append(f"Circolazione compatta: {pct:.0f}% della superficie")

    # 4) proporzioni: stanze troppo allungate sono difficili da arredare
    for r in by_kind(*HABITABLE):
        ar = max(r.rect.w, r.rect.h) / max(0.1, min(r.rect.w, r.rect.h))
        if ar > (1.75 if r.kind == "bed" else 2.1):
            score -= 6
            bad.append(f"{r.name} è molto allungata ({r.rect.w:.1f} × {r.rect.h:.1f} m)")

    # 5) privacy
    entrance = next((d.room_a for d in lay.doors if d.room_b is None), None) or \
        next((r.id for r in lay.rooms if r.kind == "stairs"), None)
    if entrance is not None:
        g = _door_graph(lay)
        day_ids = {r.id for r in by_kind(*DAY_KINDS)}
        if entrance in day_ids and by_kind("bed"):
            # si entra direttamente nel soggiorno: chiunque arrivi lo attraversa per andare in camera
            score -= 5
            bad.append("Si entra direttamente nel soggiorno: un ingresso separato darebbe più privacy")
        private = set() if entrance in day_ids else _reachable(g, entrance, day_ids)
        crossing = [r.name for r in by_kind("bed") if r.id not in private]
        if crossing and entrance not in day_ids:
            score -= min(8, 4 * len(crossing))
            bad.append("Per raggiungere le camere si attraversa la zona giorno")
        elif by_kind("bed") and lay.room(entrance).kind not in DAY_KINDS:
            good.append("Ingresso separato: zona notte riservata, si entra senza attraversare il soggiorno")
            score += 3
    for d in lay.doors:
        if d.room_b is None:
            continue
        kinds = {lay.room(d.room_a).kind, lay.room(d.room_b).kind}
        if "bath" in kinds and kinds & set(DAY_KINDS):
            score -= 5
            bad.append("Un bagno si apre direttamente sul soggiorno o sulla cucina")

    # 6) equilibrio zona giorno / notte (solo case con camere)
    if by_kind("bed") and living:
        day = 100 * sum(r.rect.w * r.rect.h for r in by_kind(*DAY_KINDS)) / total
        if day < 25:
            score -= 6
            bad.append(f"Zona giorno sacrificata ({day:.0f}% della superficie)")
        elif day > 58:
            score -= 4
            bad.append(f"Zona giorno sovradimensionata rispetto alla notte ({day:.0f}%)")

    # 7) arredo completo (solo a pianta arredata: nella prima selezione conta la sola distribuzione)
    for r in (by_kind("bed") if furnished else []):
        t = items[r.id]
        if "bed" in t and "wardrobe" not in t and not r.suite:
            score -= 3
        if "bed" in t and "nightstand" not in t:
            score -= 1
    for r in (living if furnished else []):
        t = items[r.id]
        if not {"sofa", "sofa_corner"} & set(t):
            score -= 6
        if r.kind == "living_kitchen" and not {"table", "table_round", "kitchen_peninsula"} & set(t):
            score -= 3
            bad.append(f"{r.name}: manca lo spazio per il tavolo da pranzo")

    # 8) bisogni richiesti
    suites = [r for r in rooms if r.suite]
    if wants.get("suite"):
        if suites:
            score += 3
            good.append("Suite padronale con bagno privato e cabina armadio")
        else:
            score -= 8
    if wants.get("entry") is True and not by_kind("entry"):
        score -= 8
    for k, name in (("study", "studio"), ("storage", "ripostiglio"), ("laundry", "lavanderia")):
        if wants.get(k):
            if by_kind(k):
                good.append(f"Spazio dedicato: {name}")
            else:
                score -= 8
    if wants.get("peninsula") and furnished:
        if any(i.type == "kitchen_peninsula" for i in lay.items):
            good.append("Cucina con penisola e sgabelli")
        else:
            score -= 8

    raw = score
    score = int(round(clamp(score, 0, 100)))
    grade = "Ottimo" if score >= 85 else "Buono" if score >= 70 else "Discreto" if score >= 55 else "Da migliorare"
    return {"score": score, "grade": grade, "strengths": good[:6], "issues": bad[:6],
            "circulationPct": round(pct, 1), "raw": round(raw, 2)}


# ----------------------------------------------------------------------------
# API DEL MOTORE
# ----------------------------------------------------------------------------
def _wall_origin(lay: Layout, orient: str, line: float) -> float:
    extent = lay.L if orient == "h" else lay.W
    if line <= EPS: return 0.0
    if line >= extent - EPS: return extent - WALL
    return line - WALL / 2


def _export_opening(lay: Layout, o: Opening, is_door: bool) -> dict:
    org = _wall_origin(lay, o.orient, o.line)
    if o.orient == "h":
        d = {"x": o.start, "y": org, "w": o.w, "rot": 0}
    else:
        d = {"x": org + (WALL if ROT90_PIVOT_AT_WALL_RIGHT else 0.0), "y": o.start, "w": o.w, "rot": 90}
    if is_door:
        room = lay.room(o.swing_into)
        pos = room.rect.cy > o.line if o.orient == "h" else room.rect.cx > o.line
        dirn = 1 if pos else -1
        # il frontend usa rotate(rot): con rot=90 l'asse locale +y punta verso -x, quindi si inverte
        d["openDir"] = dirn if o.orient == "h" else -dirn
        d["entrance"] = o.room_b is None
        if o.kind:
            d["kind"] = o.kind
    return {k: (round(v, 3) if isinstance(v, float) else v) for k, v in d.items()}


def _normalize_shape(shape: Optional[str]) -> str:
    s = (shape or "auto").strip().lower()
    alias = {"rettangolare": "rect", "rettangolo": "rect", "rectangle": "rect", "rectangular": "rect",
             "scalare": "step", "stepped": "step", "s": "step", "z": "step",
             "casuale": "auto", "random": "auto", "varia": "auto"}
    s = alias.get(s, s)
    return s if s in ("auto", "rect", "l", "u", "t", "step") else "auto"


def compute_notches(lay: Layout) -> List[dict]:
    """Rettangoli del riquadro (bounding box) non occupati da stanze: rientranze/esterno."""
    xs = sorted({0.0, round(lay.W, 3)} | {round(v, 3) for r in lay.rooms for v in (r.rect.x, r.rect.x2)})
    ys = sorted({0.0, round(lay.L, 3)} | {round(v, 3) for r in lay.rooms for v in (r.rect.y, r.rect.y2)})
    rows = []
    for j in range(len(ys) - 1):
        ym = (ys[j] + ys[j + 1]) / 2
        runs, cur = [], None
        for i in range(len(xs) - 1):
            xm = (xs[i] + xs[i + 1]) / 2
            if lay.group_at(xm, ym) is None:
                if cur is not None and abs(cur[1] - xs[i]) < 1e-6:
                    cur[1] = xs[i + 1]
                else:
                    cur = [xs[i], xs[i + 1]]
                    runs.append(cur)
            else:
                cur = None
        rows.append((ys[j], ys[j + 1], [tuple(r) for r in runs]))
    out, open_ = [], {}
    for y0, y1, runs in rows:
        nxt = {}
        for run in runs:
            if run in open_ and abs(open_[run][3] - y0) < 1e-6:
                r = open_[run]
                r[3] = y1
            else:
                r = [run[0], y0, run[1], y1]
                out.append(r)
            nxt[run] = r
        open_ = nxt
    return [{"x": round(x0, 3), "y": round(y0, 3), "w": round(x1 - x0, 3), "h": round(y1 - y0, 3)}
            for x0, y0, x1, y1 in out]


def _build_layout(Wn: float, Ln: float, rt: str, n: int, palette: dict, shape: str,
                  rng: random.Random, opts: dict) -> Layout:
    if rt == "office":
        return layout_office(Wn, Ln, n_closed=max(1, n - 1), shape=shape, rng=rng)
    if rt == "hotel-room":
        return layout_hotel_room(Wn, Ln, shape=shape, rng=rng)
    if rt == "open-space":
        return layout_loft(Wn, Ln, office=False, shape=shape, rng=rng)
    if rt == "garage":
        return layout_garage(Wn, Ln, rng=rng, needs=opts["needs"])
    if rt == "garden":
        return layout_garden(Wn, Ln, rng=rng)
    return layout_apartment(Wn, Ln, opts["doubles"], opts["singles"], opts["baths"],
                            shape=shape, rng=rng, kitchen=opts["kitchen"], needs=opts["needs"],
                            program=opts["program"], access=opts["access"], stair=opts.get("stair"))


def default_bedrooms(num_rooms: int) -> Tuple[int, int]:
    """Locali principali (soggiorno incluso) -> (matrimoniali, singole), come in un taglio tipico:
    trilocale 1+1, quadrilocale 2+1, cinque locali 2+2."""
    beds = max(1, num_rooms - 1)
    doubles = 1 + max(0, beds - 1) // 2
    return doubles, beds - doubles


def generate(width: float, length: float, room_type: str = "apartment",
             num_rooms: int = 3, style: str = "modern",
             shape: str = "auto", seed: Optional[int] = None,
             double_bedrooms: Optional[int] = None, single_bedrooms: Optional[int] = None,
             bathrooms: Optional[int] = None, kitchen: str = "auto", peninsula: bool = False,
             needs: Optional[dict] = None, program: str = "full", access: str = "street",
             stair_type: str = "auto", core: Optional[dict] = None) -> dict:
    """Genera la pianta. Per gli appartamenti double/single_bedrooms e bathrooms, se indicati,
    hanno la precedenza su num_rooms; kitchen = auto | open | closed; peninsula = penisola in cucina;
    needs = {entry: True/False/"auto", suite, study, storage}.

    Piani di una casa (solo appartamenti): program = full | day | night; access = street | stairs | both
    (con stairs o both c'è il vano scala); stair_type = auto | u | l | straight; core = la scala di un
    altro piano dello stesso progetto ({x, y, w, h, type, entry, hand}, come in plan["stairs"][i]["core"]):
    la scala di questo piano va nello stesso punto.

    Si generano più varianti (schemi e proporzioni diverse) e si sceglie quella con il punteggio
    progettuale più alto (vedi design_review); stesso seed = stessa pianta."""
    rt = (room_type or "apartment").strip().lower()
    if rt in ("ufficio", "office", "workspace", "coworking"):
        rt = "office"
    elif rt in ("open-space", "open_space", "openspace", "loft", "monolocale", "studio"):
        rt = "open-space"
    elif rt in ("hotel-room", "hotel_room", "hotel", "camera hotel", "camera"):
        rt = "hotel-room"
    elif rt in ("garage", "box", "interrato", "basement", "piano interrato"):
        rt = "garage"
    elif rt in ("garden", "giardino", "esterno", "cortile"):
        rt = "garden"

    min_dim = 3.5 if rt == "hotel-room" else 3.0 if rt in ("garage", "garden") else 4.5
    W0 = snap(clamp(width, min_dim, 60.0))
    L0 = snap(clamp(length, min_dim, 60.0))
    early_notes = []
    # sotto ~30 m² un appartamento con camera chiusa non è abitabile: meglio un monolocale ben arredato
    if rt == "apartment" and W0 * L0 < 30:
        rt = "open-space"
        early_notes.append("Superficie troppo piccola per una camera separata: generato un monolocale.")
    # garage e giardino hanno il fronte strada a sud: non si ruotano
    transposed = W0 < L0 and rt not in ("hotel-room", "garage", "garden")
    Wn, Ln = (L0, W0) if transposed else (W0, L0)
    n = int(clamp(num_rooms, 1, 8))
    base_palette = PALETTES.get((style or "modern").lower(), PALETTES["modern"])
    palette = {**base_palette, **PALETTES["hotel"]} if rt == "hotel-room" else base_palette
    shape = _normalize_shape(shape)
    if double_bedrooms is None and single_bedrooms is None:
        double_bedrooms, single_bedrooms = default_bedrooms(n)
    opts = {
        "doubles": int(clamp(double_bedrooms or 0, 0, 5)),
        "singles": int(clamp(single_bedrooms or 0, 0, 5)),
        "baths": None if bathrooms is None else int(clamp(bathrooms, 1, 3)),
        "kitchen": kitchen if kitchen in ("open", "closed") else "auto",
        "needs": dict(needs or {}),
    }
    entry = opts["needs"].get("entry", "auto")
    opts["needs"]["entry"] = entry if entry in (True, False) else "auto"
    program = program if program in ("full", "day", "night") else "full"
    access = access if access in ("street", "stairs", "both") else "street"
    opts["program"], opts["access"] = (program, access) if rt == "apartment" else ("full", "street")
    with_stairs = rt == "apartment" and (access != "street" or bool(core))
    if access == "stairs":
        opts["needs"]["entry"] = False
    wants = {**opts["needs"], "peninsula": bool(peninsula)} if rt == "apartment" else {}
    if program != "full" and rt != "apartment":
        early_notes.append("Zona giorno/notte disponibile solo per gli appartamenti.")

    def stair_for(fx: bool, fy: bool) -> Optional[dict]:
        """La scala nelle coordinate interne del layout, data la specchiatura che si applicherà alla fine."""
        if not with_stairs:
            return None
        if not core:
            return {"type": stair_type if stair_type in STAIR_SLOT else "auto"}
        r = Rect(float(core["x"]), float(core["y"]), float(core["w"]), float(core["h"]))
        entry, hand = core.get("entry", "S"), core.get("hand", "W")
        if fx:
            r = Rect(W0 - r.x2, r.y, r.w, r.h)
            entry, hand = FLIP_X.get(entry, entry), FLIP_X.get(hand, hand)
        if fy:
            r = Rect(r.x, L0 - r.y2, r.w, r.h)
            entry, hand = FLIP_Y.get(entry, entry), FLIP_Y.get(hand, hand)
        if transposed:
            r = r.transposed()
            entry, hand = TRANSPOSE_SIDE[entry], TRANSPOSE_SIDE[hand]
        t = core.get("type") if core.get("type") in STAIR_SLOT else "u"
        return {"type": t, "core": r, "entry": entry, "hand": hand}

    # Stesso seed = stessa pianta. Si generano più varianti e si tiene quella progettata meglio:
    # 1) tutte le distribuzioni valutate sulla sola geometria (luce, circolazione, privacy...), che è
    #    veloce; 2) solo le più promettenti vengono arredate e valutate di nuovo, arredo compreso.
    base = int(seed) if seed is not None else random.randrange(1, 1_000_000)
    attempts = (12 if rt == "apartment" else 6) if W0 * L0 <= 900 else 4
    drafts = []
    for k in range(attempts):
        rng = random.Random(base * 101 + k * 7919)
        # con la scala già fissata si provano le quattro specchiature: in alcune la scala cade nelle file
        # del disimpegno, in altre nella zona giorno (e quella variante si scarta)
        mirror = (bool(k & 1), bool(k & 2)) if core else None
        opts["stair"] = stair_for(*(mirror or (False, False)))
        lay = _build_layout(Wn, Ln, rt, n, palette, shape, rng, opts)
        if lay is None:
            continue
        lay.mirror = mirror
        ensure_daylight(lay)
        lay.options["peninsula"] = bool(peninsula)
        lay.notes[:0] = early_notes
        # si confronta il punteggio grezzo: il tetto a 100 appiattirebbe le differenze tra varianti buone
        drafts.append((design_review(lay, [], wants, furnished=False)["raw"] - len(lay.notes), k, lay, rng))
    if not drafts:
        # la scala del piano accanto non trova posto: si genera con una scala propria; se non entra
        # neanche quella, senza scala (e lo si dice nelle note)
        plan = generate(width, length, room_type, num_rooms, style, shape, seed, double_bedrooms,
                        single_bedrooms, bathrooms, kitchen, peninsula, needs, program,
                        access if core else "street", stair_type)
        plan["notes"].insert(0, "La scala del piano accanto non trova posto in questa pianta: "
                                "prova misure più ampie o un'altra variante." if core else
                                "Con queste misure e questi locali la scala non entra: aumenta la superficie "
                                "o riduci le camere.")
        return plan
    drafts.sort(key=lambda d: (-d[0], d[1]))
    best = None
    for i, (_, _, lay, rng) in enumerate(drafts):
        # oltre le 3 migliori sulla carta si arreda solo se finora nessuna è uscita senza problemi:
        # negli spazi stretti è l'arredo a dire se una distribuzione funziona davvero
        if i >= 3 and best is not None and not best[3]:
            break
        furnish(lay)
        issues = validate(lay)
        lay.notes.extend(issues)
        review = design_review(lay, issues, wants)
        if best is None or review["raw"] > best[2]["raw"]:
            best = (lay, rng, review, issues)
    lay, rng, review, _ = best
    review.pop("raw", None)
    if transposed:
        lay.transpose()
    if rt in ("hotel-room", "garage", "garden"):
        lay.flip(rt == "hotel-room" and rng.random() < 0.5, False)
    elif lay.mirror is not None:
        lay.flip(*lay.mirror)                                  # la specchiatura che allinea la scala
    else:
        lay.flip(rng.random() < 0.5, rng.random() < 0.5)       # varianti speculari
    plan = serialize(lay, palette, base)
    plan["design"] = review
    return plan


HOUSE_PROGRAMS = ("full", "day", "night")


def generate_house(width: float, length: float, floors: List[dict], style: str = "modern",
                   seed: Optional[int] = None, stair_type: str = "auto") -> dict:
    """Casa su più piani generata insieme: una sola casa con la scala che collega tutti i piani.

    floors: [{level, program (full | day | night), double_bedrooms, single_bedrooms, bathrooms, kitchen,
    peninsula, needs}]. Il piano d'ingresso (il livello 0, altrimenti il più basso) ha la porta sulla
    facciata e la partenza della scala; gli altri si arriva dalla scala, che sta nello stesso punto
    su tutti i piani. Se la scala non si allinea si riprova con altre varianti del piano d'ingresso.
    Ritorna {"floors": [{level, program, plan}], "seed", "notes"}.
    """
    floors = sorted(floors, key=lambda f: f.get("level", 0))
    if not floors:
        raise ValueError("nessun piano richiesto")
    levels = [f.get("level", 0) for f in floors]
    entry = levels.index(0) if 0 in levels else 0
    base = int(seed) if seed is not None else random.randrange(1, 1_000_000)
    many = len(floors) > 1

    def one(f: dict, s: int, access: str, core: Optional[dict] = None) -> dict:
        prog = f.get("program") if f.get("program") in HOUSE_PROGRAMS else "full"
        return generate(width, length, "apartment", style=style, shape="rect", seed=s,
                        double_bedrooms=f.get("double_bedrooms"), single_bedrooms=f.get("single_bedrooms"),
                        bathrooms=f.get("bathrooms"), kitchen=f.get("kitchen") or "auto",
                        peninsula=bool(f.get("peninsula")), needs=f.get("needs"),
                        program=prog, access=access, stair_type=stair_type, core=core)

    best = None
    for attempt in range(4):
        s = base + attempt * 7919
        ground = one(floors[entry], s, "both" if many else "street")
        plans = {entry: ground}
        aligned = not many or bool(ground.get("stairs"))
        if aligned and many:
            core = ground["stairs"][0]["core"]
            for i, f in enumerate(floors):
                if i == entry:
                    continue
                p = one(f, s + 101 * (i + 1), "stairs", core)
                plans[i] = p
                st = p.get("stairs") or []
                aligned = aligned and bool(st) and all(abs(st[0]["core"][k] - core[k]) < 1e-3 for k in "xywh")
        score = sum(p["design"]["score"] for p in plans.values()) / len(plans)
        if best is None or (aligned, score) > (best[0], best[1]):
            best = (aligned, score, plans, s)
        if aligned:
            break
    aligned, _, plans, s = best
    notes = [] if aligned else ["La scala non si allinea su tutti i piani: prova misure più ampie o meno locali."]
    out = []
    for i, f in enumerate(floors):
        p = plans.get(i)
        if p is None:   # il piano d'ingresso non ha posto per la scala: gli altri piani si generano da soli
            p = one(f, s + 101 * (i + 1), "stairs")
        out.append({"level": levels[i], "program": f.get("program") or "full", "plan": p})
    return {"floors": out, "seed": s, "notes": notes}


def serialize(lay: Layout, palette: dict, seed: int) -> dict:
    """Layout -> dizionario nel formato di PlanResponse (usato da generate e dall'import DXF)."""
    walls = [] if lay.room_type == "garden" else build_walls(lay)
    kinds = [r.kind for r in lay.rooms]
    stats = {
        "grossArea": round(sum(r.rect.w * r.rect.h for r in lay.rooms), 2),
        "boundingBox": round(lay.W * lay.L, 2),
        "rooms": len(lay.rooms),
        "bedrooms": kinds.count("bed"),
        "bathrooms": kinds.count("bath") + kinds.count("wc"),
        "doors": len(lay.doors),
        "windows": len(lay.windows),
        "furniture": len(lay.items),
    }
    return {
        "dimensions": {"width": lay.W, "length": lay.L},
        "svgWidth": lay.W * SCALE,
        "svgHeight": lay.L * SCALE,
        "scale": SCALE,
        "wallThickness": WALL * SCALE,
        "shape": lay.shape,
        "seed": seed,
        "stats": stats,
        "notches": compute_notches(lay),
        "rooms": [{"id": r.id, "name": r.name, "kind": r.kind,
                   "x": r.rect.x, "y": r.rect.y, "w": r.rect.w, "h": r.rect.h,
                   "area": round(r.rect.w * r.rect.h, 2), "zone": r.group, "size": r.size,
                   "color": palette.get(KIND_GROUP.get(r.kind, "living"), "#f8fafc")} for r in lay.rooms],
        "walls": [{"x": x, "y": y, "w": w, "h": h} for x, y, w, h in walls],
        "doors": [_export_opening(lay, d, True) for d in lay.doors],
        "windows": [_export_opening(lay, w, False) for w in lay.windows],
        "furniture": [{"type": i.type, "x": round(i.rect.x, 3), "y": round(i.rect.y, 3),
                       "w": round(i.rect.w, 3), "h": round(i.rect.h, 3), "rot": 0.0,
                       "facing": i.facing, "room": i.room_id, "flip": i.flip} for i in lay.items],
        "stairs": export_stairs(lay),
        "notes": lay.notes,
    }


def export_stairs(lay: Layout) -> List[dict]:
    """Vani scala: `core` è l'ingombro da passare agli altri piani (core di generate), x/y/w/h il filo
    interno dei muri dove disegnare rampe e pianerottoli; entry = lato da cui si parte e si arriva,
    hand = muro lungo cui corre la prima rampa, type = u | l | straight."""
    out = []
    for r in lay.rooms:
        if not r.stair:
            continue
        c = r.stair["core"]
        x0 = c.x + (WALL if c.x <= EPS else WALL / 2)
        y0 = c.y + (WALL if c.y <= EPS else WALL / 2)
        x1 = c.x2 - (WALL if c.x2 >= lay.W - EPS else WALL / 2)
        y1 = c.y2 - (WALL if c.y2 >= lay.L - EPS else WALL / 2)
        out.append({"room": r.id, "type": r.stair["type"], "entry": r.stair["entry"], "hand": r.stair["hand"],
                    "x": round(x0, 3), "y": round(y0, 3), "w": round(x1 - x0, 3), "h": round(y1 - y0, 3),
                    "core": {"x": round(c.x, 3), "y": round(c.y, 3), "w": round(c.w, 3), "h": round(c.h, 3),
                             "type": r.stair["type"], "entry": r.stair["entry"], "hand": r.stair["hand"]}})
    return out


# ----------------------------------------------------------------------------
# ANTEPRIMA SVG (utile per debug: GET /preview)
# ----------------------------------------------------------------------------
_FCOL = {"bed": "#c7d2fe", "sofa": "#fbcfe8", "tv": "#334155", "table": "#fde68a", "desk": "#bbf7d0",
         "kitchen_counter": "#fed7aa", "toilet": "#ffffff", "sink": "#ffffff", "shower": "#bae6fd",
         "wardrobe": "#d6d3d1"}


def to_svg(plan: dict) -> str:
    s, t = plan["scale"], plan["wallThickness"]
    W, H = plan["svgWidth"], plan["svgHeight"]
    pad = 20
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W + 2 * pad}" height="{H + 2 * pad}" '
           f'viewBox="{-pad} {-pad} {W + 2 * pad} {H + 2 * pad}" font-family="sans-serif">',
           f'<rect x="{-pad}" y="{-pad}" width="{W + 2 * pad}" height="{H + 2 * pad}" fill="white"/>']
    for r in plan["rooms"]:
        out.append(f'<rect x="{r["x"] * s}" y="{r["y"] * s}" width="{r["w"] * s}" height="{r["h"] * s}" fill="{r["color"]}"/>')
    for w in plan["walls"]:
        out.append(f'<rect x="{w["x"] * s}" y="{w["y"] * s}" width="{w["w"] * s}" height="{w["h"] * s}" fill="#1e293b"/>')
    for w in plan["windows"]:
        if w["rot"] == 0:
            out.append(f'<rect x="{w["x"] * s}" y="{w["y"] * s}" width="{w["w"] * s}" height="{t}" fill="#7dd3fc" stroke="#0369a1"/>')
        else:
            x0 = w["x"] * s - (t if ROT90_PIVOT_AT_WALL_RIGHT else 0)
            out.append(f'<rect x="{x0}" y="{w["y"] * s}" width="{t}" height="{w["w"] * s}" fill="#7dd3fc" stroke="#0369a1"/>')
    for d in plan["doors"]:
        dr = d["openDir"] if d["rot"] == 0 else -d["openDir"]
        w = d["w"] * s
        if d["rot"] == 0:
            x, y = d["x"] * s, d["y"] * s
            yc = y + t / 2
            out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{t}" fill="white"/>')
            sw = 0 if dr > 0 else 1
            out.append(f'<path d="M{x},{yc + dr * w} A{w},{w} 0 0 {sw} {x + w},{yc}" fill="none" stroke="#b45309"/>'
                       f'<line x1="{x}" y1="{yc}" x2="{x}" y2="{yc + dr * w}" stroke="#b45309" stroke-width="2"/>')
        else:
            x = d["x"] * s - (t if ROT90_PIVOT_AT_WALL_RIGHT else 0)
            y = d["y"] * s
            xc = x + t / 2
            out.append(f'<rect x="{x}" y="{y}" width="{t}" height="{w}" fill="white"/>')
            sw = 1 if dr > 0 else 0
            out.append(f'<path d="M{xc + dr * w},{y} A{w},{w} 0 0 {sw} {xc},{y + w}" fill="none" stroke="#b45309"/>'
                       f'<line x1="{xc}" y1="{y}" x2="{xc + dr * w}" y2="{y}" stroke="#b45309" stroke-width="2"/>')
    for f in plan["furniture"]:
        c = _FCOL.get(f["type"], "#e5e7eb")
        out.append(f'<rect x="{f["x"] * s}" y="{f["y"] * s}" width="{f["w"] * s}" height="{f["h"] * s}" '
                   f'fill="{c}" stroke="#475569" stroke-width="1"/>')
        if min(f["w"], f["h"]) * s > 14:
            out.append(f'<text x="{(f["x"] + f["w"] / 2) * s}" y="{(f["y"] + f["h"] / 2) * s + 3}" '
                       f'font-size="9" text-anchor="middle" fill="#334155">{f["type"]}</text>')
    for r in plan["rooms"]:
        out.append(f'<text x="{(r["x"] + r["w"] / 2) * s}" y="{(r["y"] + r["h"] / 2) * s - 6}" font-size="11" '
                   f'font-weight="bold" text-anchor="middle" fill="#0f172a" opacity="0.55">{r["name"]}</text>')
    out.append("</svg>")
    return "".join(out)


# ----------------------------------------------------------------------------
# IMPORTAZIONE DXF E ARREDO
# ----------------------------------------------------------------------------
_ROOM_LAYERS = {"aree", "area", "room", "rooms", "stanza", "stanze", "locali"}
_OTHER_LAYERS = ("muri", "wall", "arredi", "furniture", "quote", "dim")
PASS_COST = {"corridor": 0, "living": 0.5, "living_kitchen": 0.5, "kitchen": 1, "study": 2, "bed": 3, "bath": 8}


def _read_dxf_polylines(dxf_content: str) -> List[Tuple[str, List[Tuple[float, float]]]]:
    """(layer, punti) di ogni LWPOLYLINE con almeno 3 vertici."""
    lines = [l.strip() for l in dxf_content.splitlines()]
    out, cur_type, layer, pts = [], None, "", []

    def flush():
        if cur_type == "LWPOLYLINE" and len(pts) >= 3:
            out.append((layer, list(pts)))

    for i in range(0, len(lines) - 1, 2):
        try:
            code = int(lines[i])
        except ValueError:
            continue
        val = lines[i + 1]
        if code == 0:
            flush()
            cur_type, layer, pts = val.upper(), "", []
        elif code == 8:
            layer = val
        elif cur_type == "LWPOLYLINE" and code in (10, 20):
            try:
                v = float(val)
            except ValueError:
                continue
            if code == 10:
                pts.append([v, 0.0])
            elif pts:
                pts[-1][1] = v
    flush()
    return out


def connect_rooms(lay: Layout, entrance_room: Room) -> None:
    """Porte solo tra stanze con un muro in comune, in modo che tutte siano raggiungibili dall'ingresso.

    Albero di copertura a costo minimo (Prim): si preferisce passare da disimpegni e soggiorni
    piuttosto che attraversare camere o bagni. Le stanze isolate ricevono un ingresso proprio.
    """
    reached, failed = {entrance_room.id}, set()
    while True:
        best = None
        for a in lay.rooms:
            if a.id not in reached:
                continue
            for b in lay.rooms:
                if b.id in reached or (a.id, b.id) in failed:
                    continue
                e = shared_edge(a.rect, b.rect)
                if e is None or e[3] - e[2] < 1.0:
                    continue
                cost = PASS_COST.get(a.kind, 2) - (e[3] - e[2]) * 0.01
                if best is None or cost < best[0]:
                    best = (cost, a, b)
        if best is None:
            break
        _, a, b = best
        width = DOOR_W_BATH if "bath" in (a.kind, b.kind) else DOOR_W
        if lay.add_door(a.id, b.id, width, 0.5, into=b.id):
            reached.add(b.id)
        else:
            failed.add((a.id, b.id))
    for r in lay.rooms:
        if r.id in reached:
            continue
        side = lay.best_ext_side(r)
        if side:
            lay.add_entrance(r.id, side)
            lay.notes.append(f"{r.name} non confina con altre stanze: ha un ingresso indipendente")
        else:
            lay.notes.append(f"{r.name} non raggiungibile")


def import_dxf_data(dxf_content: str, style: str = "modern") -> dict:
    """Importa le stanze (polilinee chiuse) da un DXF e le arreda.

    Unità riconosciute: m, cm, mm. Se il file ha un layer delle stanze (AREE/ROOMS/STANZE) si usa
    solo quello, altrimenti tutte le polilinee tranne muri e arredi. Le stanze sono approssimate
    dal loro rettangolo d'ingombro, agganciate tra loro per assorbire lo spessore dei muri del CAD.
    """
    palette = PALETTES.get((style or "modern").lower(), PALETTES["modern"])
    polys = _read_dxf_polylines(dxf_content)
    tagged = [p for l, p in polys if l.strip().lower() in _ROOM_LAYERS]
    polys = tagged or [p for l, p in polys if not l.strip().lower().startswith(_OTHER_LAYERS)]
    pts = [p for poly in polys for p in poly]
    if not pts:
        plan = generate(10.0, 8.0, "apartment", 3, style)
        plan["notes"] = ["Nessuna polilinea chiusa nel DXF: generata una pianta di esempio."] + plan["notes"]
        return plan

    min_x, max_x = min(p[0] for p in pts), max(p[0] for p in pts)
    min_y, max_y = min(p[1] for p in pts), max(p[1] for p in pts)
    size = max(max_x - min_x, max_y - min_y)
    k = next((f for f in (1.0, 0.01, 0.001) if size * f <= 60), 0.001)
    W, L = snap((max_x - min_x) * k), snap((max_y - min_y) * k)

    # rettangoli d'ingombro, y ribaltata (nel DXF cresce verso l'alto); il contorno esterno non è una stanza
    boxes = []
    for poly in polys:
        xs = [(p[0] - min_x) * k for p in poly]
        ys = [(max_y - p[1]) * k for p in poly]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        if x1 - x0 >= 1.2 and y1 - y0 >= 1.2 and (x1 - x0) * (y1 - y0) < W * L * 0.9:
            boxes.append([x0, y0, x1, y1])
    if not boxes:
        n = max(2, min(5, int(W * L / 20)))
        plan = generate(max(W, 5.0), max(L, 5.0), "apartment", n, style)
        plan["notes"] = ["DXF importato: riconosciuto solo il perimetro, stanze generate automaticamente."] + plan["notes"]
        return plan

    # aggancio: bordi a meno di 35 cm (spessore muro) diventano coincidenti; bordi vicini al perimetro vanno sul perimetro
    boxes.sort(key=lambda b: -(b[2] - b[0]) * (b[3] - b[1]))
    xs_ref, ys_ref = [0.0, W], [0.0, L]
    for b in boxes:
        for i, ref in ((0, xs_ref), (2, xs_ref), (1, ys_ref), (3, ys_ref)):
            near = min(ref, key=lambda v: abs(v - b[i]))
            if abs(near - b[i]) <= 0.35:
                b[i] = near
        xs_ref += [b[0], b[2]]
        ys_ref += [b[1], b[3]]

    lay = Layout(W, L)
    lay.shape = "rect"
    for idx, (x0, y0, x1, y1) in enumerate(boxes):
        area = (x1 - x0) * (y1 - y0)
        if idx == 0:
            name, kind = "Soggiorno con Cucina", "living_kitchen"
        elif area <= 5.5:
            name, kind = "Bagno", "bath"
        elif area >= 9:
            name, kind = "Camera", "bed"
        else:
            name, kind = f"Locale {idx + 1}", "study"
        lay.add_room(name, kind, snap(x0), snap(y0), snap(x1), snap(y1))

    living = lay.rooms[0]
    side = lay.best_ext_side(living) or "S"
    lay.add_entrance(living.id, side, DOOR_W, 0.3)
    connect_rooms(lay, living)
    for r in lay.rooms:
        best = lay.best_ext_side(r)
        if best:
            lay.add_windows(r.id, best, 0.6 if r.kind == "bath" else 1.4, 1 if r.kind == "bath" else 2)
    furnish(lay)
    lay.notes.insert(0, f"Importate {len(lay.rooms)} stanze dal file DXF e arredate automaticamente.")
    return serialize(lay, palette, random.randrange(1, 1_000_000))
