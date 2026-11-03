/*
 * Esportazione IFC (BIM) di base, schema IFC2X3 (lo leggono Revit, ArchiCAD, BIMcollab, Solibri, FreeCAD…), in metri.
 * Contiene: progetto, sito, edificio, un piano (IfcBuildingStorey) per ogni piano del progetto alla sua quota, e per ogni piano
 *   • muri (IfcWall, un prisma per muro; i muri curvi e obliqui a tratti, come in 3D),
 *   • solai (IfcSlab, uno per locale, sotto il pavimento),
 *   • locali (IfcSpace con nome, uso e superficie in una IfcElementQuantity),
 *   • porte e finestre (IfcDoor / IfcWindow dentro un vano IfcOpeningElement che buca il muro).
 * Non ci sono arredi, scale, tetto e impianti. Le coordinate sono quelle della pianta con la y ribaltata (verso l'alto come nel DXF),
 * le quote partono da 0 al piano terra e salgono di FLOOR_H a piano. Tutto deterministico (stessi identificativi a ogni esportazione).
 */
import { FLOOR_H, WALL_H } from './scene3d.js';
import { ROOM_KIND_NAME } from '../constants.js';
import { WINDOW_TOP, glassSpan, isPanoramic } from './openings.js';

const SLAB_T = 0.3;
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

/* numero reale STEP: sempre col punto */
const num = (v) => {
  let s = String(Math.round(v * 1e5) / 1e5);
  if (s === '-0') s = '0';
  return /[.eE]/.test(s) ? s : `${s}.`;
};

/* testo STEP: apice raddoppiato, fuori dall'ASCII come \X2\XXXX\X0\ */
const str = (v) => `'${String(v ?? '').replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/[^\x20-\x7e]/g, (c) => `\\X2\\${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}\\X0\\`)}'`;

/* GlobalId IFC (22 caratteri) ricavato da un testo: 128 bit da quattro hash a 32 bit, in base 64 IFC */
export function ifcGuid(seed) {
  let n = 0n;
  for (let r = 0; r < 4; r++) {
    let h = 0x811c9dc5 ^ (r * 0x9e3779b1);
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
      h ^= h >>> 13;
    }
    n = (n << 32n) | BigInt(h >>> 0);
  }
  let out = '';
  for (let i = 21; i >= 0; i--) out += CHARS[Number((n >> BigInt(6 * i)) & 63n)];
  return out;
}

/* muri di una pianta come prismi: { cx, cy, len, thick, ang (rad), id } */
function wallSolids(plan) {
  const out = [];
  for (const [i, w] of plan.walls.entries()) {
    if (w.w <= 0.001 || w.h <= 0.001) continue;
    const horiz = w.w >= w.h;
    out.push({ id: `w${i}`, cx: w.x + w.w / 2, cy: w.y + w.h / 2, len: horiz ? w.w : w.h, thick: horiz ? w.h : w.w, ang: horiz ? 0 : Math.PI / 2 });
  }
  const t = plan.wallThickness / plan.scale;
  for (const [j, l] of (plan.wallLines || []).entries()) {
    const pts = l.closed ? [...l.pts, l.pts[0]] : l.pts;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len < 0.01) continue;
      // un po' più lungo, come in 3D: sulle curve i tratti si sovrappongono senza fessure
      out.push({ id: `l${j}-${i}`, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, len: len + Math.min(0.06, t * 0.35), thick: t, ang: Math.atan2(y1 - y0, x1 - x0) });
    }
  }
  return out;
}

/* il muro che contiene il centro di un'apertura (nel suo sistema di riferimento), o null */
function wallAt(walls, x, y) {
  let best = null;
  for (const w of walls) {
    const dx = x - w.cx;
    const dy = y - w.cy;
    const u = dx * Math.cos(w.ang) + dy * Math.sin(w.ang);
    const v = -dx * Math.sin(w.ang) + dy * Math.cos(w.ang);
    if (Math.abs(u) <= w.len / 2 + 0.05 && Math.abs(v) <= w.thick / 2 + 0.05) {
      const score = Math.abs(v);
      if (!best || score < best.score) best = { w, score };
    }
  }
  return best?.w ?? null;
}

const roomPoly = (r) => r.poly || [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];

