import { furnitureZ } from './scene3d';

const DECOR = new Set(['pillow', 'throw', 'book_stack', 'vase', 'candle', 'figurine', 'decor_lamp', 'led_strip', 'wall_shelf']);
const FACING = { S: 0, N: 180, E: -90, W: 90 };
const TABLES = new Set(['nightstand', 'desk', 'table', 'table_round', 'coffee_table', 'console', 'sideboard', 'kitchen_counter', 'kitchen_peninsula', 'wall_shelf']);
const SEATS = new Set(['bed', 'sofa', 'sofa_corner', 'sofa_round', 'sofa_curved', 'armchair', 'armchair_rattan']);
const ROOMS_WITH_SHELVES = new Set(['living', 'living_kitchen', 'bed', 'bed_single', 'study', 'dining', 'hotel_room']);
const ACCESSORY_HEIGHT = { pillow: 0.15, throw: 0.04, book_stack: 0.14, vase: 0.62, candle: 0.18, figurine: 0.2, decor_lamp: 0.4, wall_shelf: 0.055, led_strip: 0.03 };

const hash = (value) => {
  let n = 2166136261;
  for (const c of String(value)) { n ^= c.charCodeAt(0); n = Math.imul(n, 16777619); }
  return (n >>> 0).toString(36);
};
const idFor = (prefix, value) => `${prefix}-${hash(value)}`;
const rotationOf = (it) => (FACING[it.facing || 'S'] || 0) + (it.rot || 0);
const rotate = (x, y, deg) => {
  const a = (deg * Math.PI) / 180;
  return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
};
const center = (it) => ({ x: it.x + it.w / 2, y: it.y + it.h / 2 });
const supportSurface = (it) => it.type === 'wall_shelf' ? (it.mountHeight ?? 1.58) + 0.055 : (it.z?.[1] ?? furnitureZ(it.type)[1]);
const worldSizeFor = (parent, w, h) => parent.facing === 'E' || parent.facing === 'W' ? { w: h, h: w } : { w, h };
const localSizeFor = (item) => worldSizeFor(item, item.w, item.h);
const seatSurface = (type) => ({ bed: 0.52, sofa: 0.44, sofa_corner: 0.44, sofa_round: 0.44, sofa_curved: 0.44, armchair: 0.44, armchair_rattan: 0.52 }[type] || 0.44);

function roomInside(plan, room) {
  if (room.poly) return { x0: room.x, y0: room.y, x1: room.x + room.w, y1: room.y + room.h };
  const t = (plan.wallThickness || 0) / (plan.scale || 1);
  const { width = Infinity, length = Infinity } = plan.dimensions || {};
  const edge = (v, max) => v < 1e-3 || Math.abs(v - max) < 1e-3;
  return {
    x0: room.x + (edge(room.x, width) ? t : t / 2),
    y0: room.y + (edge(room.y, length) ? t : t / 2),
    x1: room.x + room.w - (edge(room.x + room.w, width) ? t : t / 2),
    y1: room.y + room.h - (edge(room.y + room.h, length) ? t : t / 2),
  };
}

function makeAttached(parent, type, key, localX, localY, w, h, mountHeight, color) {
  const offset = rotate(localX, localY, rotationOf(parent));
  const c = center(parent);
  const size = worldSizeFor(parent, w, h);
  return {
    id: idFor('decor', `${parent.id}:${key}`), type,
    x: +(c.x + offset.x - size.w / 2).toFixed(3), y: +(c.y + offset.y - size.h / 2).toFixed(3), ...size,
    room: parent.room, facing: parent.facing || 'S', rot: parent.rot || 0,
    decor: true, autoDecor: true, supportId: parent.id, supportOffset: offset,
    supportSize: { w, h }, supportRotation: 0, supportHeightOffset: mountHeight - supportSurface(parent),
    ...(parent.elev != null && { elev: parent.elev }),
    mountHeight, z: [mountHeight, mountHeight + ACCESSORY_HEIGHT[type]], color,
  };
}

function nextFreeId(item, index, seed) {
  return item.id || idFor('item', `${seed}|${item.room || ''}|${item.type}|${index}`);
}

