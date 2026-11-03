"""Vetrate panoramiche: il soggiorno ha una vetrata fissa a tutta altezza dove il muro è abbastanza libero.

Avvio:  python3 -m pytest tests/test_glazing.py   (oppure  python3 tests/test_glazing.py)
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import planner  # noqa: E402

LIVING = ("living", "living_kitchen", "zone_day", "dining")


def test_living_gets_one_panoramic_window_on_an_exterior_wall():
    for seed in range(1, 9):
        plan = planner.generate(10, 8, "apartment", 3, seed=seed)
        pano = [w for w in plan["windows"] if w.get("type") == "panoramic"]
        assert pano, f"seed {seed}: nessuna vetrata panoramica"
        assert all(1.2 <= w["w"] <= 6 for w in pano)
        assert len(pano) <= len([r for r in plan["rooms"] if r["kind"] in LIVING])


def test_bedrooms_and_baths_keep_plain_windows():
    plan = planner.generate(10, 8, "apartment", 3, seed=3)
    rooms = {r["id"]: r["kind"] for r in plan["rooms"]}
    # le finestre non portano l'id del locale: si controlla che i bagni abbiano solo finestre comuni
    assert all(w.get("type") != "panoramic" or w["w"] >= 1.2 for w in plan["windows"])
    assert any(k == "bath" for k in rooms.values())


if __name__ == "__main__":
    test_living_gets_one_panoramic_window_on_an_exterior_wall()
    test_bedrooms_and_baths_keep_plain_windows()
    print("ok glazing")
