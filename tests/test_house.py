"""Case su più piani: la scala sta nella circolazione e coincide su tutti i piani.

Avvio:  python3 -m pytest tests   (oppure  python3 tests/test_house.py)
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import planner  # noqa: E402

SIZES = [(11, 9), (10, 10), (13, 9.5)]
NIGHT = {"level": 1, "program": "night", "double_bedrooms": 2, "single_bedrooms": 1}


def _core(plan):
    st = plan["stairs"]
    assert len(st) == 1, "un solo vano scala per piano"
    return st[0]["core"]


def test_house_stairs_aligned_on_every_floor():
    for W, L in SIZES:
        for stair in ("auto", "u", "l", "straight"):
            house = planner.generate_house(W, L, [{"level": 0, "program": "day"}, NIGHT], seed=7, stair_type=stair)
            assert not house["notes"], (W, L, stair, house["notes"])
            cores = [_core(f["plan"]) for f in house["floors"]]
            assert all(abs(c[k] - cores[0][k]) < 1e-3 for c in cores for k in "xywh"), (W, L, stair)


def test_stairs_open_on_circulation_and_upper_floor_has_no_front_door():
    house = planner.generate_house(11, 9, [{"level": 0, "program": "day"}, NIGHT], seed=3)
    for f in house["floors"]:
        plan = f["plan"]
        stair = next(r for r in plan["rooms"] if r["kind"] == "stairs")
        circulation = {r["zone"] for r in plan["rooms"] if r["kind"] in ("corridor", "entry")}
        assert stair["zone"] in circulation, "il vano scala si apre sul disimpegno"
        front = [d for d in plan["doors"] if d.get("entrance")]
        assert bool(front) == (f["level"] == 0), "porta d'ingresso solo al piano terra"
    kinds = {f["program"]: {r["kind"] for r in f["plan"]["rooms"]} for f in house["floors"]}
    assert "bed" not in kinds["day"] and {"living", "living_kitchen"} & kinds["day"]
    assert "bed" in kinds["night"] and not {"kitchen", "living_kitchen"} & kinds["night"]


def test_three_floors_share_the_same_stair():
    floors = [{"level": 0, "program": "day"}, NIGHT, {"level": 2, "program": "night", "double_bedrooms": 1}]
    house = planner.generate_house(12, 10, floors, seed=11)
    cores = [_core(f["plan"]) for f in house["floors"]]
    assert all(c == cores[0] for c in cores)


def test_garage_under_the_house_has_the_same_stair_behind_a_door():
    floors = [{"level": -1, "program": "garage"}, {"level": 0, "program": "day"}, NIGHT]
    for W, L in SIZES:
        house = planner.generate_house(W, L, floors, seed=5)
        assert not house["notes"], (W, L, house["notes"])
        plans = {f["level"]: f["plan"] for f in house["floors"]}
        assert _core(plans[-1]) == _core(plans[0]) == _core(plans[1])
        garage = plans[-1]
        stair = next(r for r in garage["rooms"] if r["kind"] == "stairs")
        box = {r["zone"] for r in garage["rooms"] if r["kind"] == "garage"}
        assert stair["zone"] not in box, "nel garage il vano scala è chiuso"
        assert any(d.get("kind") == "garage" for d in garage["doors"]), "basculante sulla facciata"
        assert not [n for n in garage["notes"] if "raggiungibile" in n or "vuoto" in n]


def _wet_cover(lower, upper):
    area = sum(w["w"] * w["h"] for w in planner.wet_areas(lower))
    over = sum(max(0, min(a["x"] + a["w"], b["x"] + b["w"]) - max(a["x"], b["x"])) *
               max(0, min(a["y"] + a["h"], b["y"] + b["h"]) - max(a["y"], b["y"]))
               for a in planner.wet_areas(lower) for b in planner.wet_areas(upper))
    return over / area


def test_bathrooms_upstairs_sit_over_the_ones_below():
    covered = []
    for seed in range(1, 6):
        for W, L in SIZES:
            house = planner.generate_house(W, L, [{"level": 0, "program": "day"}, NIGHT], seed=seed)
            plans = {f["level"]: f["plan"] for f in house["floors"]}
            covered.append(_wet_cover(plans[0], plans[1]))
    assert sum(c >= 0.9 for c in covered) >= 0.9 * len(covered), covered


def test_apartment_without_stairs_is_unchanged():
    plan = planner.generate(10, 9, seed=5)
    assert plan["stairs"] == [] and not any(r["kind"] == "stairs" for r in plan["rooms"])


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
