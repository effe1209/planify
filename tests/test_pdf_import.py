"""Importazione di piante da PDF (pdf_import.py).

Avvio:  python3 tests/test_pdf_import.py
- appartamento_cad.pdf: l'appartamento di appartamento_cm.dxf plottato in scala 1:50 (tests/make_pdf_fixtures.py),
  con colori e spessori dei layer ma senza i layer;
- scansione.pdf: una pagina che è solo un'immagine.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pdf_import  # noqa: E402

HERE = os.path.join(os.path.dirname(__file__), "fixtures")


def _read(name):
    with open(os.path.join(HERE, name), "rb") as f:
        return f.read()


def test_cad_pdf_becomes_a_plan():
    plan = pdf_import.import_pdf_data(_read("appartamento_cad.pdf"))
    names = {r["name"] for r in plan["rooms"]}
    assert {"Soggiorno", "Cucina", "Bagno", "Camera Matrimoniale", "Camera", "Disimpegno"} <= names
    assert abs(plan["dimensions"]["width"] - 10.0) < 0.3
    assert len(plan["doors"]) >= 6 and len(plan["windows"]) >= 4
    assert plan["notes"][0].startswith("Pianta importata dal PDF")
    assert any("scala 1:50 letta sul foglio" in n for n in plan["notes"])


def test_scan_is_reported_as_raster():
    try:
        pdf_import.import_pdf_data(_read("scansione.pdf"))
    except pdf_import.RasterPdf:
        return
    raise AssertionError("una scansione deve dare RasterPdf")


def test_door_swing_is_an_arc():
    # quarto di cerchio di raggio 1 attorno all'origine, come lo campiona _bezier
    k = 0.5523
    pts = [(1, 0)] + pdf_import._bezier((1, 0), (1, k), (k, 1), (0, 1))
    cx, cy, r, a0, a1 = pdf_import._arc(pts)
    assert abs(cx) < 0.02 and abs(cy) < 0.02 and abs(r - 1) < 0.02
    assert min(a0, 360 - a0) < 1 and abs(a1 - 90) < 1   # antiorario da 0° a 90°


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