export function buildIfc(project, { author = '', now = Date.now() } = {}) {
  const lines = [];
  let n = 0;
  const add = (text) => { n += 1; lines.push(`#${n}=${text};`); return `#${n}`; };
  const list = (refs) => `(${refs.join(',')})`;

  // ── gerarchia: autore, unità, contesto ──
  const person = add(`IFCPERSON($,${str(author || 'Planify')},$,$,$,$,$,$)`);
  const org = add(`IFCORGANIZATION($,${str('Planify')},$,$,$)`);
  const pao = add(`IFCPERSONANDORGANIZATION(${person},${org},$)`);
  const app = add(`IFCAPPLICATION(${org},${str('1.0')},${str('Planify')},${str('Planify')})`);
  const oh = add(`IFCOWNERHISTORY(${pao},${app},$,.ADDED.,$,$,$,${Math.floor(now / 1000)})`);
  const units = add(`IFCUNITASSIGNMENT(${list([
    add('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)'), add('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)'),
    add('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)'), add('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)'),
  ])})`);
  const origin = add('IFCCARTESIANPOINT((0.,0.,0.))');
  const dirZ = add('IFCDIRECTION((0.,0.,1.))');
  const world = add(`IFCAXIS2PLACEMENT3D(${origin},$,$)`);
  const ctx = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,${str('Model')},3,1.E-05,${world},$)`);
  const guid = (key) => str(ifcGuid(`${project.id || project.name || 'planify'}/${key}`));
  const project3 = add(`IFCPROJECT(${guid('project')},${oh},${str(project.name || 'Progetto Planify')},$,$,$,$,${list([ctx])},${units})`);
  const place = (rel, x = 0, y = 0, z = 0) => {
    const p = add(`IFCCARTESIANPOINT((${num(x)},${num(y)},${num(z)}))`);
    return add(`IFCLOCALPLACEMENT(${rel ?? '$'},${add(`IFCAXIS2PLACEMENT3D(${p},$,$)`)})`);
  };
  const sitePlace = place(null);
  const site = add(`IFCSITE(${guid('site')},${oh},${str('Sito')},$,$,${sitePlace},$,$,.ELEMENT.,$,$,$,$,$)`);
  const buildingPlace = place(sitePlace);
  const building = add(`IFCBUILDING(${guid('building')},${oh},${str(project.name || 'Edificio')},$,$,${buildingPlace},$,$,.ELEMENT.,$,$,$)`);
  const rel = (key, parent, children) => add(`IFCRELAGGREGATES(${guid(key)},${oh},$,$,${parent},${list(children)})`);
  rel('project-site', project3, [site]);
  rel('site-building', site, [building]);

  // ── geometrie ──
  const profileRect = (cx, cy, ang, xd, yd) => {
    const pos = add(`IFCAXIS2PLACEMENT2D(${add(`IFCCARTESIANPOINT((${num(cx)},${num(cy)}))`)},${add(`IFCDIRECTION((${num(Math.cos(ang))},${num(Math.sin(ang))}))`)})`);
    return add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${pos},${num(xd)},${num(yd)})`);
  };
  const profilePoly = (pts) => {
    const ring = [...pts, pts[0]].map(([x, y]) => add(`IFCCARTESIANPOINT((${num(x)},${num(y)}))`));
    return add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${add(`IFCPOLYLINE(${list(ring)})`)})`);
  };
  const body = (profile, z0, h) => {
    const at = add(`IFCAXIS2PLACEMENT3D(${add(`IFCCARTESIANPOINT((0.,0.,${num(z0)}))`)},$,$)`);
    const solid = add(`IFCEXTRUDEDAREASOLID(${profile},${at},${dirZ},${num(h)})`);
    return add(`IFCPRODUCTDEFINITIONSHAPE($,$,${list([add(`IFCSHAPEREPRESENTATION(${ctx},${str('Body')},${str('SweptSolid')},${list([solid])})`)])})`);
  };

  const counts = { walls: 0, slabs: 0, spaces: 0, doors: 0, windows: 0 };
  const floors = (project.floors || []).filter((f) => typeof f.level === 'number' && f.plan?.rooms?.length && f.meta?.type !== 'garden');
  const storeys = [];
  for (const f of floors) {
    const plan = f.plan;
    const L = plan.dimensions.length;
    const flip = (x, y) => [x, L - y];
    const elev = f.level * FLOOR_H;
    const wallH = plan.height || WALL_H;
    const t = plan.wallThickness / plan.scale;
    const sPlace = place(buildingPlace, 0, 0, elev);
    const rootKey = `floor-${f.id}`;
    const storey = add(`IFCBUILDINGSTOREY(${guid(rootKey)},${oh},${str(f.name || `Piano ${f.level}`)},$,$,${sPlace},$,$,.ELEMENT.,${num(elev)})`);
    storeys.push(storey);
    const local = () => place(sPlace);
    const inStorey = [];

    // muri
    const walls = wallSolids(plan);
    const wallRef = new Map();
    for (const w of walls) {
      const [cx, cy] = flip(w.cx, w.cy);
      const prof = profileRect(cx, cy, -w.ang, w.len, w.thick);
      const ref = add(`IFCWALL(${guid(`${rootKey}/${w.id}`)},${oh},${str('Muro')},$,$,${local()},${body(prof, 0, wallH)},$)`);
      wallRef.set(w, ref);
      inStorey.push(ref);
      counts.walls += 1;
    }

    // solai e locali
    const spaces = [];
    for (const r of plan.rooms) {
      if (r.kind === 'garden') continue;
      const poly = roomPoly(r).map(([x, y]) => flip(x, y));
      const area = Math.round((r.area ?? Math.abs(shoelace(roomPoly(r)))) * 100) / 100;
      const slab = add(`IFCSLAB(${guid(`${rootKey}/slab-${r.id}`)},${oh},${str(`Solaio ${r.name || r.kind}`)},$,$,${local()},${body(profilePoly(poly), -SLAB_T, SLAB_T)},$,.FLOOR.)`);
      inStorey.push(slab);
      counts.slabs += 1;
      const external = r.kind === 'balcony';
      const space = add(`IFCSPACE(${guid(`${rootKey}/space-${r.id}`)},${oh},${str(r.name || ROOM_KIND_NAME?.[r.kind] || r.kind)},$,$,${local()},${body(profilePoly(poly), 0, wallH)},${str(ROOM_KIND_NAME?.[r.kind] || r.kind)},.ELEMENT.,${external ? '.EXTERNAL.' : '.INTERNAL.'},$)`);
      const q = add(`IFCQUANTITYAREA(${str('GrossFloorArea')},$,$,${num(area)})`);
      const eq = add(`IFCELEMENTQUANTITY(${guid(`${rootKey}/qto-${r.id}`)},${oh},${str('BaseQuantities')},$,$,${list([q])})`);
      add(`IFCRELDEFINESBYPROPERTIES(${guid(`${rootKey}/qrel-${r.id}`)},${oh},$,$,${list([space])},${eq})`);
      spaces.push(space);
      counts.spaces += 1;
    }
    if (spaces.length) rel(`${rootKey}/spaces`, storey, spaces);

    // porte e finestre
    const openings = [...plan.doors.filter((o) => o.kind !== 'gate').map((o) => ({ o, door: true })), ...plan.windows.map((o) => ({ o, door: false }))];
    for (const [i, { o, door }] of openings.entries()) {
      const a = ((o.rot || 0) * Math.PI) / 180;
      const P = ([lx, ly]) => [o.x + lx * Math.cos(a) - ly * Math.sin(a), o.y + lx * Math.sin(a) + ly * Math.cos(a)];
      const [mx, my] = P([o.w / 2, t / 2]);
      const host = wallAt(walls, mx, my);
      const [cx, cy] = flip(mx, my);
      let z0 = 0;
      let h = Math.min(WINDOW_TOP, wallH);
      if (!door) {
        const g = glassSpan(o, wallH);
        z0 = g.sill;
        h = g.top - g.sill;
      } else if (isPanoramic(o)) {
        h = glassSpan(o, wallH).top;
      }
      const key = `${rootKey}/${door ? 'door' : 'window'}-${i}`;
      const opening = add(`IFCOPENINGELEMENT(${guid(`${key}/open`)},${oh},${str('Vano')},$,$,${local()},${body(profileRect(cx, cy, -a, o.w, t + 0.02), z0, h)},$)`);
      const leaf = door ? 0.06 : 0.04;
      const kind = door ? 'IFCDOOR' : 'IFCWINDOW';
      const el = add(`${kind}(${guid(key)},${oh},${str(door ? (o.entrance ? 'Porta d\'ingresso' : 'Porta') : 'Finestra')},$,$,${local()},${body(profileRect(cx, cy, -a, o.w - 0.04, leaf), z0, h - 0.02)},$,${num(h)},${num(o.w)})`);
      if (host) add(`IFCRELVOIDSELEMENT(${guid(`${key}/void`)},${oh},$,$,${wallRef.get(host)},${opening})`);
      add(`IFCRELFILLSELEMENT(${guid(`${key}/fill`)},${oh},$,$,${opening},${el})`);
      inStorey.push(opening, el);
      counts[door ? 'doors' : 'windows'] += 1;
    }
    add(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${guid(`${rootKey}/contains`)},${oh},$,$,${list(inStorey)},${storey})`);
  }
  if (storeys.length) rel('building-storeys', building, storeys);

  const name = String(project.name || 'progetto').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'progetto';
  const head = [
    'ISO-10303-21;', 'HEADER;',
    `FILE_DESCRIPTION((${str('ViewDefinition [CoordinationView]')}),${str('2;1')});`,
    `FILE_NAME(${str(`${name}.ifc`)},${str(new Date(now).toISOString().slice(0, 19))},(${str(author)}),(${str('Planify')}),${str('Planify')},${str('Planify')},${str('')});`,
    `FILE_SCHEMA((${str('IFC2X3')}));`, 'ENDSEC;', 'DATA;',
  ];
  return { text: [...head, ...lines, 'ENDSEC;', 'END-ISO-10303-21;', ''].join('\n'), counts, name };
}

const shoelace = (pts) => pts.reduce((a, [x, y], i) => { const [x2, y2] = pts[(i + 1) % pts.length]; return a + (x * y2 - x2 * y) / 2; }, 0);