function decorationsFor(item, rngSeed) {
  const out = [];
  if (SEATS.has(item.type)) {
    if (item.type === 'bed') {
      item.integratedPillows = false;
      item.integratedThrow = false;
      const count = item.w >= 1.4 ? 2 : 1;
      const pw = Math.min(0.48, (item.w - 0.12) / count - 0.03);
      const palette = ['#c6b79e', '#83917e', '#b78f7a', '#737f91'];
      for (let i = 0; i < count; i++) {
        const x = count === 1 ? 0 : (i ? 1 : -1) * item.w * 0.22;
      out.push(makeAttached(item, 'pillow', `pillow-${i}`, x, -item.h * 0.31, pw, 0.36, seatSurface(item.type), palette[(parseInt(hash(`${rngSeed}:p${i}`), 36) || 0) % palette.length]));
      }
      out.push(makeAttached(item, 'throw', 'throw', 0, item.h * 0.25, Math.min(0.68, item.w * 0.55), Math.min(0.88, item.h * 0.36), seatSurface(item.type) - 0.04, '#8b8962'));
    } else {
      const count = item.type === 'armchair' || item.type === 'armchair_rattan' ? 1 : 2;
      const palette = ['#9b806c', '#8b9278', '#526479', '#c2a981'];
      for (let i = 0; i < count; i++) {
        const x = count === 1 ? 0 : (i ? 1 : -1) * item.w * 0.24;
        out.push(makeAttached(item, 'pillow', `pillow-${i}`, x, -item.h * 0.22, Math.min(0.42, item.w * 0.48), Math.min(0.38, item.h * 0.48), seatSurface(item.type),
          palette[(parseInt(hash(`${rngSeed}:s${i}`), 36) || 0) % palette.length]));
      }
      if ((parseInt(hash(`${rngSeed}:throw`), 36) || 0) % 3 === 0 && item.w > 1.4) {
        out.push(makeAttached(item, 'throw', 'throw', item.w * 0.28, item.h * 0.08, 0.48, Math.min(0.6, item.h * 0.55), seatSurface(item.type), '#a58870'));
      }
    }
  }

  if (TABLES.has(item.type) && item.type !== 'wall_shelf') {
    const top = item.z?.[1] ?? furnitureZ(item.type)[1];
    const pick = (suffix) => (parseInt(hash(`${rngSeed}:${suffix}`), 36) || 0) % 3;
    const slotX = item.w * 0.24;
    const slotY = item.h * 0.18;
    if (['nightstand', 'coffee_table', 'table', 'table_round', 'sideboard', 'console'].includes(item.type)) {
      out.push(makeAttached(item, 'candle', 'candle', -slotX, -slotY, 0.1, 0.1, top + 0.015, ['#f2e8cf', '#d5d1c5', '#bc947d'][pick('candle')]));
    }
    if (['coffee_table', 'table', 'table_round', 'desk', 'console', 'sideboard'].includes(item.type)) {
      out.push(makeAttached(item, 'book_stack', 'books', slotX * 0.55, slotY, 0.28, 0.2, top + 0.012, ['#9c6958', '#586b5c', '#4f6073'][pick('books')]));
    }
    if (['coffee_table', 'console', 'sideboard', 'kitchen_counter', 'kitchen_peninsula'].includes(item.type)) {
      out.push(makeAttached(item, 'vase', 'vase', slotX, -slotY, 0.16, 0.16, top + 0.012, ['#a98467', '#76877b', '#c1b8aa'][pick('vase')]));
    }
    if (['coffee_table', 'console', 'sideboard'].includes(item.type) && pick('figure') === 0) {
      out.push(makeAttached(item, 'figurine', 'figurine', -slotX * 0.5, slotY * 1.25, 0.11, 0.11, top + 0.015, '#b99a69'));
    }
    if (item.type === 'nightstand' && pick('lamp') === 0) {
      out.push(makeAttached(item, 'decor_lamp', 'lamp', slotX, slotY, 0.2, 0.2, top + 0.012, '#e4d5b6'));
    }
  }
  return out;
}

