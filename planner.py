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

# Convenzione per le aperture verticali (rot=90). Il frontend ruota l'elemento
# attorno al punto (x, y): con True x = bordo DESTRO del muro, con False = bordo sinistro.
ROT90_PIVOT_AT_WALL_RIGHT = True

# Se il frontend sa disegnare anche "wardrobe", metti True.
EXTENDED_FURNITURE = True

OPP = {"N": "S", "S": "N", "E": "W", "W": "E"}
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
KIND_GROUP = {"living": "living", "living_kitchen": "living", "zone_day": "living", "kitchen": "kitchen",
              "bed": "bed", "zone_night": "bed", "bath": "bath", "wc": "bath", "corridor": "corridor",
              "office_open": "office", "meeting": "meeting", "director": "meeting", "study": "study",
              "hotel_room": "living"}


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


@dataclass
class Opening:
    orient: str            # 'h' = muro lungo x, 'v' = muro lungo y
    line: float            # coordinata (asse perpendicolare) della mezzeria del muro
    start: float           # inizio lungo il muro
    w: float
    room_a: int
    room_b: Optional[int]  # None = esterno
    swing_into: Optional[int] = None


@dataclass
class Item:
    type: str
    rect: Rect
    room_id: int
    gap: float = 0.05
    keep: Optional[Rect] = None   # area di rispetto (es. davanti al WC)
    facing: str = ""

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

    # -- stanze --------------------------------------------------------------
    def add_room(self, name, kind, x0, y0, x1, y1, group=None, master=False) -> Room:
        rid = len(self.rooms) + 1
        rect = Rect(round(x0, 3), round(y0, 3), round(x1 - x0, 3), round(y1 - y0, 3))
        room = Room(rid, name, kind, rect, group or rid, master)
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

    def add_entrance(self, room_id: int, side: str, width: float = DOOR_W, at: float = 0.5) -> Opening:
        room = self.room(room_id)
        orient, line, lo, hi = self._side_geom(room, side)
        margin = 0.35
        avail = hi - lo - 2 * margin
        w = min(width, avail)
        start = snap(lo + margin + (avail - w) * at)
        start = clamp(start, lo + margin, hi - margin - w)
        d = Opening(orient, line, round(start, 3), round(w, 3), room_id, None, room_id)
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
            if room.kind == "corridor":
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
        for o in self.doors + self.windows:
            o.orient = "v" if o.orient == "h" else "h"
        for it in self.items:
            it.rect = it.rect.transposed()
            it.keep = it.keep.transposed()
            it.facing = TRANSPOSE_SIDE.get(it.facing, it.facing)

    # -- specchiatura (varianti della stessa pianta) -----------------------------
    def flip(self, fx: bool, fy: bool):
        if not (fx or fy):
            return
        W, L = self.W, self.L

        def fr(r: Rect) -> Rect:
            return Rect(round(W - r.x2, 3) if fx else r.x, round(L - r.y2, 3) if fy else r.y, r.w, r.h)

        for r in self.rooms:
            r.rect = fr(r.rect)
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

    def invalidate(self):
        self._dz.clear()

    # -- info stanza ---------------------------------------------------------
    def inner(self, room: Room) -> Rect:
        if room.id not in self._inner:
            self._inner[room.id] = self.lay.inner(room)
        return self._inner[room.id]

    def door_zones(self, room: Room) -> List[Rect]:
        """Aree che devono restare libere: arco di apertura + passaggio."""
        if room.id in self._dz:
            return self._dz[room.id]
        zones = []
        for d in self.lay.doors:
            if room.id not in (d.room_a, d.room_b):
                continue
            into = d.swing_into == room.id
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
        opened = self.lay.open_sides(room)
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

    def place_corner(self, room, typ, w, h, gap=0.0, far_from_door=True) -> Optional[Item]:
        inn, opened = self.inner(room), self.lay.open_sides(room)
        cands = []
        for sy, sx in (("N", "W"), ("N", "E"), ("S", "W"), ("S", "E")):
            if sy in opened or sx in opened:
                continue
            x = inn.x if sx == "W" else inn.x2 - w
            y = inn.y if sy == "N" else inn.y2 - h
            cands.append(Rect(x, y, w, h))
        dcs = self.door_centers(room)
        def score(r):
            return -min(((r.cx - x) ** 2 + (r.cy - y) ** 2) ** 0.5 for x, y in dcs) if dcs and far_from_door else 0
        for r in sorted(cands, key=score):
            if self.fits(room, r, gap):
                return self._put(room, typ, r, gap)
        return None

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
def furnish_bath(P: Placer, room: Room, shower: bool = True) -> bool:
    lay = P.lay

    def attempt() -> bool:
        P.clear(room)
        sides = P.sides_far_from_door(room)
        if shower and not (P.place_corner(room, "shower", 0.9, 0.9) or P.place_corner(room, "shower", 0.8, 0.8)):
            return False
        if not (P.place_wall(room, "toilet", 0.4, 0.7, sides, gap=0.15, front=0.5) or
                P.place_wall(room, "toilet", 0.4, 0.6, sides, gap=0.1, front=0.35)):
            return False
        if not (P.place_wall(room, "sink", 0.6, 0.5, sides, gap=0.1, front=0.4) or
                P.place_wall(room, "sink", 0.5, 0.4, sides, gap=0.05, front=0.3)):
            return False
        return True

    if attempt():
        return True
    # secondo tentativo: la porta si apre verso l'esterno
    for d in lay.doors:
        if d.swing_into == room.id and d.room_b is not None:
            d.swing_into = d.room_a if d.room_b == room.id else d.room_b
    P.invalidate()
    if attempt():
        return True
    lay.notes.append(f"{room.name}: spazio insufficiente per tutti i sanitari")
    return False


