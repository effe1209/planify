/*
 * «Relazione di copertura» in PDF, da allegare al preventivo dell'impianto antintrusione:
 * copertina con riepilogo per piano, una tavola di copertura per piano (zone coperte, parziali e cieche,
 * codici dei rilevatori, stato delle porte), tabelle dei rilevatori, della copertura per locale e dei varchi,
 * distinta materiali, ipotesi di calcolo, fonti dei dati e limiti.
 * Caricato solo al clic (import dinamico), come lib/pdfExport.js di cui riusa gli strumenti.
 */
import { jsPDF } from 'jspdf';
import specs from '../data/ajax-specs.json';
import { AJAX_MODELS, billOfMaterials, DEVICE_STYLE } from './ajax';
import { aimDevice, ASSUMPTIONS, COVER_COLORS, coverFloor, deviceWarnings, doorsFor, sensorCodes } from './coverage';
import { ACCENT, floorImage, footer, grossArea, INK, LINE, M, MUTED, safe, table } from './pdfExport';
import { houseFor, levelLabel } from './project';
import { projectStairs } from './stairs';

const pct = (n) => `${n}%`;
const m2 = (v) => `${v.toLocaleString('it-IT', { maximumFractionDigits: 1 })} m²`;
const num = (v, d = 2) => v.toLocaleString('it-IT', { maximumFractionDigits: d });
const OPENING = { door: 'Porta', window: 'Finestra' };
const rgb = ([r, g, b]) => [r, g, b];

/* Copertura di un piano: totali dei locali con un sensore proprio. */
function floorTotals(cov) {
  const watched = cov.rooms.filter((r) => r.own > 0 && r.area > 0);
  const area = watched.reduce((a, r) => a + r.area, 0);
  const covered = watched.reduce((a, r) => a + r.covered, 0);
  const partial = watched.reduce((a, r) => a + r.partial, 0);
  const blind = watched.reduce((a, r) => a + r.blind, 0);
  return {
    watched, area, blind,
    pct: area ? Math.round((100 * covered) / area) : 0,
    pctAny: area ? Math.round((100 * (covered + partial)) / area) : 0,
    openOk: cov.openings.filter((o) => o.ok).length, openAll: cov.openings.length,
  };
}

function heading(doc, title, sub) {
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(INK).text(safe(title), M, 18);
  if (!sub) return 26;
  const lines = doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(MUTED)
    .splitTextToSize(safe(sub), doc.internal.pageSize.getWidth() - 2 * M);
  doc.text(lines, M, 24);
  return 26 + lines.length * 3.8;
}

function paragraph(doc, y, text, { size = 9.5, color = INK } = {}) {
  const w = doc.internal.pageSize.getWidth() - 2 * M;
  const lines = doc.setFont('helvetica', 'normal').setFontSize(size).setTextColor(color).splitTextToSize(safe(text), w);
  if (y + lines.length * size * 0.42 > doc.internal.pageSize.getHeight() - 18) {
    doc.addPage('a4', 'portrait');
    y = 20;
  }
  doc.text(lines, M, y);
  return y + lines.length * size * 0.42 + 2.5;
}