function shelfForRoom(plan, room) {
  const length = 0.72;
  const depth = 0.18;
  const b = roomInside(plan, room);
  const gap = 0.005;
  const candidates = [
    { side: 'N', x: room.x + (room.w - length) / 2, y: b.y0 + gap, w: length, h: depth, facing: 'S', vertical: false },
    { side: 'S', x: room.x + (room.w - length) / 2, y: b.y1 - depth - gap, w: length, h: depth, facing: 'N', vertical: false },
    { side: 'W', x: b.x0 + gap, y: room.y + (room.h - length) / 2, w: depth, h: length, facing: 'E', vertical: true },
    { side: 'E', x: b.x1 - depth - gap, y: room.y + (room.h - length) / 2, w: depth, h: length, facing: 'W', vertical: true },
  ];
  const openings = [...(plan.doors || []), ...(plan.windows || [])];
  const clear = (c) => openings.every((o) => {
    const isVertical = o.rot === 90;
    if (isVertical !== c.vertical) return true;
    const wall = c.side === 'N' ? room.y : c.side === 'S' ? room.y + room.h : c.side === 'W' ? room.x : room.x + room.w;
    const openingWall = isVertical ? o.x : o.y;
    if (Math.abs(openingWall - wall) > 0.25) return true;
    const start = isVertical ? o.y : o.x;
    const end = start + o.w;
    const itemStart = isVertical ? c.y : c.x;
    const itemEnd = itemStart + (isVertical ? c.h : c.w);
    return end + 0.12 <= itemStart || start - 0.12 >= itemEnd;
  });
  const placement = candidates.find(clear);
  if (!placement) return null;
  return {
    id: idFor('decor-shelf', `${plan.seed || ''}:${room.id}`), type: 'wall_shelf',
    x: placement.x, y: placement.y, w: placement.w, h: placement.h, mountSize: { w: length, h: depth },
    room: room.id, facing: placement.facing, rot: 0, decor: true, autoDecor: true, wallMounted: true, mountHeight: 1.58,
    z: [1.58, 1.635], color: '#8b7258',
  };
}

export function snapWallMountedItem(plan, item, x, y) {
  const room = plan.rooms?.find((r) => r.id === item.room) || plan.rooms?.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  if (!room || room.poly) return { ...item, x: +x.toFixed(3), y: +y.toFixed(3), wallMounted: true };
  const margin = 0.03;
  const gap = 0.005;
  const canonical = item.mountSize || { w: item.w, h: item.h };
  const b = roomInside(plan, room);
  const candidate = (side, facing, vertical) => {
    const w = vertical ? canonical.h : canonical.w;
    const h = vertical ? canonical.w : canonical.h;
    const minX = b.x0 + margin;
    const maxX = Math.max(minX, b.x1 - w - margin);
    const minY = b.y0 + margin;
    const maxY = Math.max(minY, b.y1 - h - margin);
    const xx = side === 'W' ? b.x0 + gap : side === 'E' ? b.x1 - w - gap : Math.max(minX, Math.min(maxX, x));
    const yy = side === 'N' ? b.y0 + gap : side === 'S' ? b.y1 - h - gap : Math.max(minY, Math.min(maxY, y));
    return { side, x: xx, y: yy, w, h, facing };
  };
  const candidates = [
    candidate('N', 'S', false), candidate('S', 'N', false), candidate('W', 'E', true), candidate('E', 'W', true),
  ];
  const best = candidates.reduce((a, b) => (Math.hypot(a.x - x, a.y - y) <= Math.hypot(b.x - x, b.y - y) ? a : b));
  return { ...item, room: room.id, x: +best.x.toFixed(3), y: +best.y.toFixed(3), w: best.w, h: best.h,
    mountSize: canonical, facing: best.facing, wallMounted: true };
}

function addShelfDetails(plan, shelf, list) {
  const before = list.length;
  const attached = list.filter((it) => it.supportId === shelf.id);
  const length = shelf.mountSize?.w ?? (shelf.facing === 'E' || shelf.facing === 'W' ? shelf.h : shelf.w);
  const depth = shelf.mountSize?.h ?? (shelf.facing === 'E' || shelf.facing === 'W' ? shelf.w : shelf.h);
  if (!attached.some((it) => it.type === 'book_stack')) {
    list.push(makeAttached(shelf, 'book_stack', 'shelf-books', -length * 0.22, 0, 0.28, 0.17, supportSurface(shelf) + 0.008, '#596c78'));
  }
  if (!attached.some((it) => it.type === 'led_strip')) {
    list.push(makeAttached(shelf, 'led_strip', 'shelf-led', 0, depth * 0.32, length * 0.88, 0.025, shelf.mountHeight - 0.012, '#f1cf9d'));
  }
  return list.length !== before;
}

