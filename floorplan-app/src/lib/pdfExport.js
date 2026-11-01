/*
 * «Esporta progetto PDF»: copertina con riepilogo, la casa in 3D, una pagina per piano (pianta ad alta
 * risoluzione con i dispositivi e la loro legenda), la tavola elettrica di ogni piano se il progetto
 * ha l'impianto elettrico, quella idraulica se ha l'impianto idraulico e, in fondo, circuiti, colonne e
 * distinte (elettrico, idraulico, allarme Ajax).
 * Caricato solo al clic (import dinamico), così jsPDF non pesa sull'avvio dell'app.
 */
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { jsPDF } from 'jspdf';
import PlanSvg from '../components/PlanSvg';
import { Drawing } from '../components/SheetsView';
import { elevation, levelMarks, section } from './elevation';
import { ROOF_DEFAULTS } from './roof';
import { TYPE_NAME } from '../constants';
import { AJAX_MODELS, billOfMaterials, DEVICE_STYLE } from './ajax';
import { APPLIANCES, KIND_ORDER, KINDS, LEVELS, planElectric } from './electric';
import { GENERATORS, PIPES, PKIND_ORDER, PKINDS, planPlumbing } from './plumbing';
import { buildEstimate } from './estimate';
import { scheduleFor } from './schedule';
import { houseFor, levelLabel } from './project';
import { projectStairs } from './stairs';
import { serializeSvg } from './sheet';
import { A4, CARTOUCHE_H, LEGEND_W, drawingArea, fitScale, roomLegend } from './techSheet';
import { getBranding } from './branding';
import { fmt, fmtM } from './utils';

export const INK = '#14181f';
export const MUTED = '#6b7482';
export const LINE = '#d5dae1';
export const ACCENT = '#d1f462';   // lime del marchio: riempimenti (barre); il testo sopra o accanto usa ACCENT_INK, che si legge su carta
export const ACCENT_INK = '#4d6600';
export const M = 16;   // margine pagina, mm
const LAYERS = { furniture: true, labels: true, dims: true, grid: false, alarm: true };

/* I font standard del PDF coprono solo WinAnsi: niente apostrofi tipografici, ≥, frecce… */
export const safe = (s) => String(s ?? '')
  .replace(/[‘’]/g, "'").replace(/[“”«»]/g, '"').replace(/[—–]/g, '-').replace(/≥/g, '>=').replace(/≤/g, '<=')
  .replace(/[^\n\x20-\x7e\xa0-\xff]/g, '');

/* Disegna PlanSvg fuori schermo e lo rasterizza in PNG. */
export async function floorImage(floor, devices, extra, k = 3) {
  const host = document.createElement('div');
  const root = createRoot(host);
  flushSync(() => root.render(createElement(PlanSvg, {
    plan: floor.plan, layers: LAYERS, style: floor.meta?.style, devices, ...extra,
    typeLabel: `${TYPE_NAME[floor.meta?.type] || 'Planimetria'} · ${floor.name}`,
  })));
  const { xml, w, h } = serializeSvg(host.querySelector('svg'));
  root.unmount();
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('Rendering della pianta non riuscito'));
      im.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * k);
    canvas.height = Math.round(h * k);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL('image/png'), w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* Un elemento React con un SVG → PNG (stesso giro di floorImage). */
async function svgToPng(element, k = 3) {
  const host = document.createElement('div');
  const root = createRoot(host);
  flushSync(() => root.render(element));
  const { xml, w, h } = serializeSvg(host.querySelector('svg'));
  root.unmount();
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('Rendering del disegno non riuscito'));
      im.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * k);
    canvas.height = Math.round(h * k);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL('image/png'), w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/*
 * Prospetti N/S/E/O (con il tetto) e due sezioni (senza tetto, per vedere dentro). Nel loft il taglio passa per la scala
 * del soppalco, così la sezione mostra gradini, solaio, parapetto e le altezze libere (rosse se fuori norma).
 */