function cover(doc, project, floors, devices) {
  const pw = doc.internal.pageSize.getWidth();
  doc.setFillColor(ACCENT).rect(0, 0, pw, 6, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(ACCENT).text('PLANIFY · RELAZIONE DI COPERTURA', M, 28);
  doc.setFontSize(24).setTextColor(INK);
  doc.text(doc.splitTextToSize(safe(project.name || 'Impianto antintrusione'), pw - 2 * M), M, 42);
  const date = new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.setFont('helvetica', 'normal').setFontSize(11).setTextColor(MUTED);
  doc.text(safe(`Impianto antintrusione Ajax · verifica della copertura dei rilevatori · ${date}`), M, 52);

  let y = 68;
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(INK).text('Riepilogo per piano', M, y);
  const rows = floors.map(({ f, t, cov }) => [
    [`${levelLabel(f.level)}  ${f.name}`, `${fmtArea(grossArea(f.plan))} lordi`],
    t.watched.length ? `${pct(t.pct)} (${pct(t.pctAny)} con parziali)` : '-',
    t.watched.length ? m2(t.blind) : '-',
    t.openAll ? `${t.openOk} / ${t.openAll}` : '-',
    String(cov.sensors.length),
  ]);
  y = table(doc, y + 4, ['Piano', 'Copertura locali sorvegliati', 'Zone cieche', 'Varchi protetti', 'Rilevatori'], rows,
    [0.28, 0.26, 0.16, 0.16, 0.14]) + 10;

  const all = floors.flatMap(({ t }) => t.watched);
  const area = all.reduce((a, r) => a + r.area, 0);
  const cov = all.reduce((a, r) => a + r.covered, 0);
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(INK).text('In sintesi', M, y);
  y = paragraph(doc, y + 6, `${devices.length} dispositivi Ajax, di cui ${floors.reduce((a, { cov: c }) => a + c.sensors.length, 0)} rilevatori `
    + `di movimento. Nei ${all.length} locali con un rilevatore proprio è coperto il ${area ? Math.round((100 * cov) / area) : 0}% `
    + `della superficie calpestabile (${m2(cov)} su ${m2(area)}).`);
  const unprotected = floors.flatMap(({ f, cov: c }) => c.openings.filter((o) => !o.ok).map((o) => ({ f, o })));
  y = paragraph(doc, y, unprotected.length
    ? `Varchi verso l'esterno senza protezione: ${unprotected.map(({ f, o }) => `${OPENING[o.type].toLowerCase()} in "${o.roomName}" (${f.name})`).join(', ')}.`
    : "Tutti i varchi verso l'esterno sono protetti da contatto, tenda, rottura vetri o volumetrico.");

  y += 6;
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(INK).text('Metodo', M, y);
  y = paragraph(doc, y + 6, 'Per ogni rilevatore si ricostruisce il campo reale dai dati ufficiali Ajax (portata, apertura '
    + 'orizzontale, fasce verticali, altezza di montaggio) e si traccia un raggio dal sensore verso una persona in piedi, '
    + 'in ogni punto del pavimento a passi di 10 cm. Muri, porte chiuse, vetrate e arredi sono volumi con la loro altezza: '
    + 'un armadio nasconde chi sta dietro, un divano basso no. Le ipotesi e i limiti sono in fondo alla relazione.', { color: MUTED });
}

const fmtArea = (v) => m2(Math.round(v * 10) / 10);

/* Tavola di copertura del piano: pianta con le zone e i codici dei rilevatori, legenda e copertura per locale. */
async function coveragePage(doc, f, devices, cov, t, codes, doors, extra) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(INK);
  doc.text(safe(`${levelLabel(f.level)}  ${f.name} · copertura dei rilevatori`), M, 16);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(MUTED);
  doc.text(safe(t.watched.length
    ? `Locali sorvegliati coperti al ${t.pct}% (${t.pctAny}% con le zone parziali) · varchi protetti ${t.openOk}/${t.openAll}`
    : 'Nessun rilevatore di movimento su questo piano'), M, 22);

  const side = 66;
  const doorState = (i) => doors[i] || doors.default;
  const img = await floorImage(f, devices, { ...extra, coverage: cov, deviceCodes: codes, doorStates: doorState, onDoorToggle: () => {} });
  const boxW = pw - 2 * M - side - 6;
  const boxH = ph - 28 - 16;
  const z = Math.min(boxW / img.w, boxH / img.h);
  doc.addImage(img.data, 'PNG', M, 27, img.w * z, img.h * z, undefined, 'FAST');

  const x = pw - M - side;
  let y = 30;
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(INK).text('Legenda', x, y);
  y += 6;
  const legend = [['covered', 'Coperto'], ['overlap', 'Visto da più rilevatori'], ['partial', 'Parziale (un punto del corpo)'],
    ['blind', 'Cieco'], ['unwatched', 'Locale senza rilevatore proprio']];
  for (const [k, label] of legend) {
    const c = COVER_COLORS[k];
    const a = Math.min(1, (c[3] / 255) * 2.2);
    const mix = rgb(c).map((v) => Math.round(255 - (255 - v) * a));
    doc.setFillColor(...mix).roundedRect(x, y - 3, 5, 4, 0.8, 0.8, 'F');
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(INK).text(safe(label), x + 7, y);
    y += 5.5;
  }
  doc.setFillColor('#b42318').roundedRect(x, y - 2.2, 5, 1.6, 0.8, 0.8, 'F');
  doc.setTextColor(INK).text('Porta chiusa nel calcolo', x + 7, y);
  y += 5.5;
  doc.setDrawColor('#16a34a').setLineWidth(0.8).setLineDashPattern([1, 0.8], 0).line(x, y - 1.4, x + 5, y - 1.4);
  doc.setLineDashPattern([], 0);
  doc.text('Porta aperta nel calcolo', x + 7, y);
  y += 9;

  doc.setFont('helvetica', 'bold').setFontSize(10).text('Copertura per locale', x, y);
  y += 6;
  for (const r of cov.rooms.filter((q) => q.area > 0 && q.kind !== 'garden')) {
    if (y > ph - 22) break;
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(r.own ? INK : MUTED);
    doc.text(doc.splitTextToSize(safe(r.name), side - 18)[0], x, y);
    doc.setFont('helvetica', 'bold').text(r.own ? pct(r.pct) : r.pctAny ? `vista ${pct(r.pctAny)}` : '-', x + side, y, { align: 'right' });
    if (r.own) {
      const bw = side, by = y + 1.4;
      doc.setFillColor(248, 200, 200).rect(x, by, bw, 1.4, 'F');
      doc.setFillColor(74, 190, 120).rect(x, by, (bw * r.pct) / 100, 1.4, 'F');
      doc.setFillColor(240, 205, 90).rect(x + (bw * r.pct) / 100, by, (bw * (r.pctAny - r.pct)) / 100, 1.4, 'F');
    }
    y += 7;
  }
  doc.setDrawColor(LINE);
}