/* Deterministic accessories are saved as separate furniture items, so they use the existing edit, history and export paths. */
export function autoDecoratePlan(plan) {
  if (!plan?.rooms?.length || !Array.isArray(plan.furniture)) return plan;
  const seed = plan.seed || `${plan.dimensions?.width || ''}x${plan.dimensions?.length || ''}`;
  const list = plan.furniture.map((item, index) => {
    if (item.decor || (item.id && item.decorAutoDone)) return item;
    return { ...item, id: nextFreeId(item, index, seed) };
  });
  const existingIds = new Set(list.map((it) => it.id));
  const parents = list.filter((it) => !it.decor);
  let changed = list.some((it, i) => it !== plan.furniture[i]);
  for (const parent of parents) {
    if (parent.decorAutoDone) continue;
    parent.decorAutoDone = true;
    changed = true;
    for (const item of decorationsFor(parent, parent.id)) {
      if (!existingIds.has(item.id)) { list.push(item); existingIds.add(item.id); }
    }
  }

  const decoratedRooms = new Set(plan.autoDecorRooms || []);
  for (const roomId of decoratedRooms) {
    const hasShelf = list.some((it) => it.type === 'wall_shelf' && it.autoDecor && it.room === roomId);
    const hasSeat = parents.some((it) => it.room === roomId && SEATS.has(it.type));
    if (!plan.rooms.some((room) => room.id === roomId) || (!hasShelf && !hasSeat)) {
      decoratedRooms.delete(roomId);
      changed = true;
    }
  }
  for (const room of plan.rooms) {
    if (decoratedRooms.has(room.id) || room.poly || !ROOMS_WITH_SHELVES.has(room.kind) || room.w < 2.7 || room.h < 2.3) continue;
    const hasStorage = parents.some((it) => it.room === room.id && ['bookcase', 'shelving', 'shelving_heavy', 'wall_shelf'].includes(it.type));
    const hasFurniture = parents.some((it) => it.room === room.id && SEATS.has(it.type));
    if (!hasFurniture || hasStorage) continue;
    const shelf = shelfForRoom(plan, room);
    if (!shelf) continue;
    if (!existingIds.has(shelf.id)) { list.push(shelf); existingIds.add(shelf.id); }
    addShelfDetails(plan, shelf, list);
    decoratedRooms.add(room.id);
    changed = true;
  }

  for (const shelf of list.filter((it) => it.type === 'wall_shelf' && it.decor)) {
    if (addShelfDetails(plan, shelf, list)) changed = true;
  }
  // Rimuovi accessori legati a un arredo che è stato eliminato.
  const ownerIds = new Set(list.map((it) => it.id));
  const filtered = list.filter((it) => !it.supportId || ownerIds.has(it.supportId));
  if (filtered.length !== list.length) changed = true;
  if (!changed && (plan.autoDecorRooms || []).length === decoratedRooms.size) return plan;
  return { ...plan, furniture: filtered, autoDecorRooms: [...decoratedRooms] };
}

export function placeDecorItem(plan, item, entry) {
  if (entry.wallMounted && !entry.supportTypes?.length) {
    const mounted = snapWallMountedItem(plan, item, item.x, item.y);
    return { ...mounted, z: [mounted.mountHeight ?? 1.58, (mounted.mountHeight ?? 1.58) + (ACCESSORY_HEIGHT[item.type] || 0.2)] };
  }
  const sameLayer = (it) => (it.elev || 0) === (item.elev || 0);
  const supports = plan.furniture.filter((it) => it.room === item.room && sameLayer(it) && entry.supportTypes?.includes(it.type)
    && (!it.decor || it.type === 'wall_shelf'));
  const parent = supports.sort((a, b) => {
    const point = center(item);
    return Math.hypot(center(a).x - point.x, center(a).y - point.y) - Math.hypot(center(b).x - point.x, center(b).y - point.y);
  })[0];
  if (!parent) return entry.wallMounted ? snapWallMountedItem(plan, item, item.x, item.y) : null;
  const localParent = localSizeFor(parent);
  const childSize = { w: item.w, h: item.h };
  const pad = 0.012;
  const limitX = Math.max(0, (localParent.w - childSize.w) / 2 - pad);
  const limitY = Math.max(0, (localParent.h - childSize.h) / 2 - pad);
  const slots = [[0, 0], [-0.22, 0], [0.22, 0], [0, -0.22], [0, 0.22], [-0.3, -0.18], [0.3, 0.18]];
  const occupied = plan.furniture.filter((it) => it.supportId === parent.id && it.supportOffset);
  const slot = slots.map(([u, v]) => ({ x: u * localParent.w, y: v * localParent.h })).find((candidate) => {
    const x = Math.max(-limitX, Math.min(limitX, candidate.x));
    const y = Math.max(-limitY, Math.min(limitY, candidate.y));
    return occupied.every((it) => {
      const size = it.supportSize || { w: it.w, h: it.h };
      const p = rotate(it.supportOffset.x, it.supportOffset.y, -rotationOf(parent));
      return Math.abs(p.x - x) >= (size.w + childSize.w) / 2 + pad || Math.abs(p.y - y) >= (size.h + childSize.h) / 2 + pad;
    });
  }) || { x: 0, y: 0 };
  const localX = Math.max(-limitX, Math.min(limitX, slot.x));
  const localY = Math.max(-limitY, Math.min(limitY, slot.y));
  const offset = rotate(localX, localY, rotationOf(parent));
  const c = center(parent);
  const top = supportSurface(parent);
  const mountHeight = item.type === 'pillow' || item.type === 'throw'
    ? seatSurface(parent.type)
    : top + 0.015;
  const size = worldSizeFor(parent, item.w, item.h);
  return {
    ...item, ...size, x: +(c.x + offset.x - size.w / 2).toFixed(3), y: +(c.y + offset.y - size.h / 2).toFixed(3),
    facing: parent.facing || item.facing, rot: parent.rot || 0, supportId: parent.id, supportOffset: offset,
    supportSize: { w: item.w, h: item.h }, supportRotation: 0, supportHeightOffset: mountHeight - supportSurface(parent), mountHeight,
    ...(parent.elev != null && { elev: parent.elev }),
    z: [mountHeight, mountHeight + (ACCESSORY_HEIGHT[item.type] || 0.2)],
  };
}

