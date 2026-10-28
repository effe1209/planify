/*
 * «Esporta progetto PDF»: copertina con riepilogo, una pagina per piano (pianta ad alta
 * risoluzione con i dispositivi e la loro legenda) e, in fondo, la distinta materiali Ajax.
 * Caricato solo al clic (import dinamico), così jsPDF non pesa sull'avvio dell'app.
 */
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { jsPDF } from 'jspdf';
import PlanSvg from '../components/PlanSvg';
import { TYPE_NAME } from '../constants';
import { AJAX_MODELS, billOfMaterials, DEVICE_STYLE } from './ajax';
import { levelLabel } from './project';
import { serializeSvg } from './sheet';
import { fmt } from './utils';

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
async function floorImage(floor, devices, k = 3) {
  const host = document.createElement('div');
  const root = createRoot(host);
  flushSync(() => root.render(createElement(PlanSvg, {
    plan: floor.plan, layers: LAYERS, style: floor.meta?.style, devices,
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

async function floorPage(doc, floor, devices) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const mine = devices.filter((d) => d.floor === floor.id);
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(INK);
  doc.text(safe(`${levelLabel(floor.level)}  ${floor.name}`), M, 16);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(MUTED);
  doc.text(safe(`${TYPE_NAME[floor.meta?.type] || 'Planimetria'} · ${fmt(grossArea(floor.plan))} m² · ${floor.plan.rooms.length} locali`), M, 22);

  const legendW = mine.length ? 62 : 0;
  const img = await floorImage(floor, mine);
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

export async function exportProjectPdf(project) {
  const devices = project.security?.devices || [];
  const bom = billOfMaterials(project, devices);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title: safe(project.name || 'Progetto Planify'), creator: 'Planify' });

  cover(doc, project, devices, bom);
  for (const f of project.floors.filter((x) => x.plan)) {
    doc.addPage('a4', 'landscape');
    await floorPage(doc, f, devices);
  }

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