function sensorTable(doc, project, devices, codes) {
  doc.addPage('a4', 'portrait');
  let y = heading(doc, 'Rilevatori', 'Posizione dall\'angolo in alto a sinistra della pianta (x verso destra, y verso il basso); '
    + 'direzione dell\'asse: 0° verso destra, 90° verso il basso.');
  const floorOf = Object.fromEntries(project.floors.map((f) => [f.id, f]));
  const rows = devices.filter((d) => codes[d.id]).map((d) => {
    const f = floorOf[d.floor];
    const { x, y: yy, dir, h } = aimDevice(f.plan, d);
    const warn = deviceWarnings(f.plan, d, devices);
    return [
      codes[d.id],
      [AJAX_MODELS[d.model]?.name || d.model, DEVICE_STYLE[d.model]?.tag || ''],
      [d.roomName || 'Esterno', f.name],
      `${num(x)} ; ${num(yy)} m`,
      `${Math.round(((dir % 360) + 360) % 360)}°`,
      `${num(h, 1)} m`,
      [d.purpose, ...warn.map((w) => `Avviso: ${w}`)],
    ];
  });
  return table(doc, y, ['Cod.', 'Modello', 'Locale', 'Posizione', 'Dir.', 'Altezza', 'Scopo e avvisi'], rows,
    [0.07, 0.17, 0.15, 0.14, 0.07, 0.09, 0.31], { onNewPage: () => doc.addPage('a4', 'portrait') });
}

function roomsTable(doc, floors) {
  doc.addPage('a4', 'portrait');
  const y = heading(doc, 'Copertura per locale', 'Superficie calpestabile (esclusa quella occupata dagli arredi); '
    + 'coperto = almeno due punti del corpo visti, parziale = uno.');
  const rows = floors.flatMap(({ f, cov }) => cov.rooms.filter((r) => r.area > 0 && r.kind !== 'garden').map((r) => [
    [r.name, f.name],
    m2(r.area),
    r.own ? pct(r.pct) : '-',
    r.own ? pct(r.pctAny - r.pct) : '-',
    r.own ? (r.blindCauses.filter((c) => c.area >= 0.1).slice(0, 4).map((c) => `${c.label.toLowerCase()} ${m2(c.area)}`).join(', ') || 'nessuna')
      : r.pctAny ? `Nessun rilevatore proprio; visto al ${r.pctAny}% dai rilevatori vicini` : 'Nessun rilevatore',
  ]));
  return table(doc, y, ['Locale', 'Superficie', 'Coperto', 'Parziale', 'Zone cieche e cause'], rows,
    [0.24, 0.13, 0.11, 0.11, 0.41], { onNewPage: () => doc.addPage('a4', 'portrait') });
}

function openingsTable(doc, floors, y) {
  const rows = floors.flatMap(({ f, cov }) => cov.openings.map((o) => [
    [`${OPENING[o.type]} ${num(o.w)} m`, f.name], o.roomName, o.ok ? o.by.join(' + ') : 'NON PROTETTO',
  ]));
  if (!rows.length) return y;
  if (y > doc.internal.pageSize.getHeight() - 60) {
    doc.addPage('a4', 'portrait');
    y = 20;
  } else y += 12;
  doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(INK).text("Varchi verso l'esterno", M, y);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(MUTED)
    .text('Protetto da: contatto sul varco, tenda che ne vede il piano, rottura vetri nel locale, volumetrico che vede chi entra.', M, y + 6);
  return table(doc, y + 10, ['Varco', 'Locale', 'Protezione'], rows, [0.3, 0.3, 0.4],
    { onNewPage: () => doc.addPage('a4', 'portrait') });
}

