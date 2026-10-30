/*
 * Pagina di un PDF come immagine, per ricalcare una pianta scansionata nello schizzo (pdf.js, caricato solo qui).
 * La scala si legge dal testo della pagina («1:100», «Scala 1:50»); senza testo si propone 1:100.
 */
const PT = 0.0254 / 72;   // un punto PDF in metri sulla carta

export async function pdfPageImage(file, { maxPx = 2600 } = {}) {
  const pdfjs = await import('pdfjs-dist');
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(4, maxPx / Math.max(base.width, base.height)) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const text = (await page.getTextContent()).items.map((i) => i.str).join(' ');
    const m = text.match(/(?<![\d.,])1\s*[:/]\s*(\d{2,4})(?![\d.,])/);
    return {
      url: canvas.toDataURL('image/jpeg', 0.85),
      paper: [base.width * PT, base.height * PT],   // misure del foglio in metri
      scale: m ? Number(m[1]) : 100,
      scaleFound: !!m,
      pages: doc.numPages,
    };
  } finally {
    doc.destroy();
  }
}

/* File → base64 (senza l'intestazione data:), per mandarlo al motore. */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