async function elevationPages(doc, project, north) {
  const levels = levelMarks(project);
  if (!levels.length) return;
  const first = project.floors.filter((f) => typeof f.level === 'number' && f.plan?.rooms?.length).sort((a, b) => a.level - b.level)
    .find((f) => f.plan.mezzanine) || project.floors.find((f) => typeof f.level === 'number' && f.plan?.rooms?.length);
  const dims = first.plan.dimensions;
  let cutY = dims.length / 2;
  let cutX = dims.width / 2;
  const st = first.plan.mezzanine?.stair;
  if (st) {
    if (st.up === 'E' || st.up === 'W') cutY = st.y + st.h / 2;
    else cutX = st.x + st.w / 2;
  }
  const roof = { ...ROOF_DEFAULTS };
  const drawings = [
    ...['down', 'up', 'right', 'left'].map((s) => elevation(project, s, { north, roof })),
    section(project, 'x', cutY),
    section(project, 'y', cutX),
  ].filter((d) => d.shapes.length);
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const put = async (list, cols, title, sub) => {
    if (!list.length) return;
    doc.addPage('a4', 'landscape');
    doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(INK).text(safe(title), M, 16);
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(MUTED).text(safe(sub), M, 22);
    const rows = Math.ceil(list.length / cols);
    const cw = (pw - 2 * M - 6 * (cols - 1)) / cols;
    const chh = (ph - 28 - 16 - 6 * (rows - 1)) / rows;
    for (let i = 0; i < list.length; i++) {
      const img = await svgToPng(createElement(Drawing, { d: list[i], marks: levels }), 3);
      const z = Math.min(cw / img.w, chh / img.h);
      const x = M + (i % cols) * (cw + 6) + (cw - img.w * z) / 2;
      const y = 27 + Math.floor(i / cols) * (chh + 6);
      doc.addImage(img.data, 'PNG', x, y, img.w * z, img.h * z, undefined, 'FAST');
    }
  };
  await put(drawings.slice(0, 4), 2, 'Prospetti', 'Quattro facciate con il tetto; quote dei piani a sinistra, +0,00 = piano terra');
  await put(drawings.slice(4), 1, 'Sezioni', st ? 'Tagli per la scala del soppalco: altezze libere in cm, in rosso se fuori norma' : 'Sezione longitudinale e trasversale con le altezze dei locali');
}

export const grossArea = (plan) => plan.stats?.grossArea ?? plan.rooms.reduce((a, r) => a + r.w * r.h, 0);

export function footer(doc, project, page, pages) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  doc.setDrawColor(LINE).setLineWidth(0.2).line(M, ph - 11, pw - M, ph - 11);
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(MUTED);
  doc.text(safe(`${project.name || 'Progetto Planify'} · Planify`), M, ph - 6.5);
  doc.text(`Pagina ${page} di ${pages}`, pw - M, ph - 6.5, { align: 'right' });
}

