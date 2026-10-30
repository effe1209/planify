"""Planimetrie catastali scansionate (catasto_import.py) sulla fixture anonima catasto_esempio.pdf
(tests/make_catasto_fixture.py): due fogli A4, scala 1:200, disegni un po' storti, testo come strato OCR.

Avvio:  python3 tests/test_catasto_import.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import catasto_import as C  # noqa: E402

HERE = os.path.join(os.path.dirname(__file__), "fixtures")


def _read(name):
    with open(os.path.join(HERE, name), "rb") as f:
        return f.read()


def test_pages_scale_and_floors():
    pages = C.read_pages(_read("catasto_esempio.pdf"))
    assert len(pages) == 2 and C.is_catasto(pages)
    assert all(p["scale"] == 200 and abs(p["mpp"] - 0.0254) < 0.001 for p in pages)   # 200 dpi a 1:200
    assert [name for p in pages for _, name in C.drawings(p)] == ["Piano terra", "Piano primo"]


def test_whole_house_from_one_pdf():
    res = C.import_catasto(_read("catasto_esempio.pdf"))
    assert [(f["level"], f["name"]) for f in res["floors"]] == [(0, "Piano terra"), (1, "Piano primo")]
    ground = res["floors"][0]["plan"]
    assert abs(ground["dimensions"]["width"] - 10) < 0.3 and abs(ground["dimensions"]["length"] - 8) < 0.3
    names = {r["name"] for r in ground["rooms"]}
    assert {"Soggiorno", "Cucina", "Camera Matrimoniale", "Camera"} <= names
    assert len(ground["doors"]) >= 4 and len(ground["windows"]) >= 4
    assert res["notes"][0].startswith("Planimetria catastale in scala 1:200: 2 piani da 2 pagine")


def test_cad_pdf_is_not_catasto():
    try:
        C.import_catasto(_read("appartamento_cad.pdf"))
    except C.NotCatasto:
        return
    raise AssertionError("un PDF da CAD non è una planimetria catastale")


def test_floor_names():
    cases = {"Piano terra": 0, "Piano primo": 1, "Piano interrato": -1, "Piano secondo": 2, "Piano S1": -1,
             "Piano sottotetto": 3, "Piano T": 0, "Piano 1°": 1}
    for name, level in cases.items():
        assert C.floor_level(name) == level, name


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
