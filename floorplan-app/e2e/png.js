/* Lettura minima di un PNG a 8 bit (RGB o RGBA, senza interlacciamento) per misurare la luminosità nelle prove. */
import { inflateSync } from 'node:zlib';

export function readPng(buf) {
  let p = 8;
  let w = 0, h = 0, type = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const kind = buf.toString('ascii', p + 4, p + 8);
    if (kind === 'IHDR') { w = buf.readUInt32BE(p + 8); h = buf.readUInt32BE(p + 12); type = buf[p + 17]; }
    if (kind === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const bpp = type === 6 ? 4 : type === 2 ? 3 : 0;
  if (!bpp) throw new Error(`tipo PNG ${type} non gestito`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c; const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + x] = v & 255;
    }
  }
  return { w, h, bpp, data: out };
}

/* Luminosità mediana (0-1) dei pixel opachi che non sono lo sfondo bianco, e quota di pixel neri (< 6%). */
export function lumaStats(png) {
  const lum = [];
  let dark = 0;
  for (let i = 0; i < png.data.length; i += png.bpp) {
    const a = png.bpp === 4 ? png.data[i + 3] : 255;
    if (a < 200) continue;
    const [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]];
    if (r > 250 && g > 250 && b > 250) continue;
    const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    lum.push(l);
    if (l < 0.06) dark++;
  }
  lum.sort((x, y) => x - y);
  return { n: lum.length, median: lum[Math.floor(lum.length / 2)] ?? 0, dark: lum.length ? dark / lum.length : 0 };
}