export function tagBadge(doc, x, y, model) {
  const st = DEVICE_STYLE[model] || { tag: '?', color: INK };
  const w = Math.max(7, st.tag.length * 2 + 3);
  doc.setFillColor(st.color).roundedRect(x, y - 3.2, w, 4.6, 2.3, 2.3, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(6.5).setTextColor('#ffffff');
  doc.text(st.tag, x + w / 2, y + 0.3, { align: 'center' });
  return w;
}

function cover(doc, project, devices, bom) {
  const pw = doc.internal.pageSize.getWidth();
  doc.setFillColor(ACCENT).rect(0, 0, pw, 6, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(ACCENT_INK);
  doc.text('PLANIFY · PROGETTO', M, 28);
  doc.setFontSize(26).setTextColor(INK);
  doc.text(doc.splitTextToSize(safe(project.name || 'Progetto planimetria'), pw - 2 * M), M, 42);
  doc.setFont('helvetica', 'normal').setFontSize(11).setTextColor(MUTED);
  const date = new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.text(safe(`${devices.length ? 'Planimetria e impianto di allarme Ajax' : 'Planimetria'} · ${date}`), M, 52);

  // dati dell'immobile
  let y = 70;
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(INK).text("Dati dell'immobile", M, y);
  y += 4;
  const floors = project.floors.filter((f) => f.plan);
  const total = floors.filter((f) => f.level !== 'out').reduce((a, f) => a + grossArea(f.plan), 0);
  const rows = floors.map((f) => [
    `${levelLabel(f.level)}  ${f.name}`,
    TYPE_NAME[f.meta?.type] || 'Planimetria',
    `${fmt(f.plan.dimensions.width)} × ${fmt(f.plan.dimensions.length)} m`,
    `${fmt(grossArea(f.plan))} m²`,
    `${f.plan.rooms.length} locali`,
    `${devices.filter((d) => d.floor === f.id).length || '-'}`,
  ]);
  y = table(doc, y, ['Piano', 'Tipologia', 'Ingombro', 'Superficie', 'Locali', 'Dispositivi'], rows, [0.3, 0.17, 0.17, 0.13, 0.11, 0.12]);
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(INK);
  doc.text(safe(`Superficie coperta totale: ${fmt(total)} m² su ${floors.filter((f) => f.level !== 'out').length} piani`), M, y + 6);
  y += 18;

  // riepilogo dispositivi
  doc.setFont('helvetica', 'bold').setFontSize(12).text('Riepilogo dispositivi', M, y);
  y += 7;
  if (!bom.length) {
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(MUTED);
    doc.text(doc.splitTextToSize(safe('Nessun dispositivo posizionato: usa «Disposizione ottimale allarme» per proporre l’impianto.'), pw - 2 * M), M, y);
    return;
  }
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(INK);
  doc.text(safe(`${devices.length} dispositivi Ajax Systems, ${bom.length} modelli diversi`), M, y);
  y += 8;
  const colW = (pw - 2 * M) / 2;
  bom.forEach((r, i) => {
    const x = M + (i % 2) * colW;
    const yy = y + Math.floor(i / 2) * 8;
    const bw = tagBadge(doc, x, yy, r.model.id);
    doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(INK).text(safe(r.model.name), x + bw + 3, yy);
    doc.setFont('helvetica', 'bold').text(`× ${r.qty}`, x + colW - 6, yy, { align: 'right' });
  });
}

/* Tabella semplice con intestazione, righe a capo e salto pagina. Restituisce la y finale. */
export function table(doc, y, head, rows, fr, { onNewPage } = {}) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const W = pw - 2 * M;
  const xs = fr.reduce((a, f, i) => [...a, a[i] + f * W], [M]);
  const drawHead = () => {
    doc.setFillColor('#f1f4f8').rect(M, y, W, 7, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(MUTED);
    head.forEach((h, i) => doc.text(safe(h), xs[i] + 2, y + 4.8));
    y += 7;
  };
  drawHead();
  doc.setFontSize(9);
  for (const row of rows) {
    const cells = row.map((c, i) => {
      const parts = Array.isArray(c) ? c : [c];
      return parts.map((p, j) => ({ lines: doc.splitTextToSize(safe(p), fr[i] * W - 4), sub: j > 0 }));
    });
    const h = Math.max(...cells.map((c) => c.reduce((a, p) => a + p.lines.length * 4, 0))) + 3.5;
    if (y + h > ph - 18) {
      onNewPage?.();
      y = 24;
      drawHead();
    }
    cells.forEach((parts, i) => {
      let ty = y + 4.6;
      for (const p of parts) {
        doc.setFont('helvetica', p.sub || i > 0 ? 'normal' : 'bold').setFontSize(p.sub ? 8 : 9).setTextColor(p.sub ? MUTED : INK);
        doc.text(p.lines, xs[i] + 2, ty);
        ty += p.lines.length * 4;
      }
    });
    y += h;
    doc.setDrawColor(LINE).setLineWidth(0.2).line(M, y, M + W, y);
  }
  return y;
}

async function floorPage(doc, floor, devices, extra) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const mine = devices.filter((d) => d.floor === floor.id);
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(INK);
  doc.text(safe(`${levelLabel(floor.level)}  ${floor.name}`), M, 16);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(MUTED);
  doc.text(safe(`${TYPE_NAME[floor.meta?.type] || 'Planimetria'} · ${fmt(grossArea(floor.plan))} m² · ${floor.plan.rooms.length} locali`), M, 22);

  const legendW = mine.length ? 62 : 0;
  const img = await floorImage(floor, mine, extra);
  const boxW = pw - 2 * M - (legendW ? legendW + 6 : 0);
  const boxH = ph - 28 - 16;
  const z = Math.min(boxW / img.w, boxH / img.h);
  doc.addImage(img.data, 'PNG', M, 27, img.w * z, img.h * z, undefined, 'FAST');

  if (!legendW) return;
  const x = pw - M - legendW;
  let y = 30;
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(INK).text('Legenda sensori', x, y);
  y += 7;
  const counts = new Map();
  for (const d of mine) counts.set(d.model, (counts.get(d.model) || 0) + 1);
  const order = Object.keys(DEVICE_STYLE);
  for (const [model, qty] of [...counts].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))) {
    const bw = tagBadge(doc, x, y, model);
    const name = doc.setFont('helvetica', 'normal').setFontSize(8.5).splitTextToSize(safe(AJAX_MODELS[model]?.name || model), legendW - bw - 12);
    doc.setTextColor(INK).text(name, x + bw + 2.5, y);
    doc.setFont('helvetica', 'bold').text(`×${qty}`, x + legendW, y, { align: 'right' });
    y += Math.max(1, name.length) * 3.8 + 3;
  }
}

/* Tavola elettrica del piano: pianta con i simboli e legenda con le quantità. */
async function electricPage(doc, floor, fl, level, extra) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(INK);
  doc.text(safe(`${levelLabel(floor.level)}  ${floor.name} · impianto elettrico`), M, 16);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(MUTED);
  doc.text(safe(`${LEVELS[level].label} CEI 64-8 · ${fl.points.length} punti · ${fl.circuits.filter((c) => c.key !== 'S').length} circuiti di potenza`), M, 22);

  const legendW = 70;
  const img = await floorImage(floor, [], { ...extra, electric: fl, electricLinks: extra.electricLinks });
  const boxW = pw - 2 * M - legendW - 6;
  const boxH = ph - 28 - 16;
  const z = Math.min(boxW / img.w, boxH / img.h);
  doc.addImage(img.data, 'PNG', M, 27, img.w * z, img.h * z, undefined, 'FAST');

  const x = pw - M - legendW;
  let y = 30;
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(INK).text('Legenda', x, y);
  y += 6;
  const counts = new Map();
  for (const p of fl.points) {
    const key = p.kind === 'dedicated' ? `dedicated:${p.tag}` : p.kind;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const rows = [...counts].sort((a, b) => KIND_ORDER.indexOf(a[0].split(':')[0]) - KIND_ORDER.indexOf(b[0].split(':')[0]));
  for (const [key, qty] of rows) {
    const [kind, tag] = key.split(':');
    const st = KINDS[kind];
    doc.setFillColor(st.color).circle(x + 1.6, y - 1.1, 1.4, 'F');
    const sigla = tag || st.tag;
    const label = `${sigla ? `${sigla} ` : ''}${st.label}${tag ? ` (${APPLIANCES[tag] || tag})` : ''}`;
    const lines = doc.setFont('helvetica', 'normal').setFontSize(7.8).splitTextToSize(safe(label), legendW - 14);
    doc.setTextColor(INK).text(lines, x + 4.5, y);
    doc.setFont('helvetica', 'bold').text(`×${qty}`, x + legendW, y, { align: 'right' });
    y += lines.length * 3.4 + 1.6;
    if (y > ph - 40) break;
  }
  if (fl.notes.length) {
    y += 3;
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(MUTED);
    for (const n of fl.notes.slice(0, 4)) {
      const lines = doc.splitTextToSize(safe(n), legendW);
      doc.text(lines, x, y);
      y += lines.length * 3.2 + 1.5;
    }
  }
}

