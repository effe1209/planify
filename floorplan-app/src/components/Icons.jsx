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

/* Il logo Planify tondo, senza scritta: disco nero con la P e il quadratino lime (a 2× per gli schermi nitidi). Un anello lo stacca dallo sfondo (nel tema scuro il nero sparirebbe). */
export function Logo({ size = 40 }) {
  return <img className="pf-logo" src="/planify-logo-96.png" srcSet="/planify-logo-96.png 1x, /planify-logo-128.png 1.5x, /planify-logo.png 3x" alt="" aria-hidden="true" width={size} height={size} />;
}

/* La scritta «Planify» da sola, senza sfondo, a 1×, 2× e 3×: lettere scure sul tema chiaro, bianche con ombra lime sul tema scuro (le due immagini si alternano con il tema). */
export function Wordmark({ height = 34 }) {
  const w = Math.round(height * (1336 / 408));
  const set = (tema) => `/planify-name-${tema}-36.png 1x, /planify-name-${tema}-72.png 2x, /planify-name-${tema}-108.png 3x`;
  return (
    <span className="pf-wordmark" role="img" aria-label="Planify">
      <img className="pf-wordmark-light" src="/planify-name-light-72.png" srcSet={set('light')} alt="" width={w} height={height} />
      <img className="pf-wordmark-dark" src="/planify-name-dark-72.png" srcSet={set('dark')} alt="" width={w} height={height} />
    </span>
  );
}
