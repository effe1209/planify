/*
 * Marchio e dati del cartiglio delle tavole. Di serie c'è Planify; chi vuole il proprio logo lo imposta nel progetto
 * (`project.branding`) o una volta per tutti nel browser (localStorage «planify.branding»), senza toccare il codice:
 *   { name, logo: URL o data-URL PNG/JPEG, client, designer, ref }
 * `client`, `designer` e `ref` (committente, progettista, n. pratica) restano vuoti se non impostati: il cartiglio li lascia da compilare a mano.
 */
export const DEFAULT_BRANDING = { name: 'Planify', logo: '/Logo.png', client: '', designer: '', ref: '' };
export const BRANDING_KEY = 'planify.branding';

const clean = (b) => Object.fromEntries(Object.entries(b || {}).filter(([k, v]) => k in DEFAULT_BRANDING && typeof v === 'string' && v.trim()));

function stored() {
  try {
    return clean(JSON.parse(globalThis.localStorage?.getItem(BRANDING_KEY) || 'null'));
  } catch {
    return {};
  }
}

/* Marchio effettivo: standard, poi quello salvato nel browser, poi quello del progetto (che vince). */
export const getBranding = (project) => ({ ...DEFAULT_BRANDING, ...stored(), ...clean(project?.branding) });

export function setStoredBranding(b) {
  try {
    globalThis.localStorage?.setItem(BRANDING_KEY, JSON.stringify(clean(b)));
  } catch {
    /* spazio non disponibile: resta il marchio standard */
  }
}