/* Quadri e circuiti di ogni piano, poi la distinta dei componenti elettrici. */
function electricSummary(doc, project, data) {
  doc.addPage('a4', 'portrait');
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(INK).text('Impianto elettrico: quadri e circuiti', M, 18);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(MUTED);
  doc.text(safe(`${LEVELS[data.level].label} CEI 64-8 · ${LEVELS[data.level].desc}`), M, 24);
  let y = 30;
  for (const f of project.floors) {
    const fl = data.floors[f.id];
    if (!fl || !fl.circuits.length) continue;
    doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(INK).text(safe(`${levelLabel(f.level)}  ${f.name}`), M, y + 4);
    y = table(doc, y + 7, ['Circuito', 'Protezione', 'Cavo', 'Punti'],
      fl.circuits.map((c) => [[c.key, c.name], c.prot, c.cable, String(c.points)]), [0.38, 0.36, 0.14, 0.12],
      { onNewPage: () => doc.addPage('a4', 'portrait') }) + 6;
  }
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(MUTED);
  const note = doc.splitTextToSize(safe('Generale magnetotermico in base alla potenza del contratto; differenziali 30 mA tipo A '
    + 'in almeno due gruppi (giorno / notte). Schema indicativo: il progetto esecutivo e la dichiarazione di conformità '
    + 'spettano a un tecnico abilitato (DM 37/08).'), doc.internal.pageSize.getWidth() - 2 * M);
  doc.text(note, M, y);
  y += note.length * 4 + 6;
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(INK).text('Distinta componenti elettrici', M, y);
  table(doc, y + 4, ['Componente', 'Q.tà'], data.bom.map((b) => [b.label, String(b.qty)]), [0.85, 0.15],
    { onNewPage: () => doc.addPage('a4', 'portrait') });
}

/* Tavola idraulica del piano: pianta con tubazioni e simboli, legenda, apparecchi e note. */
async function plumbingPage(doc, floor, fl, data, extra) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(INK);
  doc.text(safe(`${levelLabel(floor.level)}  ${floor.name} · impianto idraulico`), M, 16);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(MUTED);
  const supply = fl.supply ? ` · dorsale ${fmtM(fl.supply.q)} l/s, multistrato ${fl.supply.pipe}` : '';
  doc.text(safe(`${fl.fixtures.length} apparecchi${supply} · acqua calda: ${GENERATORS[data.generator].label}`), M, 22);

  const legendW = 70;
  const img = await floorImage(floor, [], { ...extra, plumbing: fl, generator: data.generator });
  const boxW = pw - 2 * M - legendW - 6;
  const boxH = ph - 28 - 16;
  const z = Math.min(boxW / img.w, boxH / img.h);
  doc.addImage(img.data, 'PNG', M, 27, img.w * z, img.h * z, undefined, 'FAST');

  const x = pw - M - legendW;
  let y = 30;
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(INK).text('Legenda', x, y);
  y += 6;
  const counts = new Map();
  for (const p of fl.points) counts.set(p.kind, (counts.get(p.kind) || 0) + 1);
  for (const [kind, qty] of [...counts].sort((a, b) => PKIND_ORDER.indexOf(a[0]) - PKIND_ORDER.indexOf(b[0]))) {
    doc.setFillColor(PKINDS[kind].color).circle(x + 1.6, y - 1.1, 1.4, 'F');
    const label = kind === 'generator' ? GENERATORS[data.generator].label : PKINDS[kind].label;
    const lines = doc.setFont('helvetica', 'normal').setFontSize(7.8).splitTextToSize(safe(label), legendW - 14);
    doc.setTextColor(INK).text(lines, x + 4.5, y);
    doc.setFont('helvetica', 'bold').text(`×${qty}`, x + legendW, y, { align: 'right' });
    y += lines.length * 3.4 + 1.6;
  }
  for (const k of [...new Set(fl.lines.map((l) => l.kind))]) {
    doc.setDrawColor(PIPES[k].stroke).setLineWidth(0.6).line(x, y - 1.2, x + 3.4, y - 1.2);
    doc.setFont('helvetica', 'normal').setFontSize(7.8).setTextColor(INK).text(safe(PIPES[k].label), x + 4.5, y);
    y += 5;
  }
  y += 2;
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(MUTED);
  for (const n of fl.notes.slice(0, 5)) {
    const lines = doc.splitTextToSize(safe(n), legendW);
    if (y + lines.length * 3.2 > ph - 16) break;
    doc.text(lines, x, y);
    y += lines.length * 3.2 + 1.5;
  }
}

