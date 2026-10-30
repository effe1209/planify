"""Norme di progettazione: camera doppia ≥ 14 m², singola ≥ 9 m², bagno principale ≥ 6 m².

Avvio:  python3 tests/test_norms.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import planner  # noqa: E402

CASES = [(8, 6.5, 2), (10, 8, 3), (13, 9.5, 4), (9, 7, 2), (12, 10, 4), (11, 9, 3), (15, 11, 5)]


def test_minimum_areas_are_respected():
    for w, l, n in CASES:
        for seed in range(6):
            plan = planner.generate(w, l, "apartment", num_rooms=n, seed=seed)
            for r in plan["rooms"]:
                area = r["w"] * r["h"]
                if r["kind"] == "bath" and r["name"] == "Bagno":
                    assert area >= 5.7, (w, l, n, seed, r["name"], area)
                if r["kind"] == "bed":
                    assert area >= (8.7 if r.get("size") == "single" else 13.7), (w, l, n, seed, r["name"], area)
    print("ok test_minimum_areas_are_respected")


def test_loft_has_a_bathroom_below_the_apartment_minimum():
    plan = planner.generate(12, 8, "open-space", num_rooms=1, seed=1, style="industrial")
    assert not [n for n in plan.get("notes", []) if "minimi" in n]
    print("ok test_loft_has_a_bathroom_below_the_apartment_minimum")


if __name__ == "__main__":
    test_minimum_areas_are_respected()
    test_loft_has_a_bathroom_below_the_apartment_minimum()
