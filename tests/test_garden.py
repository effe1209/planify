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


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
