"""Planimetria catastale finta (nessun dato reale) per i test di catasto_import.py: due fogli A4 come quelli
dell'Agenzia, con intestazione, «Scala 1:200», il disegno come immagine scansionata (un po' storta,
a risoluzione piena) e le scritte come testo, come lo strato OCR dei PDF veri.
Foglio 1: l'appartamento di appartamento_cm.dxf, «Piano terra»; foglio 2: casa_soggiorno_L.dxf, «Piano primo».
Serve matplotlib (solo per rifare la fixture).

Avvio:  python3 tests/make_catasto_fixture.py
"""
import math
import os
import sys

import cv2
import numpy as np
import matplotlib
matplotlib.use("pdf")
matplotlib.rcParams["pdf.fonttype"] = 42
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, ".."))
import dxf_import as D  # noqa: E402

DPI, SCALE = 200, 200
MPP = 0.0254 / DPI * SCALE          # metri reali per pixel
A4 = (8.27, 11.69)


def plan_image(path, skew=0.4):
    segs, arcs, texts, _, units = D._read(open(path, encoding="utf-8").read())
    k = D._scale(units, segs)
    xs = [v * k for s in segs for v in (s[0], s[2])]
    ys = [v * k for s in segs for v in (s[1], s[3])]
    x0, y1 = min(xs) - 1, max(ys) + 1
    w, h = int((max(xs) - x0 + 1) / MPP), int((y1 - min(ys) + 1) / MPP)
    img = np.full((h, w), 255, np.uint8)
    P = lambda x, y: (int(round((x * k - x0) / MPP)), int(round((y1 - y * k) / MPP)))  # noqa: E731
    for a, b, c, d, role in segs:
        if role in ("wall", "door", "window", "other"):
            cv2.line(img, P(a, b), P(c, d), 0, 2)
    for cx, cy, r, a0, a1, _ in arcs:
        cv2.ellipse(img, P(cx, cy), (int(r * k / MPP),) * 2, 0, -a1, -a0, 0, 1)
    M = cv2.getRotationMatrix2D((w / 2, h / 2), skew, 1.0)
    img = cv2.warpAffine(img, M, (w, h), borderValue=255)
    labels = [((x * k - x0) / MPP, (y1 - y * k) / MPP, t) for x, y, t in texts if not t.strip().isdigit()]
    return img, labels


def page(pdf, img, labels, floor, sub):
    fig = plt.figure(figsize=A4)
    ax = fig.add_axes([0, 0, 1, 1])
    W, H = A4[0] * DPI, A4[1] * DPI
    ax.set_xlim(0, W); ax.set_ylim(H, 0); ax.axis("off")
    for y, t in ((150, "Agenzia del Territorio"), (190, "CATASTO FABBRICATI"), (230, "Ufficio Provinciale di Esempio")):
        ax.text(160, y, t, fontsize=10)
    ax.text(900, 150, "Planimetria di u.i.u. in Comune di Esempio", fontsize=8)
    ax.text(900, 260, f"Foglio: 1  Particella: 1  Subalterno: {sub}", fontsize=8)
    ax.text(160, 350, "Scheda n. 1        Scala 1:200", fontsize=8)
    ax.plot([140, 1510, 1510, 140, 140], [370, 370, 2150, 2150, 370], color="black", linewidth=0.8)
    h, w = img.shape
    ox, oy = (W - w) / 2, 700
    ax.imshow(np.dstack([img] * 3), extent=(ox, ox + w, oy + h, oy), interpolation="none")
    for x, y, t in labels:
        ax.text(ox + x, oy + y, t, fontsize=5, ha="center", va="center")
    ax.text(W / 2, oy + h + 60, floor, fontsize=9, ha="center")
    ax.text(160, 2200, "Ultima planimetria in atti", fontsize=7)
    pdf.savefig(fig)
    plt.close(fig)


if __name__ == "__main__":
    out = os.path.join(HERE, "fixtures", "catasto_esempio.pdf")
    with PdfPages(out) as pdf:
        page(pdf, *plan_image(os.path.join(HERE, "fixtures", "appartamento_cm.dxf")), "Piano terra", 1)
        page(pdf, *plan_image(os.path.join(HERE, "fixtures", "casa_soggiorno_L.dxf"), skew=-0.3), "Piano primo", 2)
    print(out, os.path.getsize(out))
