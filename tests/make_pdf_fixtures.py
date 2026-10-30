"""DXF → PDF come un plottaggio da CAD: geometria con colori e spessori dei layer (ezdxf drawing), testi veri,
riempimenti pieni e la scala scritta sul foglio. Serve matplotlib (solo per rifare le fixture).

Avvio:  python3 tests/make_pdf_fixtures.py tests/fixtures/appartamento_cm.dxf tests/fixtures/appartamento_cad.pdf 50
"""
import sys
sys.path.insert(0, ".")
import matplotlib
matplotlib.use("pdf")
matplotlib.rcParams["pdf.fonttype"] = 42
import matplotlib.pyplot as plt
import ezdxf
from ezdxf import recover
from ezdxf.addons.drawing import RenderContext, Frontend
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend
from ezdxf.addons.drawing.config import Configuration, TextPolicy, LineweightPolicy, HatchPolicy
import dxf_import as D

src, out, scale = sys.argv[1], sys.argv[2], int(sys.argv[3])
doc, _ = recover.readfile(src)
text = open(src, encoding="utf-8", errors="replace").read()
segs, arcs, texts, boxes, units = D._read(text)
k = D._scale(units, segs)
xs = [v for s in segs for v in (s[0], s[2])]; ys = [v for s in segs for v in (s[1], s[3])]
xs.sort(); ys.sort()
cut = lambda a: (a[len(a) // 50], a[-len(a) // 50 - 1])
(x0, x1), (y0, y1) = cut(xs), cut(ys)
m = 1.0 / k
wm, hm = x1 - x0 + 2 * m, y1 - y0 + 3 * m
inch = lambda u: u * k / scale / 0.0254
fig = plt.figure(figsize=(inch(wm), inch(hm)))
ax = fig.add_axes([0, 0, 1, 1])
cfg = Configuration(text_policy=TextPolicy.IGNORE, lineweight_policy=LineweightPolicy.ABSOLUTE, lineweight_scaling=1.0,
                    min_lineweight=0.1, hatch_policy=HatchPolicy.SHOW_SOLID)
Frontend(RenderContext(doc), MatplotlibBackend(ax), config=cfg).draw_layout(doc.modelspace(), finalize=False)
ax.set_xlim(x0 - m, x0 - m + wm); ax.set_ylim(y0 - 2 * m, y0 - 2 * m + hm); ax.axis("off")
for t in texts:
    ax.text(t[0], t[1], t[2], fontsize=4)
ax.text(x0, y0 - 1.5 * m, f"PIANTA - Scala 1:{scale}", fontsize=6)
fig.savefig(out)
print(out, round(k, 4))
