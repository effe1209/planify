/* Utility generiche: numeri, formattazione, archiviazione locale e download. */

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const snap = (v, s = 0.05) => Math.round(v / s) * s;
export const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

export const fmt = (n, d = 1) =>
  Number(n).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtM = (n) => Number(n).toLocaleString('it-IT', { maximumFractionDigits: 2 });

export const randomSeed = () => Math.floor(Math.random() * 900000) + 100000;
export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/* localStorage può lanciare (navigazione privata, quota piena, sito bloccato): mai far cadere l'app. */
export const storage = {
  get(key, fallback = null) {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignorato */
    }
  },
  getJson(key, fallback = null) {
    const raw = storage.get(key);
    if (raw == null) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  setJson(key, value) {
    return storage.set(key, JSON.stringify(value));
  },
};

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/*
 * URL del motore come lo incolla l'utente → base pulita per le richieste.
 * Render e Hugging Face rispondono a http:// con un reindirizzamento senza intestazioni CORS, che il browser
 * blocca come errore di rete: per gli host pubblici si usa sempre https://. Senza schema la richiesta finirebbe
 * sul sito stesso. Si tolgono anche /health o /docs incollati per sbaglio.
 */
const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|[^/:]+\.local)(:\d+)?$/i;

export function normalizeBaseUrl(url) {
  let u = String(url || '').trim().replace(/\s+/g, '');
  if (!u) return '';
  u = u.replace(/\/(health|docs|openapi\.json)\/?$/i, '').replace(/\/+$/, '');
  const m = u.match(/^(https?):\/\/(.*)$/i);
  const host = (m ? m[2] : u).split('/')[0];
  const scheme = LOCAL_HOST.test(host) ? (m ? m[1].toLowerCase() : 'http') : 'https';
  return `${scheme}://${m ? m[2] : u}`;
}