/* Colonne di scarico, collettori e distinta dell'impianto idraulico. */
function plumbingSummary(doc, project, data) {
  doc.addPage('a4', 'portrait');
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(INK).text('Impianto idraulico: colonne e distinta', M, 18);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(MUTED);
  doc.text(safe(`Acqua calda: ${GENERATORS[data.generator].label} · scarichi: Qww = 0,5 x radice di (somma DU), UNI EN 12056-2`), M, 24);
  let y = table(doc, 30, ['Colonna', 'Locali serviti', 'Somma DU', 'Portata', 'Diametro'],
    data.stacks.map((s) => [[s.id, `${s.floors} piani · ${fmtM(s.length)} m`], s.rooms.join(', '), fmtM(s.du), `${fmtM(s.q)} l/s`, `Ø${s.d}`]),
    [0.16, 0.44, 0.12, 0.14, 0.14], { onNewPage: () => doc.addPage('a4', 'portrait') }) + 6;
  const floorsRows = project.floors.filter((f) => data.floors[f.id]?.supply).map((f) => {
    const fl = data.floors[f.id];
    return [`${levelLabel(f.level)}  ${f.name}`, String(fl.fixtures.length),
      String(fl.points.find((p) => p.kind === 'manifold')?.outputs || '-'), `${fmtM(fl.supply.q)} l/s`, fl.supply.pipe];
  });
  if (floorsRows.length) {
    y = table(doc, y, ['Piano', 'Apparecchi', 'Uscite collettore', 'Portata dorsale', 'Multistrato'], floorsRows,
      [0.34, 0.14, 0.18, 0.17, 0.17], { onNewPage: () => doc.addPage('a4', 'portrait') }) + 6;
  }
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(MUTED);
  const note = doc.splitTextToSize(safe('Colonne con ventilazione primaria prolungata oltre la copertura; scarichi orizzontali '
    + 'con pendenza 1-2%; pozzetto di ispezione prima dell\'allaccio in fognatura. Schema indicativo: il progetto esecutivo e '
    + 'la dichiarazione di conformità spettano a un tecnico abilitato (DM 37/08).'), doc.internal.pageSize.getWidth() - 2 * M);
  doc.text(note, M, y);
  y += note.length * 4 + 6;
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(INK).text('Distinta componenti idraulici', M, y);
  table(doc, y + 4, ['Componente', 'Q.tà'], data.bom.map((b) => [b.label, `${fmtM(b.qty)} ${b.unit}`]), [0.82, 0.18],
    { onNewPage: () => doc.addPage('a4', 'portrait') });
}

/* Il logo come data-URL con le sue misure (null se non si carica: il cartiglio usa il solo nome). */
async function loadLogo(src) {
  if (!src) return null;
  try {
    const data = src.startsWith('data:') ? src : await fetch(src).then((r) => (r.ok ? r.blob() : Promise.reject(new Error('logo')))).then((blob) => new Promise((ok, ko) => {
      const fr = new FileReader();
      fr.onload = () => ok(fr.result);
      fr.onerror = ko;
      fr.readAsDataURL(blob);
    }));
    const img = await new Promise((ok, ko) => {
      const im = new Image();
      im.onload = () => ok(im);
      im.onerror = ko;
      im.src = data;
    });
    return { data, w: img.naturalWidth, h: img.naturalHeight };
  } catch {
    return null;
  }
}

/*
 * Tavola tecnica A4 orizzontale: pianta quotata a scala vera (1:100, o più piccola se non entra), legenda dei locali,
 * serramenti del piano, nord, scala grafica e cartiglio con il marchio (logo sostituibile, vedi lib/branding.js).
 */
