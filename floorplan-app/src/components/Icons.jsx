export function ShapeGlyph({ d }) {
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
      {d ? (
        <path d={d} fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      ) : (
        <path d="M3 5h8v6H3zM13 5h8v14h-8zM3 13h8v6H3z" fill="none" stroke="currentColor" strokeWidth="1.6"
          strokeLinejoin="round" strokeDasharray="2.4 2" />
      )}
    </svg>
  );
}

/* Il logo Planify tondo, senza scritta: disco nero con la P e il quadratino lime (a 2× per gli schermi nitidi). */
export function Logo({ size = 44 }) {
  return <img src="/planify-logo-64.png" srcSet="/planify-logo-64.png 1x, /planify-logo-128.png 2x" alt="" aria-hidden="true" width={size} height={size} style={{ borderRadius: '50%' }} />;
}

/* La scritta «Planify» da sola, senza sfondo: lettere scure sul tema chiaro, bianche sul tema scuro (le due immagini si alternano con il tema). */
export function Wordmark({ height = 30 }) {
  const w = Math.round(height * (1336 / 408));
  return (
    <span className="pf-wordmark" role="img" aria-label="Planify">
      <img className="pf-wordmark-light" src="/planify-name-light.png" alt="" width={w} height={height} />
      <img className="pf-wordmark-dark" src="/planify-name-dark.png" alt="" width={w} height={height} />
    </span>
  );
}