def furnish_bedroom(P: Placer, room: Room):
    r = room.rect
    area, short = r.w * r.h, min(r.w, r.h)
    if room.master and area >= 13 and short >= 3.2:   widths = [1.8, 1.6, 0.9]
    elif area >= 10.5 and short >= 2.9:               widths = [1.6, 0.9]
    else:                                             widths = [0.9]
    sides = P.sides_far_from_door(room)
    bed = None
    for width in widths:
        for avoid in (True, False):
            bed = P.place_wall(room, "bed", width, 2.0, sides, gap=0.45, avoid_windows=avoid, zone_gap=0.35)
            if bed: break
        if bed: break
    if not bed:
        P.lay.notes.append(f"{room.name}: letto non inserito (stanza troppo piccola)")
        return
    wins = P.window_sides(room)
    sides2 = wins + [s for s in "NSEW" if s not in wins]
    if not room.master and area >= 11:
        P.place_wall(room, "desk", 1.2, 0.6, sides2, gap=0.4, zone_gap=0.2)
    if EXTENDED_FURNITURE:
        P.place_wall(room, "wardrobe", 1.8, 0.6, "NSEW", gap=0.5, zone_gap=0.3)


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
                    for sofa_len in (2.2, 1.8):
                        sofa = P.place_wall(room, "sofa", sofa_len, 0.9, [sofa_side], target=target,
                                            gap=0.3, zone_gap=0.3, allow_open=allow_open_sofa)
                        if sofa:
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


def _place_counter(P: Placer, room: Room, prefer: List[str]) -> Optional[Item]:
    inn = P.inner(room)
    for length in (3.6, 3.0, 2.4, 1.8, 1.2):
        for side in prefer:
            span = inn.w if side in "NS" else inn.h
            if span < length:
                continue
            it = P.place_wall(room, "kitchen_counter", length, 0.6, [side], order="start",
                              gap=0.1, zone_gap=0.1)
            if it:
                return it
    return None


def furnish_kitchen(P: Placer, room: Room):
    wins = P.window_sides(room)
    prefer = wins + [s for s in "NSEW" if s not in wins]
    counter = _place_counter(P, room, prefer)
    if not counter:
        P.lay.notes.append(f"{room.name}: piano cottura non inserito")
        return
    if room.rect.w * room.rect.h >= 9:
        for w, h in ((1.2, 0.8), (0.9, 0.7)):
            if P.place_free(room, "table", w, h, gap=0.85, zone_gap=0.3):
                break