/* Keep attached accessories with their support when that furniture moves, turns or changes size. */
export function syncAttachedAccessories(previous, next) {
  const oldById = new Map(previous.map((it) => [it.id, it]));
  const nextById = new Map(next.map((it) => [it.id, it]));
  const out = next.map((item) => ({ ...item }));
  const outById = new Map(out.map((it) => [it.id, it]));
  for (const child of out) {
    if (!child.supportId) continue;
    const oldChild = oldById.get(child.id);
    const oldParent = oldById.get(child.supportId);
    const parent = nextById.get(child.supportId);
    if (!parent) continue;
    if (oldParent && oldChild && (oldParent.x !== parent.x || oldParent.y !== parent.y || oldParent.w !== parent.w || oldParent.h !== parent.h || rotationOf(oldParent) !== rotationOf(parent))) {
      const raw = oldChild.supportOffset || { x: center(oldChild).x - center(oldParent).x, y: center(oldChild).y - center(oldParent).y };
      const local = rotate(raw.x, raw.y, -rotationOf(oldParent));
      const oldSize = localSizeFor(oldParent);
      const nextSize = localSizeFor(parent);
      const scaled = { x: local.x * (nextSize.w / Math.max(0.01, oldSize.w)), y: local.y * (nextSize.h / Math.max(0.01, oldSize.h)) };
      const offset = rotate(scaled.x, scaled.y, rotationOf(parent));
      const c = center(parent);
      child.x = +(c.x + offset.x - child.w / 2).toFixed(3);
      child.y = +(c.y + offset.y - child.h / 2).toFixed(3);
      child.supportOffset = offset;
      child.facing = parent.facing || child.facing;
      child.rot = parent.rot || 0;
      if (child.supportSize) {
        const size = worldSizeFor(parent, child.supportSize.w, child.supportSize.h);
        const current = center(child);
        child.w = size.w; child.h = size.h;
        child.x = +(current.x - child.w / 2).toFixed(3); child.y = +(current.y - child.h / 2).toFixed(3);
      }
    } else if (oldChild && (oldChild.x !== child.x || oldChild.y !== child.y || oldChild.rot !== child.rot)) {
      const c = center(parent); const p = center(child);
      child.supportOffset = { x: p.x - c.x, y: p.y - c.y };
      child.supportRotation = rotationOf(child) - rotationOf(parent);
    }
    if (oldChild && oldChild.mountHeight !== child.mountHeight) child.supportHeightOffset = child.mountHeight - supportSurface(parent);
    child.mountHeight = supportSurface(parent) + (child.supportHeightOffset || 0);
    if (parent.elev != null) child.elev = parent.elev;
    else delete child.elev;
    const objectHeight = child.z ? child.z[1] - child.z[0] : ACCESSORY_HEIGHT[child.type] || 0.2;
    child.z = [child.mountHeight, child.mountHeight + objectHeight];
  }
  // Keep the local rotation users chose on a supported item when its parent later turns.
  for (const child of out) {
    if (!child.supportId || !child.supportRotation) continue;
    const parent = outById.get(child.supportId);
    if (parent) { child.facing = parent.facing || 'S'; child.rot = (parent.rot || 0) + child.supportRotation; }
  }
  return out;
}

export const isDecorItem = (item) => DECOR.has(item?.type) || !!item?.decor;
