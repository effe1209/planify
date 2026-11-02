"""Importazione DXF: lo stesso appartamento disegnato in stili diversi (muri a coppie di linee, polilinee chiuse, campiture,
cappotto esterno, polilinee con spessore; porte ad arco o in blocchi con nomi qualsiasi; simboli su layer generici) dà sempre la stessa pianta.

Avvio:  python3 -m pytest tests/test_dxf_styles.py   (oppure  python3 tests/test_dxf_styles.py)
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))

import planner  # noqa: E402
from dxf_styles import build  # noqa: E402

STYLES = ("pairs", "closed_polys", "pairs_hatch", "insulation", "wide_poly")
SYMBOLS = (("arc", "lines"), ("block_named", "block_named"))


def _check(text, label):
    plan = planner.import_dxf_data(text, furnished=False)
    assert plan["dimensions"] == {"width": 6.2, "length": 4.2}, (label, plan["dimensions"])
    assert len([r for r in plan["rooms"] if r["name"]]) == 2, (label, [r["name"] for r in plan["rooms"]])
    assert len(plan["doors"]) == 2 and sum(1 for d in plan["doors"] if d["entrance"]) == 1, (label, plan["doors"])
    assert len(plan["windows"]) == 1, (label, plan["windows"])      # niente aperture doppie
    assert len(plan["walls"]) == 5, (label, len(plan["walls"]))     # niente muri doppi


def test_same_plan_whatever_the_drawing_style():
    for style in STYLES:
        for door, win in SYMBOLS:
            _check(build(style, door, win), f"{style} {door} {win}")


def test_door_and_window_symbols_on_any_layer():
    """Simboli di porte e finestre sul layer dei muri, sul layer 0 o su un layer senza nome parlante."""
    for layer in ("A-WALL", "0", "XX-GENERIC"):
        for door, win in SYMBOLS:
            _check(build("pairs", door, win, sym_layer=layer), f"simboli su {layer} {door} {win}")


if __name__ == "__main__":
    test_same_plan_whatever_the_drawing_style()
    test_door_and_window_symbols_on_any_layer()
    print("dxf_styles ok")