def furnish_living(P: Placer, room: Room, with_kitchen: bool = False):
    inn = P.inner(room)
    if with_kitchen:
        exits = [s for s in "NSEW" if s in P.lay.ext_sides(room)]
        # cucina sul lato più lontano dall'ingresso, preferibilmente con finestra
        far = P.sides_far_from_door(room)
        prefer = [s for s in far if s in P.window_sides(room)] + far
        counter = _place_counter(P, room, prefer)
        if not counter:
            P.lay.notes.append(f"{room.name}: angolo cottura non inserito")
    if not _place_media(P, room) and not _place_media_free(P, room):
        if room.rect.w * room.rect.h >= 14:
            P.lay.notes.append(f"{room.name}: zona TV/divano non inserita")
    area = room.rect.w * room.rect.h
    if with_kitchen or area >= 18:
        near = None
        for it in P.placed[room.id]:
            if it.type == "kitchen_counter":
                near = (it.rect.cx, it.rect.cy)
        for w, h in ((1.6, 0.9), (1.2, 0.8)):
            if P.place_free(room, "table", w, h, near=near, gap=0.9, zone_gap=0.3):
                break


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
        elif k == "kitchen":        furnish_kitchen(P, r)
        elif k == "zone_night":     furnish_sleep_zone(P, r)
        elif k == "study":          furnish_study(P, r)
        elif k == "meeting":        furnish_meeting(P, r)
        elif k == "director":       furnish_director(P, r)
        elif k == "office_open":    furnish_office_open(P, r)
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
    for _ in range(8):
        if rem < 0.005:
            break
        elig = [i for i in range(n) if widths[i] < caps[i] - EPS]
        if not elig:
            caps = [float("inf")] * n
            elig = list(range(n))
        wsum = sum(specs[i][1] for i in elig)
        used = 0.0
        for i in elig:
            add = min(rem * specs[i][1] / wsum, caps[i] - widths[i])
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


MIN_W = {"bed": 3.0, "bath": 2.4, "study": 2.8}
CAP_W = {"bed": 4.6, "bath": 3.2, "study": 3.6}
WGT = {"bed": 1.0, "bath": 0.6, "study": 0.8}


def _night_config(bedrooms: int, two_sided: bool, W: float, L: float):
    baths = 2 if (bedrooms >= 3 and W * L >= 95) else 1
    beds = [("bed", i) for i in range(bedrooms)]
    if two_sided:
        south = [("bath", j) for j in range(baths)]
        north: list = []
        for b in beds:
            sn = sum(MIN_W[k] for k, _ in north)
            ss = sum(MIN_W[k] for k, _ in south)
            (north if sn <= ss else south).append(b)
        if len(north) + len(south) < 3:
            south.append(("study", 0))
        north.reverse()                        # camera matrimoniale in fondo (est)
    else:
        north = [("bath", j) for j in range(baths)] + beds[::-1]
        south = []
    return north, south


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
            if not any(k == "bed" and i == 0 for k, i in o[sl[0]:sl[1]]):
                return o
    return opts[0]


def layout_compact_apartment(W: float, L: float, bedrooms: int = 1, shape: str = "auto",
                             rng: Optional[random.Random] = None) -> Layout:
    """Planimetria compatta ottimizzata per bilocali e trilocali (5-9m).
    Tutte le camere da letto hanno pareti chiuse indipendenti, porte e finestre."""
    rng = rng or random.Random(0)
    lay = Layout(W, L)
    lay.shape = "rect"

    # Divisione tra zona giorno e zona notte
    xw = snap(clamp(W * rng.uniform(0.48, 0.56), 3.2, W - 2.8))

    # Lato sinistro: Zona giorno
    liv = lay.add_room("Soggiorno con Cucina", "living_kitchen", 0, 0, xw, L, group=1)

    # Lato destro: notte e servizi
    bath_h = snap(clamp(L * 0.38, 2.3, 2.8))
    bed_h = snap(L - bath_h)

    if bedrooms >= 2 and L >= 7.5 and (W - xw) >= 3.0:
        # Due camere chiuse separate
        h1 = snap(bed_h * 0.55)
        bed1 = lay.add_room("Camera Matrimoniale", "bed", xw, 0, W, h1, group=2, master=True)
        bed2 = lay.add_room("Cameretta", "bed", xw, h1, W, bed_h, group=3)
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
        # Bilocale: camera matrimoniale chiusa con muri e porta
        bed = lay.add_room("Camera Matrimoniale", "bed", xw, 0, W, bed_h, group=2, master=True)
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


