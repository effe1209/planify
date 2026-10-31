"""Giardino davanti alla casa (planner.layout_garden con house): cancello davanti al portoncino,
vialetto davanti alla basculante, rampa per il garage interrato.

Avvio:  python3 -m pytest tests/test_garden.py
"""
import itertools
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import planner  # noqa: E402


def _items(plan, kind):
    return [f for f in plan["furniture"] if f["type"] == kind]


def _no_overlaps(plan):
    for a, b in itertools.combinations(plan["furniture"], 2):
        assert not (a["x"] < b["x"] + b["w"] - 1e-6 and b["x"] < a["x"] + a["w"] - 1e-6 and
                    a["y"] < b["y"] + b["h"] - 1e-6 and b["y"] < a["y"] + a["h"] - 1e-6), (a["type"], b["type"])


def test_without_house_as_before():
    plan = planner.generate(14, 10, "garden", seed=1)
    assert "house" not in plan
    assert _items(plan, "gate_driveway")[0]["x"] == 10.4      # vialetto sul bordo destro


def test_gate_in_front_of_door_and_driveway_in_front_of_garage():
    house = {"w": 10, "door": {"x": 2.5, "w": 1}, "garage": {"x": 8, "w": 2.5, "side": "front"}}
    plan = planner.generate(14, 10, "garden", seed=1, house=house)
    assert plan["house"] == {"x": 2.0, "w": 10.0}
    gate = _items(plan, "gate_pedestrian")[0]
    assert gate["x"] + gate["w"] / 2 == 4.5                     # 2 (casa) + 2,5 (portoncino)
    drive = _items(plan, "gate_driveway")[0]
    assert drive["x"] + drive["w"] / 2 == 10.0                  # 2 (casa) + 8 (basculante)
    # il vialetto arriva fino alla casa
    assert any(p["x"] == drive["x"] and p["y"] == 0 for p in _items(plan, "path"))
    _no_overlaps(plan)


def test_basement_garage_gets_a_ramp():
    house = {"w": 10, "door": {"x": 5, "w": 1}, "garage": {"x": 2, "w": 2.5, "side": "front", "ramp": True}}
    plan = planner.generate(14, 10, "garden", seed=1, house=house)
    ramp = _items(plan, "ramp")[0]
    assert ramp["y"] == 0 and ramp["h"] == 8.35
    assert any("Rampa del garage interrato lunga 8,3 m" in n for n in plan["notes"])
    _no_overlaps(plan)


def test_door_behind_driveway_moves_gate_aside():
    house = {"w": 10, "door": {"x": 8, "w": 1}, "garage": {"x": 8.2, "w": 2.5, "side": "front"}}
    plan = planner.generate(14, 10, "garden", seed=1, house=house)
    gate, drive = _items(plan, "gate_pedestrian")[0], _items(plan, "gate_driveway")[0]
    assert gate["x"] >= drive["x"] + drive["w"] + 0.3 or gate["x"] + gate["w"] <= drive["x"] - 0.3
    _no_overlaps(plan)


def test_side_garage_and_narrow_lot():
    house = {"w": 10, "door": {"x": 5, "w": 1}, "garage": {"x": 0, "w": 2.5, "side": "left"}}
    plan = planner.generate(5, 8, "garden", seed=1, house=house)
    assert any("più larga del giardino" in n for n in plan["notes"])
    assert any("sul fianco" in n for n in plan["notes"])
    _no_overlaps(plan)


def test_street_level_garage_has_the_front_door_on_the_stair():
    """Garage al piano strada: la casa parte dal primo piano, si entra dal vano scala del garage."""
    h = planner.generate_house(10, 8, [{"level": 0, "program": "garage"}, {"level": 1, "program": "day"},
                                       {"level": 2, "program": "night"}], seed=3)
    assert not h["notes"]
    garage, first = h["floors"][0]["plan"], h["floors"][1]["plan"]
    door = [d for d in garage["doors"] if d.get("entrance") and not d.get("kind")]
    assert len(door) == 1 and door[0]["y"] > 4                     # sulla facciata della basculante
    assert any(d.get("kind") == "garage" for d in garage["doors"])
    assert not any(d.get("entrance") for d in first["doors"])      # al primo piano si arriva dalla scala
    assert garage["stairs"][0]["core"] == first["stairs"][0]["core"]


