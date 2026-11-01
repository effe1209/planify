"""Scala a vista (planner.open_stair_plan): il vano si riduce alla rampa, il resto della fascia diventa un locale, il vano si apre sul
soggiorno e sul disimpegno; stessa scala allineata su tutti i piani, niente locali isolati.

Avvio:  python3 tests/test_open_stairs.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import planner  # noqa: E402

SIZES = [(9, 8), (9.5, 8), (10, 8), (10, 8.5), (11, 8), (12, 9)]
PROGRAMS = [[{"level": 0, "program": "day"}, {"level": 1, "program": "night"}],
            [{"level": 0, "program": "day"}, {"level": 1, "program": "night"}, {"level": 2, "program": "night"}]]


def _stair_area(p):
    return sum(r["w"] * r["h"] for r in p["rooms"] if r["kind"] == "stairs")


def _unreachable(p):
    rooms = p["rooms"]
    at = lambda x, y: next((r["id"] for r in rooms if r["x"] - 0.01 <= x <= r["x"] + r["w"] + 0.01 and r["y"] - 0.01 <= y <= r["y"] + r["h"] + 0.01), None)
    par = {r["id"]: r["id"] for r in rooms}

    def find(a):
        while par[a] != a:
            a = par[a]
        return a
    for i, a in enumerate(rooms):
        for b in rooms[i + 1:]:
            ox = min(a["x"] + a["w"], b["x"] + b["w"]) - max(a["x"], b["x"])
            oy = min(a["y"] + a["h"], b["y"] + b["h"]) - max(a["y"], b["y"])
            touch = ((abs(a["x"] + a["w"] - b["x"]) < 1e-3 or abs(b["x"] + b["w"] - a["x"]) < 1e-3) and oy > 0.3) or \
                    ((abs(a["y"] + a["h"] - b["y"]) < 1e-3 or abs(b["y"] + b["h"] - a["y"]) < 1e-3) and ox > 0.3)
            if a["zone"] == b["zone"] and touch:
                par[find(a["id"])] = find(b["id"])
    start = []
    for d in p["doors"]:
        cx, cy = (d["x"] + d["w"] / 2, d["y"]) if d["rot"] == 0 else (d["x"], d["y"] + d["w"] / 2)
        a, b = (at(cx, cy - 0.3), at(cx, cy + 0.3)) if d["rot"] == 0 else (at(cx - 0.3, cy), at(cx + 0.3, cy))
        if a and b:
            par[find(a)] = find(b)
        elif a or b:
            start.append(a or b)
    stairs = [r["id"] for r in rooms if r["kind"] == "stairs"]
    roots = {find(x) for x in start + stairs}   # ai piani sopra si arriva dalla scala
    return [r["name"] or r["kind"] for r in rooms if find(r["id"]) not in roots]


def test_open_stair_is_smaller_and_a_room_takes_the_rest():
    trimmed = 0
    houses = 0
    for w, l in SIZES:
        for floors in PROGRAMS:
            for seed in range(6):
                house = planner.generate_house(w, l, floors, seed=seed, stair_style="open")
                if not any("Scala a vista" in n for n in house["notes"]):
                    continue
                houses += 1
                cores = set()
                for f in house["floors"]:
                    po = f["plan"]
                    assert not _unreachable(po), (w, l, seed, _unreachable(po))
                    c = po["stairs"][0]["core"]
                    cores.add((c["x"], c["y"], c["w"], c["h"]))
                    note = [n for n in po["notes"] if "ricavato dalla fascia della scala" in n]
                    if note:
                        trimmed += 1
                        assert _stair_area(po) <= 9.5, (w, l, seed, _stair_area(po))
                        extra = [r for r in po["rooms"] if r["kind"] in ("storage", "laundry", "study", "closet") and r["name"] in note[0]]
                        assert extra and min(extra[0]["w"], extra[0]["h"]) >= 1.5, (w, l, seed, extra)
                assert len(cores) == 1, (w, l, seed, cores)   # la scala sta nello stesso punto su tutti i piani
    assert houses >= 20 and trimmed >= 20, (houses, trimmed)
    print(f"ok test_open_stair_is_smaller_and_a_room_takes_the_rest ({houses} case, {trimmed} piani con la fascia ridotta)")


def test_open_stair_opens_on_the_living_room_downstairs():
    seen = 0
    for w, l in SIZES:
        for seed in range(6):
            house = planner.generate_house(w, l, PROGRAMS[0], seed=seed, stair_style="open")
            ground = house["floors"][0]["plan"]
            st = next((r for r in ground["rooms"] if r["kind"] == "stairs"), None)
            living = [r for r in ground["rooms"] if r["kind"] in ("living", "living_kitchen")]
            if st is None or not living:
                continue
            touching = [r for r in living if min(st["x"] + st["w"], r["x"] + r["w"]) - max(st["x"], r["x"]) > -1e-3
                        and min(st["y"] + st["h"], r["y"] + r["h"]) - max(st["y"], r["y"]) > -1e-3]
            if touching and st["zone"] == touching[0]["zone"]:
                seen += 1
    assert seen >= 3, seen
    print(f"ok test_open_stair_opens_on_the_living_room_downstairs ({seen} case)")


def test_garage_stair_is_open_and_the_house_has_a_fire_door():
    seen = 0
    floors = [{"level": -1, "program": "garage"}, {"level": 0, "program": "day"}, {"level": 1, "program": "night"}]
    for w, l in [(10, 8), (10, 8.5), (11, 8), (12, 9)]:
        for seed in range(6):
            house = planner.generate_house(w, l, floors, seed=seed, stair_style="open")
            if not any("Scala a vista" in n for n in house["notes"]):
                continue
            seen += 1
            garage, ground, upper = (f["plan"] for f in house["floors"])
            stair = next(r for r in garage["rooms"] if r["kind"] == "stairs")
            box = [r for r in garage["rooms"] if r["kind"] == "garage"]
            assert any(r["zone"] == stair["zone"] for r in box), (w, l, seed)   # il vano è aperto sul box
            rei = [d for d in ground["doors"] if d.get("kind") == "rei"]
            assert len(rei) == 1, (w, l, seed)                                   # una porta REI tra la scala e la casa
            assert not [d for d in upper["doors"] if d.get("kind") == "rei"]
            cores = {tuple(round(p["stairs"][0]["core"][k], 2) for k in "xywh") for p in (garage, ground, upper)}
            assert len(cores) == 1, (w, l, seed, cores)
            for p in (garage, ground, upper):
                assert not _unreachable(p), (w, l, seed, _unreachable(p))
    assert seen >= 6, seen
    print(f"ok test_garage_stair_is_open_and_the_house_has_a_fire_door ({seen} case)")


def test_auto_opens_small_lots_and_leaves_big_ones_closed():
    small = planner.generate_house(9, 8, PROGRAMS[0], seed=1, stair_style="auto")
    big = planner.generate_house(14, 10, PROGRAMS[0], seed=1, stair_style="auto")
    assert any("Scala a vista" in n for n in small["notes"]), small["notes"]
    assert not any("Scala a vista" in n for n in big["notes"]), big["notes"]
    print("ok test_auto_opens_small_lots_and_leaves_big_ones_closed")


def test_a_floor_added_later_follows_the_open_stair():
    house = planner.generate_house(10, 8, PROGRAMS[0], seed=3, stair_style="open")
    core = house["floors"][0]["plan"]["stairs"][0]["core"]
    plan = planner.generate(10, 8, "apartment", num_rooms=3, seed=5, program="night", access="stairs", stair_type="u", core=core)
    assert plan.get("stairs") and all(abs(plan["stairs"][0]["core"][k] - core[k]) < 0.05 for k in "xywh")
    assert not _unreachable(plan)
    print("ok test_a_floor_added_later_follows_the_open_stair")


if __name__ == "__main__":
    test_open_stair_is_smaller_and_a_room_takes_the_rest()
    test_open_stair_opens_on_the_living_room_downstairs()
    test_garage_stair_is_open_and_the_house_has_a_fire_door()
    test_auto_opens_small_lots_and_leaves_big_ones_closed()
    test_a_floor_added_later_follows_the_open_stair()