function bomTable(doc, project, devices) {
  const bom = billOfMaterials(project, devices);
  if (!bom.length) return;
  doc.addPage('a4', 'portrait');
  const y = heading(doc, 'Distinta materiali', `${devices.length} dispositivi Ajax Systems · quantità per modello`);
  table(doc, y, ['Modello Ajax', 'Tipo', 'Q.tà', 'Locali', 'Scopo'],
    bom.map((r) => [[r.model.name, r.model.category], r.model.type, String(r.qty), r.places.join(', '), r.purposes.join('; ')]),
    [0.22, 0.17, 0.07, 0.27, 0.27], { onNewPage: () => doc.addPage('a4', 'portrait') });
}

function assumptions(doc, project, devices, doorsInfo) {
  doc.addPage('a4', 'portrait');
  let y = heading(doc, 'Ipotesi, fonti e limiti');
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(INK).text('Ipotesi di calcolo', M, y);
  y += 6;
  for (const a of [...ASSUMPTIONS, doorsInfo]) y = paragraph(doc, y, `- ${a}`);

  y += 4;
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(INK).text('Fonti dei dati dei rilevatori', M, y);
  y += 6;
  y = paragraph(doc, y, `Schede tecniche e manuali ufficiali Ajax Systems consultati il ${new Date(specs._meta.retrieved).toLocaleDateString('it-IT')}. `
    + 'Le fasce verticali e la portata ai bordi del ventaglio sono misurate sui diagrammi dei manuali (precisione circa 0,5° e 0,3 m).',
  { color: MUTED });
  const used = [...new Set(devices.map((d) => d.model))];
  for (const id of used) {
    const s = specs.models[id];
    if (!s) continue;
    y = paragraph(doc, y, `- ${s.name}: ${s.sources.specs}`, { size: 8.5, color: MUTED });
  }

  y += 4;
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(INK).text('Limiti', M, y);
  y += 6;
  paragraph(doc, y, 'La relazione è uno strumento di progetto e di preventivazione: descrive la copertura teorica dei '
    + 'rilevatori nelle ipotesi indicate, sulla pianta e sugli arredi del progetto. Non sostituisce il sopralluogo, la '
    + 'prova di camminata (walk test) dopo l\'installazione né la verifica dell\'impianto. La scelta del grado di '
    + 'sicurezza, la conformità alle norme (CEI 79-3, EN 50131) e il collaudo restano a cura dell\'installatore.');
}

export async function exportCoverageReport(project) {
  const devices = project.security?.devices || [];
  const { byFloor } = projectStairs(project);
  const house = houseFor(project);
  const codes = sensorCodes(project, devices);
  const floors = project.floors.filter((f) => f.plan && devices.some((d) => d.floor === f.id)).map((f) => {
    const doors = doorsFor(project.security, f.id);
    const cov = coverFloor(f.plan, devices.filter((d) => d.floor === f.id), { doors });
    return { f, doors, cov, t: floorTotals(cov) };
  });
  if (!floors.length) throw new Error('nessun dispositivo nel progetto');

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title: safe(`Relazione di copertura · ${project.name || 'Impianto antintrusione'}`), creator: 'Planify' });
  cover(doc, project, floors, devices);
  for (const { f, doors, cov, t } of floors) {
    doc.addPage('a4', 'landscape');
    await coveragePage(doc, f, devices.filter((d) => d.floor === f.id), cov, t, codes, doors, { stairs: byFloor[f.id], house });
  }
  sensorTable(doc, project, devices, codes);
  const y = roomsTable(doc, floors);
  openingsTable(doc, floors, y);
  bomTable(doc, project, devices);
  // porte cambiate una per una rispetto allo stato generale
  const def = project.security?.doors === 'open' ? 'open' : 'closed';
  const other = floors.reduce((a, { f, doors }) => a + f.plan.doors.filter((d, i) => d.kind !== 'gate' && (doors[i] || def) !== def).length, 0);
  const word = { open: 'aperte', closed: 'chiuse' };
  assumptions(doc, project, devices, `Porte interne considerate ${word[def]} (caso ${def === 'closed' ? 'peggiore' : 'migliore'} per la visibilità)`
    + `${other ? `, tranne ${other} indicate ${word[def === 'open' ? 'closed' : 'open']} nelle tavole` : ''}.`);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    footer(doc, project, i, pages);
  }
  const name = (project.name || 'impianto').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  doc.save(`relazione-copertura-${name || 'impianto'}.pdf`);
}
