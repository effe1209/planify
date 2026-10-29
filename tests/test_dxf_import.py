"""Importazione di piante reali da DXF (dxf_import.py) sui disegni di prova in tests/fixtures.

Avvio:  python3 -m pytest tests/test_dxf_import.py   (oppure  python3 tests/test_dxf_import.py)
Le fixture si rigenerano con  python3 tests/make_dxf_fixtures.py

- appartamento_cm.dxf: muri a doppia linea su MURI, porte e finestre come blocchi, testi, quote, campiture (cm);
- appartamento_mm_layer0.dxf: la stessa casa in mm, tutto sul layer 0, porte a mano, nessuna unità dichiarata;
- casa_soggiorno_L.dxf: soggiorno a L, porta attaccata all'angolo, un locale senza nome, balcone fuori.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import planner  # noqa: E402

HERE = os.path.join(os.path.dirname(__file__), "fixtures")


def _load(name):
    with open(os.path.join(HERE, name)) as f:
        return planner.import_dxf_data(f.read())


def _rooms(plan):
    return {r["name"]: (r["kind"], r["x"], r["y"], r["w"], r["h"]) for r in plan["rooms"] if r["name"]}


APARTMENT = {
    "Soggiorno": ("living", 0.0, 3.5, 6.0, 4.5),
    "Cucina": ("kitchen", 6.0, 3.5, 4.0, 4.5),
    "Camera Matrimoniale": ("bed", 0.0, 0.0, 4.0, 3.5),
    "Camera": ("bed", 6.0, 0.0, 4.0, 3.5),
    "Bagno": ("bath", 4.0, 0.0, 2.0, 2.0),
    "Disimpegno": ("corridor", 4.0, 2.0, 2.0, 1.5),
}


def _check_apartment(plan):
    assert plan["dimensions"] == {"width": 10.0, "length": 8.0}
    assert _rooms(plan) == APARTMENT
    doors = sorted((d["x"], d["y"], d["w"], d["rot"]) for d in plan["doors"])
    assert len(doors) == 6
    assert sum(1 for d in plan["doors"] if d["entrance"]) == 1
    assert (2.0, 7.8, 0.9, 0) in doors          # ingresso
    assert (4.6, 1.9, 0.7, 0) in doors          # bagno
    assert len(plan["windows"]) == 6
    assert len(plan["furniture"]) >= 10
    assert plan["notes"][0].startswith("Pianta importata dal DXF: 6 locali, 6 porte, 6 finestre")


def test_apartment_with_layers_and_blocks():
    _check_apartment(_load("appartamento_cm.dxf"))


def test_same_apartment_in_mm_all_on_layer_0():
    _check_apartment(_load("appartamento_mm_layer0.dxf"))


def test_l_shaped_living_corner_door_and_unnamed_room():
    plan = _load("casa_soggiorno_L.dxf")
    rooms = _rooms(plan)
    assert rooms["Soggiorno"] == ("living", 0.0, 3.0, 7.0, 4.0)
    assert rooms["Camera"] == ("bed", 3.0, 0.0, 4.0, 3.0)
    # il soggiorno a L è un rettangolo più un pezzo della stessa zona, dello stesso colore
    living = next(r for r in plan["rooms"] if r["name"] == "Soggiorno")
    pieces = [r for r in plan["rooms"] if not r["name"]]
    assert [(p["x"], p["y"], p["w"], p["h"]) for p in pieces] == [(0.0, 0.0, 3.0, 3.0)]
    assert pieces[0]["zone"] == living["zone"] and pieces[0]["color"] == living["color"]
    # porta della camera attaccata al muro del soggiorno (nessun tratto di muro prima del vano)
    assert any(abs(d["x"] - 3.05) < 0.01 and d["w"] == 0.8 and d["rot"] == 0 for d in plan["doors"])
    assert len(plan["doors"]) == 5 and len(plan["windows"]) == 5
    assert any("senza nome" in n for n in plan["notes"])


def test_own_dxf_export_still_uses_room_layer():
    """I DXF di Planify (layer AREE) passano dall'importazione per polilinee, come prima."""
    txt = "\n".join(["0", "SECTION", "2", "ENTITIES",
                     "0", "LWPOLYLINE", "8", "AREE", "90", "4", "70", "1",
                     "10", "0", "20", "0", "10", "5", "20", "0", "10", "5", "20", "4", "10", "0", "20", "4",
                     "0", "LWPOLYLINE", "8", "AREE", "90", "4", "70", "1",
                     "10", "5", "20", "0", "10", "9", "20", "0", "10", "9", "20", "4", "10", "5", "20", "4",
                     "0", "ENDSEC", "0", "EOF"])
    plan = planner.import_dxf_data(txt)
    assert len(plan["rooms"]) == 2
    assert plan["notes"][0].startswith("Importate 2 stanze")


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
