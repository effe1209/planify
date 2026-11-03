/*
 * Libreria di materiali e finiture reali (pavimenti, rivestimenti, pitture, tessuti): si carica da un file CSV, si assegnano ai
 * locali (pavimento e pareti) e da lì escono il preventivo di acquisto e le schede tecniche nel PDF.
 *
 * Voce = { id, brand, code, name, category, color, unit, price, format, thickness, finish, texture, url, note }
 *   category: pavimento | rivestimento | pittura | tessuto | altro      unit: m2 | ml | pz      price: € per unità, IVA esclusa
 *   texture (solo pavimenti e rivestimenti, per il 3D): plank | herringbone | tile | marble | concrete | travertine | none
 * La voce scelta per un locale si copia dentro il locale (room.finish.floor / room.finish.wall): la pianta resta autosufficiente
 * (link condivisi, cloud) anche se la libreria cambia.
 */
import { roomWallArea } from './estimate';

export const CATEGORIES = [['pavimento', 'Pavimenti'], ['rivestimento', 'Rivestimenti'], ['pittura', 'Pitture e pareti'], ['tessuto', 'Tessuti'], ['altro', 'Altro']];
export const TEXTURES = ['plank', 'herringbone', 'tile', 'marble', 'concrete', 'travertine', 'none'];
export const LIBRARY_KEY = 'planify.library';
export const WASTE = { pavimento: 10, rivestimento: 10 };   // sfrido (%) aggiunto alle quantità da acquistare

/* colonne del file, in ordine, con i nomi accettati in testa (minuscoli, senza accenti né spazi) */
export const COLUMNS = [
  ['brand', ['marchio', 'brand', 'produttore', 'fornitore']],
  ['code', ['codice', 'code', 'sku', 'articolo']],
  ['name', ['nome', 'name', 'descrizione', 'prodotto']],
  ['category', ['categoria', 'category', 'tipo']],
  ['color', ['colore', 'color', 'colour', 'hex']],
  ['unit', ['unita', 'unit', 'um', 'u.m.']],
  ['price', ['prezzo', 'price', 'prezzo_unitario', 'costo']],
  ['format', ['formato', 'format', 'misura', 'dimensioni']],
  ['thickness', ['spessore_mm', 'spessore', 'thickness']],
  ['finish', ['finitura', 'finish', 'superficie']],
  ['texture', ['texture', 'trama', 'disegno']],
  ['url', ['url', 'link', 'scheda', 'sito']],
  ['note', ['note', 'notes', 'annotazioni']],
];

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s-]+/g, '_').trim();

const CATEGORY_ALIASES = {
  pavimento: ['pavimento', 'pavimenti', 'floor', 'floors', 'parquet', 'gres_pavimento'],
  rivestimento: ['rivestimento', 'rivestimenti', 'tile', 'tiles', 'piastrella', 'piastrelle', 'gres', 'wall_tile'],
  pittura: ['pittura', 'pitture', 'paint', 'parete', 'pareti', 'vernice', 'intonaco', 'wall'],
  tessuto: ['tessuto', 'tessuti', 'fabric', 'fabrics', 'tappezzeria'],
  altro: ['altro', 'other', ''],
};
export function normCategory(v) {
  const k = norm(v);
  return Object.entries(CATEGORY_ALIASES).find(([, list]) => list.includes(k))?.[0] ?? 'altro';
}

/* "62,50", "1.250,00", "€ 62.5" → numero; NaN se non è un prezzo */
export function parsePrice(v) {
  let s = String(v ?? '').replace(/[€\s]|eur/gi, '');
  if (!s) return NaN;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

const normUnit = (v) => {
  const k = norm(v).replace(/[^a-z0-9]/g, '');
  if (['m2', 'mq', 'mq2', 'sqm'].includes(k)) return 'm2';
  if (['ml', 'm', 'metro', 'metri', 'mlineare'].includes(k)) return 'ml';
  if (['pz', 'pezzo', 'pezzi', 'nr', 'n', 'pcs', 'cad'].includes(k)) return 'pz';
  return '';
};

export const normColor = (v) => {
  const s = String(v ?? '').trim();
  const m = s.match(/^#?([0-9a-f]{6})$/i) || s.match(/^#?([0-9a-f]{3})$/i);
  if (!m) return '';
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return `#${h.toLowerCase()}`;
};

/* righe e celle di un CSV: separatore , ; o tabulazione (rilevato dalla prima riga), virgolette con "" come apice */
function rows(text) {
  const src = String(text ?? '').replace(/^﻿/, '');
  const first = src.split(/\r?\n/, 1)[0] || '';
  const sep = [';', '\t', ','].map((c) => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const out = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim())) out.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) out.push(row);
  return out;
}

