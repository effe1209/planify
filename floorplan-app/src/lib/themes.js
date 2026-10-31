/*
 * Temi per stile d'interni: legni, tessuti, tappeti e pavimento cambiano insieme, come in una
 * palette da progettista. `floor` è il disegno del pavimento nelle zone giorno e notte.
 *
 * Ogni stile ha anche una grammatica delle forme (FORMS), usata dai disegni degli arredi
 * (components/FurnitureArt.jsx):
 *   round   raggio degli angoli in px (squadrato → morbido)
 *   arm     braccioli: square | round | rolled (a rullo) | slim
 *   legs    gambe e telai: wood | turned (tornite) | metal
 *   low     mobili bassi e letto su pedana (japandi)
 *   tuft    capitonné su schienali e testiere
 *   rugPattern trama dei tappeti: plain | stripes | border | grid | ornament
 *   accent  colore d'accento (cuscini, plaid, quadri), accentSoft per le tende
 *   metal   colore dei telai metallici; leather = rivestimento del divano se in cuoio
 */
const FORMS = {
  modern: { round: 2, arm: 'square', legs: 'wood', low: false, tuft: false, rugPattern: 'border',
    accent: '#4f6d8f', accentSoft: '#dde4ee', metal: '#4b5563', leather: null },
  classic: { round: 4, arm: 'rolled', legs: 'turned', low: false, tuft: true, rugPattern: 'ornament',
    accent: '#8c3b3b', accentSoft: '#efe0d2', metal: '#8c6b3a', leather: null },
  nordic: { round: 7, arm: 'round', legs: 'wood', low: false, tuft: false, rugPattern: 'stripes',
    accent: '#d29b4f', accentSoft: '#eef1ec', metal: '#6b7280', leather: null },
  industrial: { round: 1.5, arm: 'square', legs: 'metal', low: false, tuft: false, rugPattern: 'grid',
    accent: '#b4532a', accentSoft: '#e4e1dc', metal: '#3a3f45', leather: '#9a6a46' },
  japandi: { round: 3, arm: 'slim', legs: 'wood', low: true, tuft: false, rugPattern: 'plain',
    accent: '#7d8a6a', accentSoft: '#efeadf', metal: '#5b5b52', leather: null },
  luxury: { round: 5, arm: 'round', legs: 'metal', low: false, tuft: true, rugPattern: 'border',
    accent: '#b08d57', accentSoft: '#f1e9ef', metal: '#b08d57', leather: null },
};

export const THEMES = {
  modern: { wood: '#f2e6d3', woodLine: '#b89d6e', fabric: '#dfe5ee', fabricSoft: '#f3f5f9', fabricArm: '#d3dae6',
    chair: '#eadfca', duvet: '#dde7f6', cabinet: '#ece7df', rug: '#e6ebf2', rugLine: '#b9c4d4', pot: '#e9e4dc', floor: 'plank', floorInk: '#8a6f3e' },
  classic: { wood: '#ead6b3', woodLine: '#9c7a45', fabric: '#eadcc6', fabricSoft: '#f7efe2', fabricArm: '#dfcdb0',
    chair: '#e2cfa9', duvet: '#f1e6d2', cabinet: '#e6d6bd', rug: '#d8bf98', rugLine: '#a8844f', pot: '#d9b99a', floor: 'herringbone', floorInk: '#7a5a2c' },
  nordic: { wood: '#f6efe2', woodLine: '#c9b48e', fabric: '#e2e8e0', fabricSoft: '#f4f6f2', fabricArm: '#d4ddd2',
    chair: '#efe6d4', duvet: '#e9efe8', cabinet: '#f1ece2', rug: '#eef0ea', rugLine: '#c4cdbd', pot: '#f0ede6', floor: 'plank', floorInk: '#b49c70' },
  industrial: { wood: '#d8c4a2', woodLine: '#7d6a4c', fabric: '#cdd2d6', fabricSoft: '#e5e8ea', fabricArm: '#bfc5ca',
    chair: '#cdbf9f', duvet: '#dfe3e6', cabinet: '#d7d3cc', rug: '#cbc4b8', rugLine: '#8f877a', pot: '#bdb7ae', floor: 'concrete', floorInk: '#55595e' },
  japandi: { wood: '#eee1c8', woodLine: '#a88f68', fabric: '#e7e1d4', fabricSoft: '#f5f1e8', fabricArm: '#dcd4c3',
    chair: '#e6d8bc', duvet: '#efe9dc', cabinet: '#ebe2d1', rug: '#e5dbc9', rugLine: '#b9a98d', pot: '#e2d6c2', floor: 'plank', floorInk: '#9c7f52' },
  luxury: { wood: '#e5d0ac', woodLine: '#8c6b3a', fabric: '#e6dde8', fabricSoft: '#f5f0f6', fabricArm: '#d8cbdc',
    chair: '#e3d2b2', duvet: '#efe7f0', cabinet: '#e8dcc6', rug: '#e2d4bf', rugLine: '#b49766', pot: '#d9c8a8', floor: 'herringbone', floorInk: '#6e5025' },
};
for (const [k, f] of Object.entries(FORMS)) {
  THEMES[k] = { id: k, ...THEMES[k], ...f, ...(f.leather && { fabric: f.leather, fabricArm: '#865a3a', fabricSoft: '#b07f58' }) };
}
