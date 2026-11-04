/*
 * Misura quanto è «pesa» l'interfaccia: fotogrammi al secondo mentre si scorre il pannello e mentre si ruota il 3D.
 * Come si usa: apri l'app con un progetto (meglio la build: `npm run build && npx vite preview`), apri la console del browser
 * (Cmd+Opt+J), incolla questo file e premi Invio. Dopo circa 20 secondi esce una tabella.
 *   fps  ≥ 55 = fluida · 30-55 = si nota · < 30 = pesante      p95 = il 5% dei fotogrammi più lenti (ms)      lenti = fotogrammi sopra 33 ms
 * Per confrontare due versioni (o l'effetto della sfocatura) fai la stessa prova su entrambe, a parità di finestra e progetto.
 */
(async () => {
  const bench = async (label, work, ms = 3500) => {
    const t = [];
    let last = performance.now();
    let stop = false;
    const loop = (n) => { t.push(n - last); last = n; if (!stop) requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    const w = work();
    await new Promise((r) => setTimeout(r, ms));
    stop = true;
    w?.stop?.();
    await new Promise((r) => setTimeout(r, 100));
    const a = t.slice(5).sort((x, y) => x - y);
    const avg = a.reduce((s, v) => s + v, 0) / a.length;
    return { prova: label, fps: +(1000 / avg).toFixed(1), 'p95 (ms)': +a[Math.floor(a.length * 0.95)].toFixed(1), lenti: a.filter((v) => v > 33).length };
  };
  const scroll = () => {
    const el = document.querySelector('.pf-inspector');
    let k = 0;
    const id = setInterval(() => { k += 1; if (el) el.scrollTop = (Math.sin(k / 8) + 1) * 300; }, 16);
    return { stop: () => clearInterval(id) };
  };
  const orbit = () => {
    const c = document.querySelector('canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let k = 0;
    const ev = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', buttons: 1, button: 0 }));
    ev('pointerdown', cx, cy);
    const id = setInterval(() => { k += 1; ev('pointermove', cx + Math.sin(k / 10) * 120, cy + Math.cos(k / 14) * 40); }, 16);
    return { stop: () => { clearInterval(id); ev('pointerup', cx, cy); } };
  };
  const rows = [await bench('fermo', () => null), await bench('scorrere il pannello', scroll)];
  const open3d = [...document.querySelectorAll('button')].find((b) => /\b3D\b/.test(b.textContent) && b.closest('.pf-group'));
  if (!document.querySelector('canvas')) { open3d?.click(); await new Promise((r) => setTimeout(r, 3000)); }
  if (document.querySelector('canvas')) rows.push(await bench('ruotare il 3D', orbit));
  else rows.push({ prova: 'ruotare il 3D', fps: 'n/d (apri un progetto)' });
  // stessa prova senza sfocatura: dice quanto costa il vetro
  const st = document.createElement('style');
  st.textContent = '*,*::before,*::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}';
  document.head.appendChild(st);
  rows.push({ ...(await bench('scorrere il pannello, SENZA sfocatura', scroll)) });
  if (document.querySelector('canvas')) rows.push({ ...(await bench('ruotare il 3D, SENZA sfocatura', orbit)) });
  st.remove();
  console.table(rows);
})();