async function technicalPage(doc, floor, codes, extra, ctx) {
  const { project, branding, logo, schedule, sheet, sheets } = ctx;
  const plan = floor.plan;
  const area = drawingArea();
  doc.setDrawColor(INK).setLineWidth(0.5).rect(A4.margin, A4.margin, A4.w - 2 * A4.margin, A4.h - 2 * A4.margin);
  const img = await floorImage(floor, [], { ...extra, codes, bare: true, layers: { ...LAYERS, technical: true, alarm: false } }, 4);
  const fit = fitScale(img.w, img.h, plan.scale, area);
  doc.addImage(img.data, 'PNG', area.x + (area.w - fit.w) / 2, area.y + (area.h - fit.h) / 2, fit.w, fit.h, undefined, 'FAST');

  // colonna di destra
  const x0 = A4.w - A4.margin - LEGEND_W;
  const x1 = A4.w - A4.margin;
  doc.setDrawColor(INK).setLineWidth(0.3).line(x0, A4.margin, x0, A4.h - A4.margin);
  const cx = x0 + 11;
  const north = ((extra.north ?? 0) * Math.PI) / 180;
  doc.setDrawColor(INK).setLineWidth(0.3).circle(cx, 25, 6.5);
  const tip = [cx + Math.sin(north) * 5, 25 - Math.cos(north) * 5];
  doc.setFillColor(INK).triangle(tip[0], tip[1], cx - Math.cos(north) * 2 - Math.sin(north) * 3.5, 25 - Math.sin(north) * 2 + Math.cos(north) * 3.5,
    cx + Math.cos(north) * 2 - Math.sin(north) * 3.5, 25 + Math.sin(north) * 2 + Math.cos(north) * 3.5, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(INK).text('N', cx, 14.8, { align: 'center' });
  // scala grafica: 0-1-2-5 m alla scala di stampa
  const mm = 1000 / fit.n;
  const bx = x0 + 17;
  doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(INK);
  [[0, 1], [1, 2], [2, 5]].forEach(([m0, m1], i) => {
    doc.setFillColor(i % 2 ? '#ffffff' : INK).setDrawColor(INK).setLineWidth(0.2).rect(bx + m0 * mm, 22, (m1 - m0) * mm, 2, 'FD');
  });
  [0, 1, 2, 5].forEach((m) => doc.text(m === 5 ? '5 m' : String(m), bx + m * mm, 28, { align: 'center' }));
  doc.setFontSize(7).setTextColor(MUTED).text(safe(`Scala 1:${fit.n}${fit.fits ? '' : ' (non unificata)'}`), bx, 16);

  // legenda locali
  let y = 38;
  const { rooms, total } = roomLegend(plan);
  doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(INK).text('LOCALI', x0 + 4, y);
  doc.setDrawColor(INK).setLineWidth(0.2).line(x0 + 4, y + 1.5, x1 - 4, y + 1.5);
  y += 6;
  const limit = A4.h - A4.margin - CARTOUCHE_H - 40;
  doc.setFont('helvetica', 'normal').setFontSize(7.5);
  for (const r of rooms) {
    if (y > limit) { doc.setTextColor(MUTED).text('...', x0 + 4, y); y += 4; break; }
    doc.setTextColor(INK).text(safe(r.name), x0 + 4, y);
    doc.text(`${fmt(r.area)} m²`.replace('²', '2'), x1 - 4, y, { align: 'right' });
    y += 4;
  }
  doc.setFont('helvetica', 'bold').text('Totale', x0 + 4, y + 1);
  doc.text(`${fmt(total)} m2`, x1 - 4, y + 1, { align: 'right' });
  y += 8;

  // serramenti di questo piano
  const used = new Set([...(codes?.doors || []), ...(codes?.windows || [])].filter(Boolean));
  const rows = schedule.rows.filter((r) => used.has(r.code));
  if (rows.length && y < limit + 12) {
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(INK).text('SERRAMENTI', x0 + 4, y);
    doc.setDrawColor(INK).line(x0 + 4, y + 1.5, x1 - 4, y + 1.5);
    y += 6;
    doc.setFont('helvetica', 'normal').setFontSize(7.5);
    for (const r of rows) {
      if (y > limit + 22) break;
      doc.setTextColor(INK).text(safe(r.code), x0 + 4, y);
      doc.setTextColor(INK).text(safe(r.type), x0 + 13, y);
      doc.text(`${Math.round(r.w * 100)} x ${Math.round(r.h * 100)} cm`, x1 - 4, y, { align: 'right' });
      y += 4;
    }
  }

  // cartiglio
  const cy = A4.h - A4.margin - CARTOUCHE_H;
  doc.setDrawColor(INK).setLineWidth(0.5).line(x0, cy, x1, cy);
  doc.setLineWidth(0.2);
  if (logo) {
    const maxH = 11;
    const w = Math.min(34, (maxH * logo.w) / logo.h);
    doc.addImage(logo.data, undefined, x0 + 4, cy + 3, w, (w * logo.h) / logo.w, undefined, 'FAST');
  }
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(INK).text(safe(branding.name), x1 - 4, cy + 9, { align: 'right' });
  doc.line(x0, cy + 16, x1, cy + 16);
  const field = (label, value, yy, bold = false) => {
    doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(MUTED).text(label, x0 + 4, yy);
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(8).setTextColor(INK).text(safe(value) || '', x0 + 24, yy);
  };
  field('PROGETTO', project.name || 'Progetto', cy + 21, true);
  field('TAVOLA', `${levelLabel(floor.level)} ${floor.name} - pianta quotata`, cy + 26);
  field('COMMITTENTE', branding.client, cy + 31);
  field('PROGETTISTA', branding.designer, cy + 36);
  field('N. PRATICA', branding.ref, cy + 41);
  doc.line(x0, cy + 43.5, x1, cy + 43.5);
  doc.line(x0 + 25, cy + 43.5, x0 + 25, A4.h - A4.margin);
  doc.line(x0 + 50, cy + 43.5, x0 + 50, A4.h - A4.margin);
  const cell = (label, value, xx) => {
    doc.setFont('helvetica', 'normal').setFontSize(6).setTextColor(MUTED).text(label, xx + 2, cy + 46.5);
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(INK).text(value, xx + 2, cy + 50.5);
  };
  cell('SCALA', `1:${fit.n}`, x0);
  cell('FORMATO', 'A4', x0 + 25);
  cell('TAV.', `${sheet} / ${sheets}`, x0 + 50);
}

/* Abaco dei serramenti di tutto il progetto. */
function schedulePage(doc, data) {
  doc.addPage('a4', 'portrait');
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(INK).text('Abaco dei serramenti', M, 18);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(MUTED);
  doc.text(safe('Misure della luce netta del vano; altezze tipiche (porte 2,10 m, finestre 1,40 m con davanzale a 0,90 m)'), M, 24);
  table(doc, 30, ['Codice', 'Tipo', 'L x H (m)', 'Q.tà', 'Apertura', 'Locali'],
    data.rows.map((r) => [[r.code], r.type, `${fmtM(r.w)} x ${fmtM(r.h)}`, String(r.qty), r.open || '-', r.places.join(', ')]),
    [0.08, 0.2, 0.12, 0.06, 0.14, 0.4], { onNewPage: () => doc.addPage('a4', 'portrait') });
}

/* Preventivo indicativo: voci per categoria, imprevisti, IVA e totale. */
function estimatePage(doc, data) {
  doc.addPage('a4', 'portrait');
  const eur = (v) => `${Math.round(v).toLocaleString('it-IT')} EUR`;
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(INK).text('Preventivo indicativo', M, 18);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(MUTED);
  doc.text(safe(`Totale ${eur(data.total)} IVA compresa · ${eur(data.perSqm)}/m² su ${fmt(data.area)} m²`), M, 24);
  const rows = data.byCat.flatMap((c) => [
    [[c.cat], '', '', eur(c.total)],
    ...c.rows.map((r) => [r.label, `${fmtM(r.qty)} ${r.unit}`, eur(r.price), eur(r.total)]),
  ]);
  let y = table(doc, 30, ['Voce', 'Quantità', 'Prezzo unitario', 'Totale'], rows, [0.55, 0.15, 0.15, 0.15],
    { onNewPage: () => doc.addPage('a4', 'portrait') }) + 4;
  y = table(doc, y, ['Riepilogo', '', '', 'Importo'], [
    ['Lavori', '', '', eur(data.subtotal)],
    [`Imprevisti ${data.contingency}%`, '', '', eur(data.extra)],
    [`IVA ${data.vat}%`, '', '', eur(data.tax)],
    [['Totale'], '', '', eur(data.total)],
  ], [0.55, 0.15, 0.15, 0.15], { onNewPage: () => doc.addPage('a4', 'portrait') }) + 6;
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(MUTED);
  doc.text(doc.splitTextToSize(safe('Prezzi medi indicativi (fornitura e posa, IVA esclusa) che variano per zona, finiture e impresa. '
    + 'Esclusi arredi, progettazione, pratiche edilizie e oneri. Ordine di grandezza, non offerta.'), doc.internal.pageSize.getWidth() - 2 * M), M, y);
}

export async function exportProjectPdf(project) {
  const devices = project.security?.devices || [];
  const bom = billOfMaterials(project, devices);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title: safe(project.name || 'Progetto Planify'), creator: 'Planify' });

  cover(doc, project, devices, bom);
  // la casa in 3D: tutti i piani impilati con i solai (se la scheda grafica non è disponibile si salta)
  try {
    const { houseImage } = await import('./render3d');
    const img = await houseImage(project);
    if (img) {
      doc.addPage('a4', 'landscape');
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      const built = project.floors.filter((f) => typeof f.level === 'number' && f.plan?.rooms?.length).length;
      doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(INK).text(safe(built > 1 ? 'La casa in 3D' : 'Vista 3D'), M, 16);
      doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(MUTED)
        .text(safe(built > 1 ? `${built} piani impilati alla loro quota, con i solai e il vano scala` : 'Pianta arredata in 3D'), M, 22);
      const z = Math.min((pw - 2 * M) / img.w, (ph - 28 - 16) / img.h);
      doc.addImage(img.data, 'PNG', (pw - img.w * z) / 2, 27, img.w * z, img.h * z, undefined, 'FAST');
    }
  } catch {
    /* WebGL non disponibile: il PDF esce senza la vista 3D */
  }
  // le inquadrature automatiche: pianta 3D, fronte e i due interni più significativi (soggiorno/soppalco e camera)
  try {
    const { houseImage } = await import('./render3d');
    const { cameraViews } = await import('./renderStudio');
    const all = cameraViews(project, { aspect: 16 / 9 });
    const living = all.find((v) => v.kind === 'inside' && /soppalco|soggiorno|salotto|open/i.test(v.label)) || all.find((v) => v.kind === 'inside');
    const bedroom = all.find((v) => v.kind === 'inside' && /camera|letto/i.test(v.label) && v !== living);
    const picks = [all.find((v) => v.id === 'plan3d'), all.find((v) => v.id === 'front'), living, bedroom].filter(Boolean);
    const shots = [];
    for (const v of picks) {
      const img = await houseImage(project, { width: 1280, height: 720, view: v });
      if (img) shots.push({ v, img });
    }
    if (shots.length) {
      doc.addPage('a4', 'landscape');
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(INK).text('Viste del progetto', M, 16);
      doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(MUTED).text(safe('Inquadrature automatiche: dall\'alto, fronte e dentro i locali a 1,6 m'), M, 22);
      const cw = (pw - 2 * M - 6) / 2;
      const chh = (ph - 28 - 16 - 14) / 2;
      const z = Math.min(cw / 1280, chh / 720);
      shots.forEach(({ v, img }, i) => {
        const x = M + (i % 2) * (cw + 6);
        const y = 27 + Math.floor(i / 2) * (chh + 12);
        doc.addImage(img.data, 'PNG', x, y, 1280 * z, 720 * z, undefined, 'FAST');
        doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(INK).text(safe(v.label), x, y + 720 * z + 4.5);
      });
    }
  } catch {
    /* WebGL non disponibile: il PDF esce senza le viste */
  }
  const { byFloor } = projectStairs(project);
  const house = houseFor(project);
  const electric = project.electric ? planElectric(project, { level: project.electric.level }) : null;
  const plumbing = project.plumbing ? planPlumbing(project, { generator: project.plumbing.generator }) : null;
  const schedule = scheduleFor(project);
  const branding = getBranding(project);
  const logo = await loadLogo(branding.logo);
  const sheetTotal = project.floors.filter((x) => x.plan && schedule.codes[x.id] && x.plan.rooms.some((r) => r.kind !== 'garden')).length;
  let sheetNo = 0;
  const techPages = new Set();
  for (const f of project.floors.filter((x) => x.plan)) {
    doc.addPage('a4', 'landscape');
    await floorPage(doc, f, devices, { stairs: byFloor[f.id], house });
    const fl = electric?.floors[f.id];
    if (fl?.points.length) {
      doc.addPage('a4', 'landscape');
      await electricPage(doc, f, fl, electric.level, { stairs: byFloor[f.id], house, electricLinks: project.electric.links !== false });
    }
    if (schedule.codes[f.id] && f.plan.rooms.some((r) => r.kind !== 'garden')) {
      doc.addPage('a4', 'landscape');
      await technicalPage(doc, f, schedule.codes[f.id], { stairs: byFloor[f.id], house }, { project, branding, logo, schedule, sheet: ++sheetNo, sheets: sheetTotal });
      techPages.add(doc.getNumberOfPages());   // la tavola ha il suo cartiglio: niente piè di pagina sopra
    }
    const pl = plumbing?.floors[f.id];
    if (pl?.points.length) {
      doc.addPage('a4', 'landscape');
      await plumbingPage(doc, f, pl, plumbing, { stairs: byFloor[f.id], house, plumbingLines: project.plumbing.lines !== false });
    }
  }
  try {
    await elevationPages(doc, project, project.north || 0);
  } catch {
    /* un disegno non riuscito non deve bloccare il PDF */
  }
  if (electric?.bom.length) electricSummary(doc, project, electric);
  if (plumbing?.bom.length) plumbingSummary(doc, project, plumbing);
  if (schedule.rows.length) schedulePage(doc, schedule);
  if (project.estimate) estimatePage(doc, buildEstimate(project, project.estimate));

  if (bom.length) {
    doc.addPage('a4', 'portrait');
    doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(INK).text('Distinta materiali (BOM)', M, 18);
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(MUTED);
    doc.text(safe(`${devices.length} dispositivi Ajax Systems · quantità totali per modello`), M, 24);
    const rows = bom.map((r) => [[r.model.name, r.model.category], r.model.type, String(r.qty), r.places.join(', '), r.purposes.join('; ')]);
    table(doc, 30, ['Modello Ajax', 'Tipo sensore', 'Q.tà', 'Stanza / piano', 'Scopo di installazione'], rows,
      [0.22, 0.17, 0.07, 0.27, 0.27], { onNewPage: () => doc.addPage('a4', 'portrait') });
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    if (!techPages.has(i)) footer(doc, project, i, pages);
  }

  const name = (project.name || 'progetto-planify').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  doc.save(`${name || 'progetto-planify'}.pdf`);
}
