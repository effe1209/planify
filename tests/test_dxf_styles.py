"""Importazione DXF: lo stesso appartamento disegnato in stili diversi (muri a coppie di linee, polilinee chiuse, campiture,
cappotto esterno, polilinee con spessore; porte ad arco o in blocchi con nomi qualsiasi; simboli su layer generici) dà sempre la stessa pianta.

Avvio:  python3 -m pytest tests/test_dxf_styles.py   (oppure  python3 tests/test_dxf_styles.py)
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))

import planner  # noqa: E402
from dxf_styles import build, build_curved  # noqa: E402

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


def test_entrance_without_any_door_symbol():
    """Nessun simbolo di porta nel disegno: il varco verso l'esterno largo come una porta è l'ingresso, la finestra resta tale."""
    plan = planner.import_dxf_data(build("pairs", "none", "lines"), furnished=False)
    assert len(plan["doors"]) == 2 and sum(1 for d in plan["doors"] if d["entrance"]) == 1
    assert len(plan["windows"]) == 1 and plan["windows"][0]["w"] >= 1.3          # la finestra a nord, con le sue linee
    assert any("non c'è una porta d'ingresso" in n for n in plan["notes"])


def test_curved_facade_is_imported_as_an_arc():
    """Una facciata ad arco (archi concentrici + arco di vetro) si ricostruisce come pianta dritta e poi si rimette l'arco."""
    import math
    for partial in (False, True):
        plan = planner.import_dxf_data(build_curved(partial=partial), furnished=False)
        cv = plan.get("curve")
        assert cv and cv["side"] == "S" and abs(cv["bulge"] - 1.0) < 0.05, (partial, cv)
        assert (("from" in cv) == partial), cv
        chord = 4.0 if partial else 6.2
        r = (chord ** 2 / 4 + 1.0) / 2.0
        seg = r * r / 2 * (2 * math.asin(chord / (2 * r)) - math.sin(2 * math.asin(chord / (2 * r))))
        arc_rooms = [rm for rm in plan["rooms"] if rm.get("poly")]
        assert arc_rooms and plan["wallLines"], partial
        flat = sum(rm["w"] * rm["h"] for rm in plan["rooms"] if not rm.get("poly"))
        assert abs(sum(rm["area"] for rm in arc_rooms) + flat - (6.2 * 4.2 + seg)) < 0.6, partial          # pianta dritta + segmento circolare
        # la finestra ad arco sta sull'arco (stesso angolo della tangente), l'altra sul muro nord
        assert any(abs(w["y"] - 4.9) < 0.2 and w["w"] > 1.0 for w in plan["windows"]), plan["windows"]
        assert not [w for w in plan["walls"] if w["w"] > w["h"] and w["y"] + w["h"] > 4.1 and not partial]  # niente muro dritto lungo l'arco
        # «Arreda tutto» su una pianta con l'arco: gli arredi stanno nella parte rettangolare, l'arco resta libero
        out = planner.furnish_plan(plan, style="modern")
        assert out["furniture"]
        base = {rm["id"]: rm["base"] for rm in plan["rooms"] if rm.get("base")}
        for it in out["furniture"]:
            if it["room"] in base:
                bx, by, bw, bh = base[it["room"]]
                assert it["x"] >= bx - 0.01 and it["y"] >= by - 0.01 and it["x"] + it["w"] <= bx + bw + 0.01 and it["y"] + it["h"] <= by + bh + 0.01, it


def test_layer_choice_overrides_the_names():
    """La scelta dei layer vale più dei nomi: i layer con nome strano si elencano con le loro linee e si possono forzare."""
    import dxf_import
    text = build("pairs", "arc", "lines", sym_layer="XX-GENERIC")
    info = dxf_import.layer_info(text)
    names = {l["name"]: l for l in info["layers"]}
    assert {"A-WALL", "XX-GENERIC"} <= set(names) and names["A-WALL"]["role"] == "wall" and names["XX-GENERIC"]["role"] == "other"
    assert names["A-WALL"]["segs"] and info["bbox"][2] > 6
    # tolti i muri il file non si riconosce più; rimessi, si importa come prima
    try:
        planner.import_dxf_data(text, furnished=False, layer_roles={"A-WALL": "ignore"})
    except planner.DxfNotRecognised:
        pass
    else:
        raise AssertionError("senza muri doveva rifiutare")
    plan = planner.import_dxf_data(text, furnished=False, layer_roles={"A-WALL": "wall", "XX-GENERIC": "door"})
    assert len(plan["rooms"]) >= 2 and len(plan["doors"]) == 2


if __name__ == "__main__":
    test_same_plan_whatever_the_drawing_style()
    test_door_and_window_symbols_on_any_layer()
    test_entrance_without_any_door_symbol()
    test_curved_facade_is_imported_as_an_arc()
    test_layer_choice_overrides_the_names()
    print("dxf_styles ok")
