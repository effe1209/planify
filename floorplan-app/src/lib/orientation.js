/*
 * Nord e orientamento. `north` = gradi di cui la freccia del nord ruota in senso orario rispetto all'alto del foglio
 * (0 = nord in alto). Il lato in alto del foglio ha quindi azimut (360 - north).
 */
export const normNorth = (v) => ((Math.round(Number(v) || 0) % 360) + 360) % 360;

/* Azimut (gradi dal nord, in senso orario) di una direzione del foglio: up, right, down, left. */
const SHEET = { up: 0, right: 90, down: 180, left: 270 };
export const bearing = (side, north = 0) => (((SHEET[side] - north) % 360) + 360) % 360;

export const SECTORS = ['N', 'E', 'S', 'O'];
export function sectorOf(az) {
  const a = ((az % 360) + 360) % 360;
  return SECTORS[Math.floor(((a + 45) % 360) / 90)];
}

/* Lato del foglio verso cui guarda una finestra o una porta (dalla parte opposta al centro della pianta). */
function sideOf(o, plan) {
  const { width: W, length: L } = plan.dimensions;
  return o.rot === 90 ? (o.x < W / 2 ? 'left' : 'right') : (o.y < L / 2 ? 'up' : 'down');
}

/* Vetro per esposizione: m² di finestra (altezza assunta 1,40 m) per N, E, S, O. */
export function exposures(plan, north = 0, windowH = 1.4) {
  const out = { N: 0, E: 0, S: 0, O: 0 };
  for (const w of plan.windows || []) out[sectorOf(bearing(sideOf(w, plan), north))] += w.w * windowH;
  return out;
}

/* Posizione del sole nel foglio: pomeriggio verso sud-ovest (azimut 215°), altezza fissa. Ritorna (dx, dz) unitari
   con y del foglio verso il basso, cioè z della scena. */
export function sunDirection(north = 0, azimuth = 215) {
  const a = (((azimuth + north) % 360) * Math.PI) / 180;   // angolo dall'alto del foglio, in senso orario
  return { dx: Math.sin(a), dz: -Math.cos(a) };
}
