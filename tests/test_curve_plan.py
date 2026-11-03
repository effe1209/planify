"""Curva una facciata di una pianta già fatta (planner.curve_plan).  Avvio: python3 -m pytest tests/test_curve_plan.py  (oppure python3 tests/test_curve_plan.py)"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import planner  # noqa: E402


def _plan():
    return planner.generate(width=8, length=6, room_type="apartment", num_rooms=3, style="modern", seed=3)


def test_curve_plan_bows_a_finished_plan():
    p = _plan()
    L = p["dimensions"]["length"]
    out = planner.curve_plan(p, "S", 1.0)
    assert out["curve"]["side"] == "S"
    assert out["dimensions"]["length"] > L
    assert p["dimensions"]["length"] == L, "l'originale non si tocca"
    assert out["wallLines"], "il muro curvo è una polilinea"


def test_partial_span_and_errors():
    out = planner.curve_plan(_plan(), "N", 0.8, 2.0, 6.0)
    assert out["curve"].get("from") == 2.0 and out["curve"].get("to") == 6.0
    for bad in (lambda: planner.curve_plan(out, "S", 1.0), lambda: planner.curve_plan(_plan(), "S", 0.05)):
        try:
            bad()
        except ValueError:
            continue
        raise AssertionError("doveva rifiutare")


if __name__ == "__main__":
    test_curve_plan_bows_a_finished_plan()
    test_partial_span_and_errors()
    print("curve_plan ok")
