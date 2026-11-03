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


def test_wrong_units_in_header_are_ignored():
    """Molti file dichiarano un'unità sbagliata ($INSUNITS): conta lo spessore dei muri."""
    with open(os.path.join(HERE, "appartamento_cm.dxf")) as f:
        txt = f.read()
    # il file è in centimetri; si dichiara millimetri (4) al posto di centimetri (5)
    txt = txt.replace("$INSUNITS\n 70\n5", "$INSUNITS\n 70\n4")
    assert "$INSUNITS\n 70\n4" in txt
    _check_apartment(planner.import_dxf_data(txt))


def test_room_names_in_english_and_spanish():
    import dxf_import as D
    cases = {"LIVING ROOM": "living", "KITCHEN": "kitchen", "DINING ROOM": "dining", "ROOM 1": "bed", "ROOM MAIN": "bed",
             "Dormitorio": "bed", "Baño": "bath", "BATH": "bath", "Cocina": "kitchen", "Sala": "living",
             "PANTRY": "storage", "WASHING AREA": "laundry", "Pasillo": "corridor"}
    for text, kind in cases.items():
        assert D._name_room([text], 10)[0] == kind, text
    assert D._name_room(["ROOM MAIN"], 14)[1] == "Camera Matrimoniale"
    assert D._name_room(["LIVING ROOM", "KITCHEN"], 30)[0] == "living_kitchen"
    assert D._name_room(["GALLERY"], 10)[0] is None and D._name_room(["Terraza"], 10)[0] is None


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



def test_walls_only_as_fill_glazed_facade_and_corner_door():
    """monolocale_campito.dxf (in metri): muri solo come riempimento pieno e linee a pezzi, la facciata nord fatta di soli
    serramenti e porte, le porte come archi sul layer degli arredi, la porta del bagno all'angolo, nessun testo."""
    plan = _load("monolocale_campito.dxf")
    assert abs(plan["dimensions"]["width"] - 4.2) <= 0.06 and abs(plan["dimensions"]["length"] - 6.7) <= 0.1   # 5,05 m di casa + 1,65 m di balcone
    rooms = {r["name"]: r for r in plan["rooms"] if r["name"]}
    assert set(rooms) == {"Camera", "Bagno", "Balcone"} or set(rooms) == {"Camera Matrimoniale", "Bagno", "Balcone"}
    bath = rooms["Bagno"]
    assert 1.9 <= bath["w"] <= 2.3 and 2.2 <= bath["h"] <= 2.6          # il bagno del disegno, 2,1 × 2,3 m a muri finiti
    assert any("campiture" in n for n in plan["notes"])
    # il balcone di vetro davanti alla facciata nord: un locale esterno, senza muri attorno
    balcony = next(r for r in plan["rooms"] if r["kind"] == "balcony")
    assert balcony["name"] == "Balcone" and 3.9 <= balcony["w"] <= 4.4 and 1.4 <= balcony["h"] <= 1.9 and balcony["y"] == 0
    house_top = min(r["y"] for r in plan["rooms"] if r["kind"] != "balcony")
    assert abs(balcony["y"] + balcony["h"] - house_top) <= 0.01             # appoggiato alla casa
    assert not any(w["y"] < balcony["y"] + balcony["h"] - 0.2 for w in plan["walls"])   # nessun muro attorno al balcone
    entrances = [d for d in plan["doors"] if d["entrance"]]
    assert len(entrances) == 1                                           # ingresso a sud; la porta a nord dà sul balcone
    inner = [d for d in plan["doors"] if not d["entrance"]]
    assert len(inner) == 2                                               # porta del bagno e porta sul balcone
    bath_door = next(d for d in inner if d["rot"] == 90)
    assert 2.0 <= bath_door["x"] <= 2.5                                  # sul lato destro del bagno (muro verticale), non sopra
    assert any(d["rot"] == 0 and d["y"] <= balcony["y"] + balcony["h"] + 0.2 and d["w"] > 1.5 for d in inner)   # la porta a nord dà sul balcone
    assert len(plan["windows"]) == 1                                     # la finestra a nord
    # la facciata vetrata sul balcone: la finestra larga è una vetrata panoramica e la porta senza anta a battente è scorrevole
    assert plan["windows"][0].get("type") == "panoramic"
    sliding = [d for d in plan["doors"] if d.get("type") == "sliding"]
    assert len(sliding) == 1 and sliding[0]["w"] > 1.5 and not sliding[0]["entrance"]
    assert abs((plan["windows"][0]["x"] + plan["windows"][0]["w"]) - sliding[0]["x"]) < 0.25   # attaccate: vetro continuo
    import main
    out = main.PlanResponse(**plan).model_dump()                          # il tipo arriva intatto all'app
    assert out["windows"][0]["type"] == "panoramic" and [d["type"] for d in out["doors"] if d["type"]] == ["sliding"]
    assert any("nome dedotto dagli arredi" in n for n in plan["notes"])  # wc e bidet dicono che è il bagno


def test_drawing_without_walls_is_refused_not_invented():
    """Mai una pianta di esempio: un DXF senza muri né locali dà un errore chiaro con i layer trovati."""
    dxf = "0\nSECTION\n2\nENTITIES\n0\nLINE\n8\nQuote\n10\n0\n20\n0\n11\n5\n21\n0\n0\nENDSEC\n0\nEOF\n"
    try:
        planner.import_dxf_data(dxf)
    except planner.DxfNotRecognised as e:
        assert "non importo nulla" in str(e) and "Quote" in str(e)
    else:
        raise AssertionError("doveva rifiutare il file")

if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
