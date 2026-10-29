/*
 * «Esporta progetto PDF»: copertina con riepilogo, una pagina per piano (pianta ad alta
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
import { TYPE_NAME } from '../constants';
import { AJAX_MODELS, billOfMaterials, DEVICE_STYLE } from './ajax';
import { APPLIANCES, KIND_ORDER, KINDS, LEVELS, planElectric } from './electric';
import { GENERATORS, PIPES, PKIND_ORDER, PKINDS, planPlumbing } from './plumbing';
import { buildEstimate } from './estimate';
import { scheduleFor } from './schedule';
import { houseFor, levelLabel } from './project';
import { projectStairs } from './stairs';
import { serializeSvg } from './sheet';
import { fmt, fmtM } from './utils';

const INK = '#14181f';
const MUTED = '#6b7482';
const LINE = '#d5dae1';
const ACCENT = '#0071e3';
const M = 16;   // margine pagina, mm
const LAYERS = { furniture: true, labels: true, dims: true, grid: false, alarm: true };

/* I font standard del PDF coprono solo WinAnsi: niente apostrofi tipografici, ≥, frecce… */
const safe = (s) => String(s ?? '')
  .replace(/[‘’]/g, "'").replace(/[“”«»]/g, '"').replace(/[—–]/g, '-').replace(/≥/g, '>=').replace(/≤/g, '<=')
  .replace(/[^\n\x20-\x7e\xa0-\xff]/g, '');

/* Disegna PlanSvg fuori schermo e lo rasterizza in PNG. */
async function floorImage(floor, devices, extra, k = 3) {
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

const grossArea = (plan) => plan.stats?.grossArea ?? plan.rooms.reduce((a, r) => a + r.w * r.h, 0);

function footer(doc, project, page, pages) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  doc.setDrawColor(LINE).setLineWidth(0.2).line(M, ph - 11, pw - M, ph - 11);
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(MUTED);
  doc.text(safe(`${project.name || 'Progetto Planify'} · Planify`), M, ph - 6.5);
  doc.text(`Pagina ${page} di ${pages}`, pw - M, ph - 6.5, { align: 'right' });
}

function tagBadge(doc, x, y, model) {
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
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(ACCENT);
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
function table(doc, y, head, rows, fr, { onNewPage } = {}) {
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

/* Tavola quotata del piano: vista tecnica con le quote interne e i codici dei serramenti. */
async function technicalPage(doc, floor, codes, extra) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(INK);
  doc.text(safe(`${levelLabel(floor.level)}  ${floor.name} · pianta quotata`), M, 16);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(MUTED);
  doc.text(safe('Quote interne in metri (luce netta tra i muri) · codici dei serramenti come nell\'abaco'), M, 22);
  const img = await floorImage(floor, [], { ...extra, codes, layers: { ...LAYERS, technical: true, alarm: false } });
  const z = Math.min((pw - 2 * M) / img.w, (ph - 44) / img.h);
  doc.addImage(img.data, 'PNG', M, 27, img.w * z, img.h * z, undefined, 'FAST');
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
  const { byFloor } = projectStairs(project);
  const house = houseFor(project);
  const electric = project.electric ? planElectric(project, { level: project.electric.level }) : null;
  const plumbing = project.plumbing ? planPlumbing(project, { generator: project.plumbing.generator }) : null;
  const schedule = scheduleFor(project);
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
      await technicalPage(doc, f, schedule.codes[f.id], { stairs: byFloor[f.id], house });
    }
    const pl = plumbing?.floors[f.id];
    if (pl?.points.length) {
      doc.addPage('a4', 'landscape');
      await plumbingPage(doc, f, pl, plumbing, { stairs: byFloor[f.id], house, plumbingLines: project.plumbing.lines !== false });
    }
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
    footer(doc, project, i, pages);
  }

  const name = (project.name || 'progetto-planify').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  doc.save(`${name || 'progetto-planify'}.pdf`);
}