def test_front_door_does_not_open_onto_the_stair_run():
    """La porta di casa sul vano scala dà sul passaggio accanto alla rampa dritta, non sui gradini."""
    for W, L in ((10, 12), (9, 12), (11, 13), (12, 14), (8, 12)):
        for seed in (1, 2, 3):
            h = planner.generate_house(W, L, [{"level": 0, "program": "garage"}, {"level": 1, "program": "full"}], seed=seed)
            g = h["floors"][0]["plan"]
            st = (g.get("stairs") or [None])[0]
            door = [d for d in g["doors"] if d.get("entrance") and not d.get("kind")]
            if not st or st["type"] != "straight" or not door:
                continue
            c, d = st["core"], door[0]
            horiz = st["entry"] in "EW"
            run = min(4.6, c["w"] if horiz else c["h"])
            # rampa: striscia larga 1 m lungo il muro `hand`, lunga `run` dal lato d'ingresso
            if horiz:
                x0 = c["x"] + c["w"] - run if st["entry"] == "E" else c["x"]
                y0 = c["y"] + c["h"] - 1.0 if st["hand"] == "S" else c["y"]
                ramp = (x0, y0, x0 + run, y0 + 1.0)
            else:
                y0 = c["y"] + c["h"] - run if st["entry"] == "S" else c["y"]
                x0 = c["x"] + c["w"] - 1.0 if st["hand"] == "E" else c["x"]
                ramp = (x0, y0, x0 + 1.0, y0 + run)
            a, b = d["y"], d["y"] + d["w"]
            if d["rot"] == 90:   # porta su un muro verticale: occupa l'intervallo y
                touches = a < ramp[3] - 0.08 and b > ramp[1] + 0.08 and ramp[0] - 0.1 <= d["x"] <= ramp[2] + 0.1
                assert not touches, (W, L, seed)
            else:                # porta su un muro orizzontale: occupa l'intervallo x
                touches = d["x"] < ramp[2] - 0.08 and d["x"] + d["w"] > ramp[0] + 0.08 and ramp[1] - 0.1 <= d["y"] <= ramp[3] + 0.1
                assert not touches, (W, L, seed)


def test_cars_are_centred_on_the_garage_door_and_off_the_walls():
    for W, L in ((6, 9), (8, 10), (10, 12), (12, 14)):
        plan = planner.generate(W, L, "garage", seed=1)
        door = next(d for d in plan["doors"] if d.get("kind") == "garage")
        cars = [f for f in plan["furniture"] if f["type"] == "car"]
        assert cars, (W, L)
        mid = sum(c["x"] + c["w"] / 2 for c in cars) / len(cars)
        assert abs(mid - (door["x"] + door["w"] / 2)) < 0.15, (W, L, mid)
        for c in cars:   # almeno 0,6 m dalle pareti laterali (0,2 m di muro compreso)
            assert c["x"] >= 0.8 - 1e-6 and c["x"] + c["w"] <= W - 0.8 + 1e-6, (W, L, c)


def test_every_room_has_a_door_it_can_be_reached_through():
    h = planner.generate_house(8, 8, [{"level": 0, "program": "garage"}, {"level": 1, "program": "full"}], seed=1)
    plan = h["floors"][1]["plan"]
    bed = [r for r in plan["rooms"] if r["kind"] == "bed"]
    for r in bed:
        assert any((abs(d["x"] - r["x"]) < 0.35 or abs(d["x"] - r["x"] - r["w"]) < 0.35 or abs(d["y"] - r["y"]) < 0.35
                    or abs(d["y"] - r["y"] - r["h"]) < 0.35) for d in plan["doors"]), r


def _unreachable(p):
    """Locali non raggiungibili dall'esterno: porte e locali aperti che si toccano davvero collegano."""
    rooms = [r for r in p["rooms"] if r["kind"] != "garden"]
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
    roots = {find(s) for s in start}
    return [r["name"] or r["kind"] for r in rooms if find(r["id"]) not in roots]


def test_no_garage_piece_is_cut_off_by_the_stair():
    """Un pezzo di box dietro al vano scala (e la cantina che vi si apre) deve avere una porta dal vano."""
    for W, L, seed in ((13, 8, 2), (13, 9, 2), (14, 8, 1)):
        h = planner.generate_house(W, L, [{"level": 0, "program": "garage"}, {"level": 1, "program": "full"}], seed=seed)
        assert not _unreachable(h["floors"][0]["plan"]), (W, L, seed)


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
