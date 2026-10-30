"""Cucina e bagno arredati: il tavolo c'è sempre (anche a costo della penisola o del tavolino da salotto),
il bagno ha il lavabo su mobile, lo scaldasalviette e, se c'è posto, la colonna contenitore.

Avvio:  python3 tests/test_kitchen_bath.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import planner  # noqa: E402

CASES = [(10, 8, 3, "closed"), (12, 9, 4, "closed"), (8, 6, 2, "open"), (10, 8, 3, "open"), (14, 10, 5, "auto"),
         (6, 5, 1, "auto"), (7, 5, 2, "open")]


def _plans(peninsula=False):
    for seed in range(1, 8):
        for w, l, n, kitchen in CASES:
            yield planner.generate(w, l, "apartment", num_rooms=n, seed=seed, kitchen=kitchen, peninsula=peninsula)


def _types(plan, room):
    return [f["type"] for f in plan["furniture"] if f["room"] == room["id"]]


def test_every_kitchen_has_a_table():
    for peninsula in (False, True):
        for plan in _plans(peninsula):
            for r in plan["rooms"]:
                if r["kind"] in ("kitchen", "living_kitchen"):
                    assert {"table", "table_round"} & set(_types(plan, r)), (r["name"], r["w"], r["h"])


def test_bathrooms_are_furnished():
    vanity = towel = column = baths = 0
    for plan in _plans():
        for r in plan["rooms"]:
            if r["kind"] != "bath":
                continue
            baths += 1
            items = [f for f in plan["furniture"] if f["room"] == r["id"]]
            for f in items:
                if f["type"] == "sink":   # da 60 cm in su sempre su mobile, quello da 50 dei bagni piccoli no
                    assert bool((f.get("parts") or {}).get("cabinet")) == (max(f["w"], f["h"]) >= 0.6), f
                    vanity += max(f["w"], f["h"]) >= 0.6
            towel += any(f["type"] == "towel_radiator" for f in items)
            column += any(f["type"] == "bath_column" for f in items)
    assert vanity >= baths * 0.5, (baths, vanity)
    assert towel >= baths * 0.55 and column >= baths * 0.35, (baths, towel, column)   # solo se resta posto


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
