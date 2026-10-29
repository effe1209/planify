"""Regole da interior designer: quante piante le rispettano.

Avvio:  python3 -m pytest tests/test_interior.py   (oppure  python3 tests/test_interior.py  per il resoconto)

Per ogni pianta generata si controllano le relazioni tra arredi, porte e finestre (vedi docs/PIANO_INTERIOR.md):
TV senza finestra alle spalle, divano non con lo schienale verso la porta, letto non sotto la finestra né
sulla parete della porta, WC non di fronte alla porta, scrivania non rivolta alla finestra, fuochi non
sotto la finestra, nessun tavolo tra TV e divano. Si misurano anche gli arredi non inseriti e il punteggio.
"""
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import planner  # noqa: E402

OPP = planner.OPP


def _capture():
    """Il Layout finale di generate (serialize lo riceve già ruotato e specchiato)."""
    box = {}
    original = planner.serialize

    def spy(lay, palette, seed):
        box["lay"] = lay
        return original(lay, palette, seed)

    return box, spy, original


def _side_of(room, o):
    if o.orient == "h":
        return "N" if room.rect.cy > o.line else "S"
    return "W" if room.rect.cx > o.line else "E"


def _span(rect, side):
    return (rect.x, rect.x2) if side in "NS" else (rect.y, rect.y2)


def _overlap(a, b, pad=0.0):
    return min(a[1], b[1]) - max(a[0], b[0]) > -pad


def audit(lay):
    """Violazioni delle regole in una pianta arredata: Counter {regola: quante}, Counter {regola: controlli}."""
    bad, seen = Counter(), Counter()
    items = {}
    for it in lay.items:
        items.setdefault(it.room_id, []).append(it)
    for room in lay.rooms:
        its = items.get(room.id, [])
        wins = [w for w in lay.windows if w.room_a == room.id]
        doors = [d for d in lay.doors if room.id in (d.room_a, d.room_b)]
        win_on = lambda side, span=None, pad=0.0: any(_side_of(room, w) == side and (span is None or _overlap(
            (w.start, w.start + w.w), span, pad)) for w in wins)
        door_on = lambda side, span=None, pad=0.0: any(_side_of(room, d) == side and (span is None or _overlap(
            (d.start, d.start + d.w), span, pad)) for d in doors)
        by = lambda *t: [i for i in its if i.type in t]
        tv, sofa = by("tv"), by("sofa", "sofa_corner")
        if tv:
            seen["tv"] += 1
            side = OPP[tv[0].facing]
            if win_on(side, _span(tv[0].rect, side), 0.8):
                bad["tv"] += 1                       # finestra accanto o dietro la TV: controluce
        if tv and sofa:
            seen["sofa_window"] += 1
            back = OPP[sofa[0].facing]
            if win_on(back, _span(sofa[0].rect, back), 0.3):
                bad["sofa_window"] += 1              # finestra dietro al divano: riflessi sullo schermo
            seen["sofa_door"] += 1
            s = sofa[0]
            back = OPP[s.facing]
            if door_on(back, _span(s.rect, back), 0.6):
                bad["sofa_door"] += 1                # schienale verso una porta
            seen["table_between"] += 1
            t, so = tv[0].rect, s.rect
            lo_x, hi_x = min(t.cx, so.cx), max(t.cx, so.cx)
            lo_y, hi_y = min(t.cy, so.cy), max(t.cy, so.cy)
            if any(i.rect.cx > lo_x - 0.3 and i.rect.cx < hi_x + 0.3 and i.rect.cy > lo_y - 0.3 and i.rect.cy < hi_y + 0.3
                   for i in by("table", "table_round")):
                bad["table_between"] += 1
        for bed in by("bed"):
            head = OPP[bed.facing]
            seen["bed_window"] += 1
            if win_on(head, _span(bed.rect, head)):
                bad["bed_window"] += 1               # testiera sotto la finestra
            seen["bed_door_wall"] += 1
            if door_on(head, _span(bed.rect, head), 0.6):
                bad["bed_door_wall"] += 1            # testiera accanto alla porta
        for wc in by("toilet"):
            seen["wc_door"] += 1
            front = wc.facing                        # il WC guarda verso questo lato
            if door_on(front, _span(wc.rect, front), 0.5):
                bad["wc_door"] += 1                  # WC di fronte alla porta
        for desk in by("desk"):
            seen["desk_window"] += 1
            if win_on(OPP[desk.facing], _span(desk.rect, OPP[desk.facing])):
                bad["desk_window"] += 1              # scrivania rivolta alla finestra (abbagliamento)
        if len(doors) >= 2 and room.kind in planner.PATH_KINDS:
            P = planner.Placer(lay)
            P.use_paths = True
            seen["path"] += 1
            if any(i.rect.overlaps(z) for z in P.path_zones(room) for i in its):
                bad["path"] += 1                     # un arredo taglia il passaggio tra due porte
        for c in by("kitchen_counter"):
            seen["hob_window"] += 1
            side = OPP[c.facing]
            length = c.rect.w if side in "NS" else c.rect.h
            hob_local = (c.parts or {}).get("hob") or planner.counter_layout(length)[0]
            # come in PlanSvg/Oriented: il locale x cresce verso destra guardando il fronte, specchiato se flip
            start = c.rect.x if side in "NS" else c.rect.y
            rightward = {"S": True, "N": False, "W": True, "E": False}[c.facing]
            pos = hob_local if rightward != c.flip else length - hob_local
            hob = start + pos
            if win_on(side, (hob - 0.35, hob + 0.35)):
                bad["hob_window"] += 1               # piano cottura sotto la finestra
    return bad, seen


