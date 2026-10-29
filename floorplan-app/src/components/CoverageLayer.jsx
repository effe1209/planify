import { useMemo } from 'react';
import { CELL_STATE, COVER_COLORS } from '../lib/coverage';

/* Una cella = un pixel; il browser ingrandisce l'immagine sfumando i bordi tra le zone. */
function roomImage(room, pick) {
  const canvas = document.createElement('canvas');
  canvas.width = room.nx;
  canvas.height = room.ny;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(room.nx, room.ny);
  for (let k = 0; k < room.cells.length; k++) {
    const c = pick(room, k);
    if (!c) continue;
    img.data.set(c, k * 4);
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

const stateColor = (room, k) => {
  switch (room.cells[k]) {
    case CELL_STATE.covered: return room.count[k] > 1 ? COVER_COLORS.overlap : COVER_COLORS.covered;
    case CELL_STATE.partial: return COVER_COLORS.partial;
    case CELL_STATE.blind: return room.own ? COVER_COLORS.blind : COVER_COLORS.unwatched;
    default: return null;
  }
};

/*
 * Copertura calcolata (lib/coverage.js) disegnata sui locali: verde coperto, giallo parziale, rosso cieco,
 * grigio le zone non viste dei locali senza un sensore proprio.
 * `highlight` = { room, idx }: la zona cieca scelta nel pannello, in rosso pieno.
 */
export default function CoverageLayer({ coverage, s, highlight }) {
  const images = useMemo(
    () => (typeof document === 'undefined' ? [] : coverage.rooms.map((r) => ({ r, href: roomImage(r, stateColor) }))),
    [coverage],
  );
  const hl = useMemo(() => {
    const r = highlight && coverage.rooms.find((x) => x.id === highlight.room);
    return r ? { r, href: roomImage(r, (room, k) => (room.cause[k] === highlight.idx ? COVER_COLORS.highlight : null)) } : null;
  }, [coverage, highlight]);
  return (
    <g pointerEvents="none">
      {images.map(({ r, href }) => (
        <image key={r.id} href={href} x={r.x0 * s} y={r.y0 * s} width={r.nx * r.cw * s} height={r.ny * r.ch * s}
          preserveAspectRatio="none" />
      ))}
      {hl && (
        <image className="pf-cov-hl" href={hl.href} x={hl.r.x0 * s} y={hl.r.y0 * s} width={hl.r.nx * hl.r.cw * s}
          height={hl.r.ny * hl.r.ch * s} preserveAspectRatio="none" style={{ imageRendering: 'pixelated' }} />
      )}
    </g>
  );
}
