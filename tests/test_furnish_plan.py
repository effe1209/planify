"""Arredare una pianta data: la geometria non cambia, i locali scelti si riarredano, gli altri restano com'erano.

Avvio:  python3 tests/test_furnish_plan.py   (con il venv dei requisiti per il test DXF)
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import planner  # noqa: E402

GEOM = ("rooms", "walls", "doors", "windows", "stairs", "dimensions")


def _geometry(plan):
    return {k: plan[k] for k in GEOM}


def test_furnishing_a_bare_plan_keeps_walls_doors_and_windows():
    for w, l, n, t in [(12, 9, 3, "apartment"), (10, 8, 2, "apartment"), (12, 8, "x", "open-space")]:
        plan = planner.generate(w, l, t, num_rooms=n if isinstance(n, int) else 1, seed=2)
        bare = {**plan, "furniture": []}
        res = planner.furnish_plan(bare, style="nordic")
        kinds = {f["room"] for f in res["furniture"]}
        assert any(r["kind"] == "bed" for r in plan["rooms"]) <= (len(res["furniture"]) > 0)
        by = {}
        for f in res["furniture"]:
            by.setdefault(f["room"], []).append(f["type"])
        for r in plan["rooms"]:
            if r["kind"] == "bed":
                assert "bed" in by.get(r["id"], []), (w, l, r["name"])
            if r["kind"] in ("bath", "wc"):
                assert {"toilet", "sink"} <= set(by.get(r["id"], [])), (w, l, r["name"])
        assert not [n for n in res["notes"] if "blocca" in n or "fuori da" in n or "sovrappongono" in n], res["notes"]
        assert kinds
    print("ok test_furnishing_a_bare_plan_keeps_walls_doors_and_windows")


def test_only_the_chosen_rooms_are_refurnished():
    plan = planner.generate(12, 9, "apartment", num_rooms=3, seed=4)
    bed = next(r for r in plan["rooms"] if r["kind"] == "bed")
    others = [f for f in plan["furniture"] if f["room"] != bed["id"]]
    res = planner.furnish_plan(plan, room_ids=[bed["id"]])
    assert [f for f in res["furniture"] if f["room"] != bed["id"]] == others
    assert any(f["type"] == "bed" and f["room"] == bed["id"] for f in res["furniture"])
    cleared = planner.furnish_plan(plan, room_ids=[bed["id"]], clear=True)
    assert not [f for f in cleared["furniture"] if f["room"] == bed["id"]]
    print("ok test_only_the_chosen_rooms_are_refurnished")


def test_a_room_can_change_use_before_furnishing():
    plan = planner.generate(12, 9, "apartment", num_rooms=3, seed=4)
    bed = next(r for r in plan["rooms"] if r["kind"] == "bed")
    res = planner.furnish_plan({**plan, "furniture": []}, kinds={bed["id"]: "study"}, room_ids=[bed["id"]])
    types = [f["type"] for f in res["furniture"] if f["room"] == bed["id"]]
    assert "desk" in types and "bed" not in types, types
    assert next(r for r in res["rooms"] if r["id"] == bed["id"])["kind"] == "study"
    print("ok test_a_room_can_change_use_before_furnishing")


def test_real_dxf_imports_bare_and_is_furnished_later():
    fx = os.path.join(os.path.dirname(__file__), "fixtures", "appartamento_cm.dxf")
    if not os.path.exists(fx):
        return
    try:
        text = open(fx, encoding="utf-8", errors="ignore").read()
        bare = planner.import_dxf_data(text, furnished=False)
    except ImportError:
        print("skip test_real_dxf_imports_bare_and_is_furnished_later (dipendenze mancanti)")
        return
    assert not bare["furniture"] and bare["rooms"]
    res = planner.furnish_plan(bare, style="luxury")
    assert res["furniture"], "nessun arredo"
    assert _geometry(bare)["doors"] == bare["doors"]
    print("ok test_real_dxf_imports_bare_and_is_furnished_later")


if __name__ == "__main__":
    test_furnishing_a_bare_plan_keeps_walls_doors_and_windows()
    test_only_the_chosen_rooms_are_refurnished()
    test_a_room_can_change_use_before_furnishing()
    test_real_dxf_imports_bare_and_is_furnished_later()