def layout_apartment(W: float, L: float, bedrooms: int, palette: dict,
                     shape: str = "auto", rng: Optional[random.Random] = None) -> Layout:
    rng = rng or random.Random(0)
    two_order = (True, False) if L >= 7.2 else (False,)
    if len(two_order) == 2 and shape not in ("t", "step") and rng.random() < 0.3:
        two_order = (False, True)
    chosen = None
    for b in range(bedrooms, 0, -1):
        for two in two_order:
            north, south = _night_config(b, two, W, L)
            nmin = max(sum(MIN_W[k] for k, _ in north), sum(MIN_W[k] for k, _ in south))
            if W - nmin >= DAY_MIN:
                chosen = (b, two, north, south, nmin)
                break
        if chosen:
            break
    if not chosen:
        return layout_compact_apartment(W, L, bedrooms=max(1, bedrooms), shape=shape, rng=rng)

    b, two, north, south, nmin = chosen
    lay = Layout(W, L)
    if b < bedrooms:
        lay.notes.append(f"Con queste dimensioni entrano al massimo {b} camere da letto (richieste {bedrooms}).")

    xd = snap(clamp(W * rng.uniform(0.40, 0.50), DAY_MIN, W - nmin))
    if two:
        dn = snap((L - CORRIDOR) / 2)
        n_y0, n_y1 = 0.0, dn
        c_y0, c_y1 = dn, snap(dn + CORRIDOR)
        s_y0, s_y1 = c_y1, L
    else:
        dn = snap(L - CORRIDOR)
        n_y0, n_y1 = 0.0, dn
        c_y0, c_y1 = dn, L

    # sagoma: quali stanze delle file notte vengono accorciate
    options = ["l", "u"] + (["t", "step"] if two else [])
    wanted = _resolve_shape(shape, rng, options)
    notches, lay.shape = _apartment_notches(wanted, rng, len(north), len(south), two, dn)
    if shape not in ("auto", "rect") and lay.shape == "rect":
        lay.notes.append("Con queste misure non è possibile una sagoma irregolare: pianta rettangolare.")
    north = _pick_order(north, notches.get("N"), rng)
    south = _pick_order(south, notches.get("S"), rng)

    corridor = lay.add_room("Disimpegno", "corridor", xd, c_y0, W, c_y1)

    def make_side(items, y0, y1, side, notch):
        specs = []
        for k, i in items:
            cap = CAP_W[k] + (0.6 if (k == "bed" and i == 0) else 0)
            specs.append((MIN_W[k], WGT[k] * rng.uniform(0.85, 1.25), cap))
        widths = distribute(W - xd, specs)
        xs = _edges(xd, W, widths)
        rooms = []
        for idx, (k, i) in enumerate(items):
            x0, x1 = xs[idx], xs[idx + 1]
            ya, yb = y0, y1
            if notch and notch[0] <= idx < notch[1]:
                if side == "N":
                    ya = snap(y0 + notch[2])
                else:
                    yb = snap(y1 - notch[2])
            area = (x1 - x0) * (yb - ya)
            if k == "bed":
                master = (i == 0)
                nm = "Camera Matrimoniale" if master else ("Cameretta" if area < 10 else f"Camera {i + 1}")
                room = lay.add_room(nm, "bed", x0, ya, x1, yb, master=master)
            elif k == "bath":
                room = lay.add_room("Bagno" if i == 0 else f"Bagno {i + 1}", "bath", x0, ya, x1, yb)
            else:
                room = lay.add_room("Studio", "study", x0, ya, x1, yb)
            rooms.append((room, side))
        return rooms

    night = make_side(north, n_y0, n_y1, "N", notches.get("N"))
    if two:
        night += make_side(south, s_y0, s_y1, "S", notches.get("S"))

    # zona giorno
    yk = snap(clamp(L * 0.36, 2.6, 3.6))
    yk = min(yk, snap(dn + CORRIDOR - 1.5))
    closed_kitchen = (L >= 6.0 and xd * L >= 30 and yk >= 2.6 and (L - yk) >= 3.2
                      and rng.random() < 0.8)
    if closed_kitchen:
        kit = lay.add_room("Cucina", "kitchen", 0, 0, xd, yk)
        liv = lay.add_room("Soggiorno", "living", 0, yk, xd, L)
        lay.add_door(kit.id, liv.id, DOOR_W, 0.5, into=liv.id)
        lay.add_windows(kit.id, lay.best_ext_side(kit), 1.3, 2)
    else:
        liv = lay.add_room("Soggiorno con Cucina", "living_kitchen", 0, 0, xd, L)

    lay.add_entrance(liv.id, "S", DOOR_W, 0.3)
    lay.add_door(liv.id, corridor.id, DOOR_W, 0.5, into=liv.id)
    lay.add_windows(liv.id, "W", 2.0, 2)
    lay.add_windows(liv.id, "S", 1.6, 1)
    if "N" in lay.ext_sides(liv):
        lay.add_windows(liv.id, "N", 1.6, 2)

    for room, side in night:
        wd = DOOR_W_BATH if room.kind == "bath" else DOOR_W
        lay.add_door(room.id, corridor.id, wd, 0.15, into=room.id)
        ww = {"bed": 1.5, "bath": 0.7, "study": 1.3}[room.kind]
        lay.add_windows(room.id, side, ww, 2)
    lay.add_partial_windows()
    return lay


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
        b = lay.add_room("Camera da Letto", "bed", W - bw, bh, W, yb, group=2, master=True)
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
    entrance = [d for d in lay.doors if d.room_b is None]
    if not entrance:
        issues.append("manca l'ingresso")
    else:
        adj: Dict[int, set] = {}
        for d in lay.doors:
            if d.room_b is not None:
                ga, gb = lay.room(d.room_a).group, lay.room(d.room_b).group
                adj.setdefault(ga, set()).add(gb)
                adj.setdefault(gb, set()).add(ga)
        seen, stack = set(), [lay.room(entrance[0].room_a).group]
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
        if r.kind in ("living", "living_kitchen", "zone_day") and "sofa" not in types \
                and r.rect.w * r.rect.h >= 14:
            issues.append(f"{r.name} senza divano")
        if r.kind in ("bed", "living", "living_kitchen", "kitchen", "office_open", "zone_day",
                      "zone_night", "study", "director", "meeting") and not wins and r.kind != "meeting":
            issues.append(f"{r.name} senza finestre")
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
                  rng: random.Random) -> Layout:
    if rt == "office":
        return layout_office(Wn, Ln, n_closed=max(1, n - 1), shape=shape, rng=rng)
    if rt == "hotel-room":
        return layout_hotel_room(Wn, Ln, shape=shape, rng=rng)
    if rt == "open-space":
        return layout_loft(Wn, Ln, office=False, shape=shape, rng=rng)
    return layout_apartment(Wn, Ln, bedrooms=max(1, n - 1), palette=palette, shape=shape, rng=rng)


