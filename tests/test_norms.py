"""Norme di progettazione: camera doppia ≥ 14 m², singola ≥ 9 m² (DM 5/7/1975); bagno principale ≥ 4 m² (valore di progetto,
la norma nazionale non fissa una superficie).

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
                    assert area >= 3.7, (w, l, n, seed, r["name"], area)
                if r["kind"] == "bed":
                    assert area >= (8.7 if r.get("size") == "single" else 13.7), (w, l, n, seed, r["name"], area)
    print("ok test_minimum_areas_are_respected")


def test_loft_has_a_bathroom_below_the_apartment_minimum():
    plan = planner.generate(12, 8, "open-space", num_rooms=1, seed=1, style="industrial")
    assert not [n for n in plan.get("notes", []) if "minimi" in n]
    print("ok test_loft_has_a_bathroom_below_the_apartment_minimum")


def test_stair_slots_climb_a_floor_with_comfortable_risers():
    """3,0 m da pavimento a pavimento con pedata 27 cm: servono almeno 17 gradini, quindi vani abbastanza lunghi."""
    # rampa unica: gradini = lunghezza / 0,27; a U: due rampe da (profondità - 1 m) più il pianerottolo; a L: due bracci
    u = 2 * int((planner.STAIR_SLOT["u"][1] - 1.0) / 0.27) + 2
    straight = int(planner.STAIR_SLOT["straight"][1] / 0.27)
    assert u >= 17 and straight >= 17, (u, straight)
    print("ok test_stair_slots_climb_a_floor_with_comfortable_risers")


def test_bedroom_windows_follow_the_room_size():
    for w, l, n in [(12, 9, 4), (14, 10, 5), (13, 9.5, 4)]:
        plan = planner.generate(w, l, "apartment", num_rooms=n, seed=1)
        for r in plan["rooms"]:
            if r["kind"] != "bed":
                continue
            glass = 0.0
            for win in plan["windows"]:
                if win["rot"] == 90:
                    hit = r["y"] - 0.3 <= win["y"] and win["y"] + win["w"] <= r["y"] + r["h"] + 0.3 and \
                        min(abs(win["x"] - r["x"]), abs(win["x"] - r["x"] - r["w"])) <= 0.3
                else:
                    hit = r["x"] - 0.3 <= win["x"] and win["x"] + win["w"] <= r["x"] + r["w"] + 0.3 and \
                        min(abs(win["y"] - r["y"]), abs(win["y"] - r["y"] - r["h"])) <= 0.3
                glass += win["w"] * 1.4 if hit else 0.0
            assert glass >= r["w"] * r["h"] / 8 - 0.15, (w, l, r["name"], glass, r["w"] * r["h"] / 8)
    print("ok test_bedroom_windows_follow_the_room_size")


def test_every_desk_in_a_home_or_hotel_has_an_office_chair_facing_it():
    for w, l, n, t in [(13, 9.5, 4, "apartment"), (14, 10, 5, "apartment"), (4.2, 6.0, 1, "hotel-room"), (6, 8, 1, "hotel-room")]:
        for seed in range(4):
            plan = planner.generate(w, l, t, num_rooms=n, seed=seed)
            desks = [f for f in plan["furniture"] if f["type"] == "desk"]
            chairs = [f for f in plan["furniture"] if f["type"] == "office_chair"]
            assert len(chairs) == len(desks), (w, l, t, seed, len(desks), len(chairs))
            for c in chairs:
                near = [d for d in desks if abs((c["x"] + c["w"] / 2) - (d["x"] + d["w"] / 2)) < d["w"] / 2 + 0.6
                        and abs((c["y"] + c["h"] / 2) - (d["y"] + d["h"] / 2)) < d["h"] / 2 + 0.6]
                assert near, (w, l, t, seed, c)
    print("ok test_every_desk_in_a_home_or_hotel_has_an_office_chair_facing_it")


if __name__ == "__main__":
    test_minimum_areas_are_respected()
    test_loft_has_a_bathroom_below_the_apartment_minimum()
    test_stair_slots_climb_a_floor_with_comfortable_risers()
    test_bedroom_windows_follow_the_room_size()
    test_every_desk_in_a_home_or_hotel_has_an_office_chair_facing_it()
