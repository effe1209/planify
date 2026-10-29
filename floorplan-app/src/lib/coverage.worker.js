/* Calcolo della copertura fuori dal thread dell'interfaccia (lib/coverage.js). */
import { coverFloor } from './coverage';

self.onmessage = (e) => {
  const { id, plan, devices, doors } = e.data;
  try {
    const { rooms, openings, sensors } = coverFloor(plan, devices, { doors });
    const transfer = rooms.flatMap((r) => [r.cells.buffer, r.count.buffer, r.cause.buffer]);
    self.postMessage({ id, rooms, openings, sensors }, transfer);
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
