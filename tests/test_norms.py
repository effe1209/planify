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
    plan = planner.generate(12, 8, "loft", num_rooms=1, seed=1, style="industrial")
    assert not [n for n in plan.get("notes", []) if "minimi" in n]
    print("ok test_loft_has_a_bathroom_below_the_apartment_minimum")


def test_loft_is_a_real_loft_with_a_mezzanine():
    """Volume a doppia altezza con soppalco: ≤ 1/3 della superficie, 2,40 m sotto e almeno 2,20 sopra, parapetto 1 m,
    rampa fissa con alzate comode, zona notte sul soppalco e niente arredi del soggiorno sulla scala."""
    ov = lambda a, b: min(a["x"] + a["w"], b["x"] + b["w"]) - max(a["x"], b["x"]) > 0.02 and \
        min(a["y"] + a["h"], b["y"] + b["h"]) - max(a["y"], b["y"]) > 0.02
    for w, l in [(12, 8), (10, 6.5), (14, 10), (16, 9), (7, 5), (8, 5.5), (9, 6)]:
        for seed in range(4):
            plan = planner.generate(w, l, "loft", num_rooms=1, seed=seed, style="industrial")
            mz = plan["mezzanine"]
            assert mz["w"] * mz["h"] <= w * l / 3 + 0.01, (w, l, seed)
            assert mz["elev"] - mz["slab"] >= 2.4 and plan["height"] - mz["elev"] >= 2.2
            assert mz["parapet"] >= 1.0 and mz["stair"]["risers"] * 0.2 >= mz["elev"] > mz["stair"]["risers"] * 0.15
            up = [f for f in plan["furniture"] if f.get("elev")]
            assert any(f["type"] == "bed" for f in up) and all(ov(f, mz) for f in up), (w, l, seed)
            assert any(f["type"] == "wardrobe" for f in up), (w, l, seed)   # zona notte completa: letto e armadio
            if [x for x in up if x["type"] == "toilet"]:
                assert any(x["type"] == "sink" for x in up), (w, l, seed)   # il sanitario viene con il lavabo
                bt = mz["bath"]   # e sta in un bagnetto chiuso da pareti, con la porta
                assert len(bt["walls"]) >= 3 and bt["door"]["w"] * bt["door"]["h"] > 0.05, (w, l, seed)
            else:
                assert "bath" not in mz, (w, l, seed)
            assert not [f for f in plan["furniture"] if not f.get("elev") and ov(f, mz["stair"])], (w, l, seed)
            # letto e armadio staccati (almeno 0,4 m) e il bagnetto non sta fra i due
            bed = next(f for f in up if f["type"] == "bed")
            war = next(f for f in up if f["type"] == "wardrobe")
            gap = max(war["y"] - (bed["y"] + bed["h"]), bed["y"] - (war["y"] + war["h"]), war["x"] - (bed["x"] + bed["w"]), bed["x"] - (war["x"] + war["w"]))
            assert gap >= (0.4 if mz["w"] >= 3.4 else 0.1), (w, l, seed, gap)
            if "bath" in mz:
                # porta scorrevole dentro il bagno: varco da 0,75 m e un tratto di muro altrettanto lungo dove scorre l'anta
                dr = mz["bath"]["door"]
                run = max(dr["w"], dr["h"])
                assert abs(run - 0.75) < 0.01, (w, l, seed, dr)
                lens = sorted(max(q["w"], q["h"]) for q in mz["bath"]["walls"] if abs(min(q["w"], q["h"]) - 0.1) < 1e-6)
                assert lens[-2] >= 0.75 - 1e-6 or lens[-1] >= 0.75 - 1e-6, (w, l, seed, lens)
                bx0 = min(q["y"] for q in mz["bath"]["walls"]); bx1 = max(q["y"] + q["h"] for q in mz["bath"]["walls"])
                assert not (min(bed["y"], war["y"]) < bx0 and bx1 < max(bed["y"] + bed["h"], war["y"] + war["h"])), (w, l, seed)
            assert not [n for n in plan["notes"] if "non" in n.lower() and "raggiungibile" in n.lower()]
    big = planner.generate(14, 10, "open-space", num_rooms=1, seed=1)   # soggiorno grande: tavolino in proporzione
    ct = next(f for f in big["furniture"] if f["type"] == "coffee_table")
    assert max(ct["w"], ct["h"]) >= 1.3 and min(ct["w"], ct["h"]) >= 0.7, ct
    small = planner.generate(6.5, 5, "loft", num_rooms=1, seed=1)
    assert "mezzanine" not in small and any("soppalco non entra" in n for n in small["notes"])   # sotto 7 × 5 m: loft a un livello
    assert "mezzanine" not in planner.generate(12, 8, "open-space", num_rooms=1, seed=1)   # il monolocale non ha soppalco
    print("ok test_loft_is_a_real_loft_with_a_mezzanine")


def test_tv_never_stands_in_front_of_a_window():
    """La TV va a parete piena o su un mobile basso da terra, mai davanti a una finestra."""
    def on_window(tv, win):
        horiz = win["rot"] % 180 == 0
        a0, a1 = (win["x"], win["x"] + win["w"]) if horiz else (win["y"], win["y"] + win["w"])
        c = (tv["x"] + tv["w"] / 2) if horiz else (tv["y"] + tv["h"] / 2)
        line = win["y"] if horiz else win["x"]
        d = (min(abs(tv["y"] - line), abs(tv["y"] + tv["h"] - line)) if horiz else min(abs(tv["x"] - line), abs(tv["x"] + tv["w"] - line)))
        half = (tv["w"] if horiz else tv["h"]) / 2
        return a0 - half + 0.05 < c < a1 + half - 0.05 and d < 0.5
    seen = 0
    for w, l, t in [(12, 8, "loft"), (10, 6.5, "loft"), (9, 6, "open-space"), (12, 9, "apartment"), (7, 5, "loft"), (14, 10, "apartment")]:
        for seed in range(6):
            plan = planner.generate(w, l, t, num_rooms=3, seed=seed, style="modern")
            for tv in [f for f in plan["furniture"] if f["type"] == "tv"]:
                seen += 1
                assert not any(on_window(tv, win) for win in plan["windows"]), (w, l, t, seed, tv)
    assert seen > 10, seen
    print("ok test_tv_never_stands_in_front_of_a_window")


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
    test_loft_is_a_real_loft_with_a_mezzanine()
    test_tv_never_stands_in_front_of_a_window()
    test_stair_slots_climb_a_floor_with_comfortable_risers()
    test_bedroom_windows_follow_the_room_size()
    test_every_desk_in_a_home_or_hotel_has_an_office_chair_facing_it()