def survey(n_seeds=12):
    box, spy, original = _capture()
    planner.serialize = spy
    bad, seen, missing, issues, scores = Counter(), Counter(), 0, 0, []
    try:
        for seed in range(1, n_seeds + 1):
            for W, L, kw in [(10, 8, {}), (12, 9, {"double_bedrooms": 2, "single_bedrooms": 1}),
                             (9, 7, {"kitchen": "closed"}), (13, 10, {"needs": {"entry": True, "study": True}}),
                             (8, 6.5, {}), (11, 10, {"double_bedrooms": 1, "single_bedrooms": 2, "peninsula": True})]:
                plan = planner.generate(W, L, "apartment", seed=seed, **kw)
                b, s = audit(box["lay"])
                bad.update(b)
                seen.update(s)
                missing += sum(1 for n in plan["notes"] if "non inserit" in n or "insufficiente" in n)
                issues += sum(1 for n in plan["notes"] if " blocca " in n or "si sovrappongono" in n or "fuori da" in n)
                scores.append(plan["design"]["score"])
    finally:
        planner.serialize = original
    return bad, seen, missing, issues, sum(scores) / len(scores)


# quota massima di piante che violano la regola (all'inizio, prima delle regole: tv 69%, divano verso la
# porta 68%, letto sotto la finestra 51%, WC di fronte alla porta 19%, fuochi sotto la finestra 76%,
# passaggi tagliati 34%)
LIMITS = {"tv": 0.10, "sofa_door": 0.10, "bed_window": 0.25, "wc_door": 0.10, "hob_window": 0.05,
          "table_between": 0.05, "path": 0.05}


def test_designer_rules_mostly_respected():
    bad, seen, missing, issues, score = survey(4)
    for rule, limit in LIMITS.items():
        assert bad[rule] <= limit * max(1, seen[rule]), (rule, bad[rule], seen[rule])
    assert issues == 0 and missing == 0


if __name__ == "__main__":
    bad, seen, missing, issues, score = survey()
    for rule in sorted(seen):
        print(f"{rule:15s} {bad[rule]:4d} / {seen[rule]:4d}  ({100 * bad[rule] / seen[rule]:.0f}%)")
    print(f"arredi non inseriti {missing}, problemi di validazione {issues}, punteggio medio {score:.1f}")
