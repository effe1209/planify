"""Muri curvi nel motore (curves.py): facciata ad arco e angoli arrotondati su una pianta finita.

Avvio:  python3 -m pytest tests/test_curves.py   (oppure  python3 tests/test_curves.py)
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import planner  # noqa: E402
from curves import arc_h  # noqa: E402


def _plan(seed=5, w=10, h=8):
    return planner.generate(w, h, "apartment", 3, "modern", "rect", seed=seed)


def _inside(poly, x, y):
    ins = False
    for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            ins = not ins
    return ins


def test_bow_adds_exactly_the_circular_segment_on_every_side():
    for side in "NSEW":
        plan = _plan()
        w0, l0 = plan["dimensions"]["width"], plan["dimensions"]["length"]
        a0 = sum(r["w"] * r["h"] for r in plan["rooms"])
        planner.apply_curve(plan, {"side": side, "bulge": 1.2})
        span = w0 if side in "NS" else l0
        r = (span ** 2 / 4 + 1.2 ** 2) / (2 * 1.2)
        ang = 2 * math.asin(span / (2 * r))
        seg = r * r / 2 * (ang - math.sin(ang))
        assert abs(sum(rm["area"] for rm in plan["rooms"]) - a0 - seg) < 0.05, side
        d = plan["dimensions"]
        assert (d["length"], d["width"]) == ((l0 + 1.2, w0) if side in "NS" else (l0, w0 + 1.2)), side
        assert plan["curve"] == {"type": "facade", "side": side, "bulge": 1.2}
        # tutto sta dentro il riquadro: niente coordinate negative dopo lo scorrimento di N e O
        pts = [p for rm in plan["rooms"] for p in (rm.get("poly") or [[rm["x"], rm["y"]]])]
        assert min(p[0] for p in pts) >= -0.01 and min(p[1] for p in pts) >= -0.01, side
        assert max(p[0] for p in pts) <= d["width"] + 0.01 and max(p[1] for p in pts) <= d["length"] + 0.01, side


def test_openings_follow_the_arc_and_the_wall_is_cut_there():
    plan = _plan()
    planner.apply_curve(plan, {"side": "S", "bulge": 1.5})
    tilted = [o for o in plan["windows"] + plan["doors"] if abs(o["rot"]) > 0.01 and abs(o["rot"] - 90) > 0.01]
    assert tilted, "almeno una finestra o porta della facciata sta sull'arco"
    t = plan["wallThickness"] / plan["scale"]
    for o in tilted:
        a = math.radians(o["rot"])
        cx = o["x"] + math.cos(a) * o["w"] / 2 - math.sin(a) * t / 2      # centro del vano sulla linea del muro
        cy = o["y"] + math.sin(a) * o["w"] / 2 + math.cos(a) * t / 2
        L = plan["dimensions"]["length"] - 1.5
        assert abs(cy - (L - t / 2 + arc_h(cx, plan["dimensions"]["width"], 1.5))) < 0.03
        # il muro curvo non passa dentro il vano
        for line in plan["wallLines"]:
            for px, py in line["pts"]:
                assert not (abs((px - cx) * math.cos(a) + (py - cy) * math.sin(a)) < o["w"] / 2 - 0.05
                            and abs(-(px - cx) * math.sin(a) + (py - cy) * math.cos(a)) < 0.05), o
    # niente muro dritto lungo la facciata
    L = plan["dimensions"]["length"] - 1.5
    assert not [w for w in plan["walls"] if w["w"] > w["h"] and abs(w["y"] + w["h"] - L) < 0.01]


def test_furniture_stays_inside_the_curved_rooms_and_partitions_reach_the_arc():
    plan = _plan(seed=3)
    planner.apply_curve(plan, {"side": "S", "bulge": 1.0})
    rooms = {r["id"]: r for r in plan["rooms"]}
    for it in plan["furniture"]:
        r = rooms.get(it["room"])
        if r and r.get("poly"):
            assert _inside(r["poly"], it["x"] + it["w"] / 2, it["y"] + it["h"] / 2), (it["type"], r["name"])
    L = plan["dimensions"]["length"]
    for w in plan["walls"]:
        if w["h"] > w["w"] and w["y"] + w["h"] > L - 1.0 - 0.5:      # tramezzi che arrivano alla facciata
            assert w["y"] + w["h"] >= L - 1.0 - 0.01


def test_rounded_corners_cut_the_corner_and_leave_arc_walls():
    plan = _plan()
    a0 = sum(r["w"] * r["h"] for r in plan["rooms"])
    planner.apply_curve(plan, {"corner": 1.2})
    cut = a0 - sum(r["area"] for r in plan["rooms"])
    n = len(plan["wallLines"])
    assert n >= 1 and abs(cut - n * 1.2 ** 2 * (1 - math.pi / 4)) < 0.02
    assert plan["curve"]["corner"] == 1.2 and any("arrotondat" in x for x in plan["notes"])
    # non si applica due volte
    before = len(plan["wallLines"])
    planner.apply_curve(plan, {"corner": 1.2})
    assert len(plan["wallLines"]) == before


def test_bow_over_part_of_the_facade_only():
    from curves import bow_facade
    plan = _plan()
    a0 = sum(r["w"] * r["h"] for r in plan["rooms"])
    bow_facade(plan, "S", 1.0, a0=2.0, a1=7.0)
    span = 5.0
    r = (span ** 2 / 4 + 1.0) / 2.0
    ang = 2 * math.asin(span / (2 * r))
    seg = r * r / 2 * (ang - math.sin(ang))
    assert abs(sum(rm["area"] for rm in plan["rooms"]) - a0 - seg) < 0.05
    assert plan["curve"]["from"] == 2.0 and plan["curve"]["to"] == 7.0
    # fuori dal tratto il muro resta dritto: ci sono pezzi di muro orizzontale sulla facciata a sinistra e a destra
    L = plan["dimensions"]["length"] - 1.0
    straight = [w for w in plan["walls"] if w["w"] > w["h"] and abs(w["y"] + w["h"] - L) < 0.01]
    assert straight and all(w["x"] + w["w"] <= 2.0 + 0.01 or w["x"] >= 7.0 - 0.01 for w in straight)
    xs = [p[0] for line in plan["wallLines"] for p in line["pts"]]
    assert min(xs) >= 2.0 - 0.01 and max(xs) <= 7.0 + 0.01


def test_house_floors_all_get_the_same_arc_and_the_garage_only_shifts():
    floors = [{"level": -1, "program": "garage"}, {"level": 0, "program": "day"}, {"level": 1, "program": "night"}]
    h = next(h for h in (planner.generate_house(10, 8, floors, seed=s) for s in range(1, 15)) if not any("non si allinea" in n for n in h["notes"]))   # una con la scala allineata
    for f in h["floors"]:
        planner.apply_curve(f["plan"], {"side": "N", "bulge": 1.0}, flat=f["program"] == "garage")
    dims = {f["level"]: f["plan"]["dimensions"] for f in h["floors"]}
    assert dims[-1] == dims[0] == dims[1] and dims[0]["length"] == 9.0
    cores = [f["plan"]["stairs"][0]["core"] for f in h["floors"] if f["plan"].get("stairs")]
    assert len(cores) == 3 and all(abs(c["y"] - cores[0]["y"]) < 1e-6 and abs(c["x"] - cores[0]["x"]) < 1e-6 for c in cores)
    assert [bool(f["plan"].get("wallLines")) for f in h["floors"]] == [False, True, True]   # il garage non ha l'arco


def test_garden_and_garage_are_left_alone():
    g = planner.generate(14, 10, "garden", seed=1)
    assert planner.apply_curve(g, {"side": "S", "bulge": 1.0}).get("curve") is None
    assert planner.apply_curve(_plan(), {"side": "S", "bulge": 0.1}).get("curve") is None      # freccia troppo piccola


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