const idOf = (it) => `${norm(it.brand)}_${norm(it.code || it.name)}`.replace(/_+/g, '_').replace(/^_|_$/g, '');

/* CSV → { items, errors: [{ line, why }] }; le righe sbagliate si saltano e si segnalano, le altre entrano */
export function parseLibraryCsv(text) {
  const all = rows(text);
  if (!all.length) return { items: [], errors: [{ line: 1, why: 'Il file è vuoto.' }] };
  const head = all[0].map(norm);
  const col = {};
  for (const [key, names] of COLUMNS) {
    const i = head.findIndex((h) => names.map(norm).includes(h));
    if (i >= 0) col[key] = i;
  }
  const missing = ['name', 'price'].filter((k) => col[k] == null);
  if (missing.length) {
    return { items: [], errors: [{ line: 1, why: `Mancano le colonne obbligatorie: ${missing.map((k) => COLUMNS.find((c) => c[0] === k)[1][0]).join(', ')}.` }] };
  }
  const items = [];
  const errors = [];
  const seen = new Set();
  all.slice(1).forEach((r, k) => {
    const line = k + 2;
    const get = (key) => (col[key] != null ? String(r[col[key]] ?? '').trim() : '');
    const name = get('name');
    const price = parsePrice(get('price'));
    if (!name) { errors.push({ line, why: 'Manca il nome.' }); return; }
    if (Number.isNaN(price)) { errors.push({ line, why: `Prezzo non valido: «${get('price')}».` }); return; }
    const category = normCategory(get('category'));
    const unit = normUnit(get('unit')) || (category === 'altro' ? 'pz' : 'm2');
    const colorRaw = get('color');
    const color = normColor(colorRaw);
    const thickness = Number(get('thickness').replace(',', '.'));
    const tex = norm(get('texture'));
    const it = {
      brand: get('brand'), code: get('code'), name, category, unit, price: Math.round(price * 100) / 100,
      ...(color && { color }), ...(get('format') && { format: get('format') }),
      ...(Number.isFinite(thickness) && thickness > 0 && { thickness }), ...(get('finish') && { finish: get('finish') }),
      ...(['pavimento', 'rivestimento'].includes(category) && { texture: TEXTURES.includes(tex) ? tex : 'none' }),
      ...(/^https?:\/\//i.test(get('url')) && { url: get('url') }), ...(get('note') && { note: get('note') }),
    };
    it.id = idOf(it);
    if (!it.id) { errors.push({ line, why: 'Né codice né nome utilizzabili.' }); return; }
    if (seen.has(it.id)) { errors.push({ line, why: `Voce doppia («${it.brand} ${it.code || it.name}»): tengo la prima.` }); return; }
    seen.add(it.id);
    if (colorRaw && !color) errors.push({ line, why: `Colore non valido («${colorRaw}»): la voce entra senza colore. Usa #rrggbb.` });
    items.push(it);
  });
  return { items, errors };
}

const cell = (v) => (/[;"\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
const HEAD = ['marchio', 'codice', 'nome', 'categoria', 'colore', 'unita', 'prezzo', 'formato', 'spessore_mm', 'finitura', 'texture', 'url', 'note'];

/* libreria → CSV (separatore «;», prezzo con la virgola) */
export function libraryToCsv(items) {
  return `${[HEAD.join(';'), ...items.map((it) => [it.brand, it.code, it.name, it.category, it.color, it.unit, String(it.price).replace('.', ','),
    it.format, it.thickness, it.finish, it.texture, it.url, it.note].map(cell).join(';'))].join('\n')}\n`;
}

/* file d'esempio da compilare (i marchi sono finti: li sostituisci con i tuoi) */
export function libraryTemplateCsv() {
  return libraryToCsv([
    { brand: 'Esempio Parquet', code: 'ROV-001', name: 'Rovere naturale spazzolato', category: 'pavimento', color: '#c9a77a', unit: 'm2', price: 62.5, format: '14 x 140 cm', thickness: 14, finish: 'Spazzolato oliato', texture: 'plank', note: 'Posa flottante o incollata' },
    { brand: 'Esempio Ceramiche', code: 'GRS-120', name: 'Gres effetto cemento', category: 'pavimento', color: '#9a9a96', unit: 'm2', price: 38, format: '60 x 120 cm', thickness: 9, finish: 'Opaco', texture: 'concrete' },
    { brand: 'Esempio Ceramiche', code: 'RIV-030', name: 'Rivestimento bianco lucido', category: 'rivestimento', color: '#f1f1ee', unit: 'm2', price: 29, format: '30 x 60 cm', thickness: 8, finish: 'Lucido', texture: 'tile' },
    { brand: 'Esempio Colori', code: 'PIT-204', name: 'Pittura lavabile salvia', category: 'pittura', color: '#a9b49a', unit: 'm2', price: 6.8, finish: 'Opaco', note: 'Resa 10 m²/l, due mani' },
    { brand: 'Esempio Tessuti', code: 'TES-512', name: 'Bouclé panna', category: 'tessuto', color: '#efe7d6', unit: 'ml', price: 54, format: 'Altezza 140 cm', finish: 'Bouclé' },
  ]);
}

/* ── libreria del progetto e del browser ── */
export function storedLibrary() {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(LIBRARY_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
export function storeLibrary(items) {
  try {
    globalThis.localStorage?.setItem(LIBRARY_KEY, JSON.stringify(items));
  } catch {
    /* spazio non disponibile: la libreria resta nel progetto */
  }
}
/* La libreria in uso: quella del progetto, altrimenti quella salvata nel browser. */
export const getLibrary = (project) => (Array.isArray(project?.library) ? project.library : storedLibrary());

/* voci adatte a un uso: il pavimento (pavimenti e rivestimenti) o le pareti (pitture e rivestimenti) */
export const forUse = (items, use) => items.filter((it) => (use === 'floor' ? ['pavimento', 'rivestimento'] : ['pittura', 'rivestimento']).includes(it.category));

/*
 * Preventivo di acquisto dei materiali scelti nei locali: una riga per materiale con le quantità nette (m² del pavimento o delle
 * pareti), lo sfrido, la quantità da ordinare e il totale; poi IVA. `uses` dice dove va ogni materiale.
 */
export function purchaseQuote(project, { vat = project.estimate?.vat ?? 22 } = {}) {
  const map = new Map();
  for (const f of project.floors || []) {
    const plan = f.plan;
    if (!plan?.rooms) continue;
    for (const r of plan.rooms) {
      for (const use of ['floor', 'wall']) {
        const it = r.finish?.[use];
        if (!it) continue;
        const area = use === 'floor' ? (r.area ?? r.w * r.h) : roomWallArea(plan, r);
        const qty = it.unit === 'pz' ? 1 : it.unit === 'ml' ? Math.sqrt(area) : area;   // a metro lineare: una stima, da rivedere
        const row = map.get(it.id) || { item: it, net: 0, uses: [] };
        row.net += qty;
        row.uses.push({ floor: f.name, room: r.name || r.kind, use, qty: Math.round(qty * 100) / 100 });
        map.set(it.id, row);
      }
    }
  }
  const rowsOut = [...map.values()].map(({ item, net, uses }) => {
    const waste = WASTE[item.category] || 0;
    const order = item.unit === 'pz' ? Math.ceil(net) : Math.ceil(net * (1 + waste / 100) * 10) / 10;
    return { ...item, net: Math.round(net * 100) / 100, waste, qty: order, total: Math.round(order * (item.price || 0) * 100) / 100, uses };
  }).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  const subtotal = Math.round(rowsOut.reduce((s, r) => s + r.total, 0) * 100) / 100;
  const tax = Math.round(((subtotal * vat) / 100) * 100) / 100;
  return { rows: rowsOut, subtotal, vat, tax, total: Math.round((subtotal + tax) * 100) / 100 };
}

/* il preventivo di acquisto come CSV (si apre in Excel) */
export function quoteToCsv(q) {
  const lines = [['marchio', 'codice', 'nome', 'categoria', 'unita', 'quantita_netta', 'sfrido_%', 'quantita_da_ordinare', 'prezzo', 'totale', 'dove'].join(';')];
  for (const r of q.rows) {
    lines.push([r.brand, r.code, r.name, r.category, r.unit, r.net, r.waste, r.qty, r.price, r.total,
      r.uses.map((u) => `${u.floor}: ${u.room} (${u.use === 'floor' ? 'pavimento' : 'pareti'})`).join(' | ')]
      .map((v) => cell(typeof v === 'number' ? String(v).replace('.', ',') : v)).join(';'));
  }
  lines.push(['', '', '', '', '', '', '', 'Imponibile', '', String(q.subtotal).replace('.', ','), ''].join(';'));
  lines.push(['', '', '', '', '', '', '', `IVA ${q.vat}%`, '', String(q.tax).replace('.', ','), ''].join(';'));
  lines.push(['', '', '', '', '', '', '', 'Totale', '', String(q.total).replace('.', ','), ''].join(';'));
  return `${lines.join('\n')}\n`;
}