def generate(width: float, length: float, room_type: str = "apartment",
             num_rooms: int = 3, style: str = "modern",
             shape: str = "auto", seed: Optional[int] = None) -> dict:
    rt = (room_type or "apartment").strip().lower()
    if rt in ("ufficio", "office", "workspace", "coworking"):
        rt = "office"
    elif rt in ("open-space", "open_space", "openspace", "loft", "monolocale", "studio"):
        rt = "open-space"
    elif rt in ("hotel-room", "hotel_room", "hotel", "camera hotel", "camera"):
        rt = "hotel-room"

    min_dim = 3.5 if rt == "hotel-room" else 4.5
    W0 = snap(clamp(width, min_dim, 60.0))
    L0 = snap(clamp(length, min_dim, 60.0))
    transposed = W0 < L0 and rt != "hotel-room"
    Wn, Ln = (L0, W0) if transposed else (W0, L0)
    n = int(clamp(num_rooms, 1, 8))
    base_palette = PALETTES.get((style or "modern").lower(), PALETTES["modern"])
    palette = {**base_palette, **PALETTES["hotel"]} if rt == "hotel-room" else base_palette
    shape = _normalize_shape(shape)

    # Stesso seed = stessa pianta. Si provano più varianti e si tiene la più pulita.
    base = int(seed) if seed is not None else random.randrange(1, 1_000_000)
    attempts = 6 if W0 * L0 <= 900 else 2
    best = None
    for k in range(attempts):
        rng = random.Random(base * 101 + k * 7919)
        lay = _build_layout(Wn, Ln, rt, n, palette, shape, rng)
        furnish(lay)
        lay.notes.extend(validate(lay))
        if best is None or len(lay.notes) < len(best[0].notes):
            best = (lay, rng)
        if not lay.notes:
            break
    lay, rng = best
    if transposed:
        lay.transpose()
    if rt == "hotel-room":
        lay.flip(rng.random() < 0.5, False)
    else:
        lay.flip(rng.random() < 0.5, rng.random() < 0.5)       # varianti speculari
    return serialize(lay, palette, base)


def serialize(lay: Layout, palette: dict, seed: int) -> dict:
    """Layout -> dizionario nel formato di PlanResponse (usato da generate e dall'import DXF)."""
    walls = build_walls(lay)
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
                   "area": round(r.rect.w * r.rect.h, 2), "zone": r.group,
                   "color": palette.get(KIND_GROUP.get(r.kind, "living"), "#f8fafc")} for r in lay.rooms],
        "walls": [{"x": x, "y": y, "w": w, "h": h} for x, y, w, h in walls],
        "doors": [_export_opening(lay, d, True) for d in lay.doors],
        "windows": [_export_opening(lay, w, False) for w in lay.windows],
        "furniture": [{"type": i.type, "x": round(i.rect.x, 3), "y": round(i.rect.y, 3),
                       "w": round(i.rect.w, 3), "h": round(i.rect.h, 3), "rot": 0.0,
                       "facing": i.facing, "room": i.room_id} for i in lay.items],
        "notes": lay.notes,
    }


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
