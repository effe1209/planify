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

/* Il logo Planify tondo, com'è nel file del marchio: disco nero con la P, il quadratino lime e la scritta (a 2× per gli schermi nitidi). */
export function Logo() {
  return <img src="/planify-logo-64.png" srcSet="/planify-logo-64.png 1x, /planify-logo-128.png 2x" alt="Planify" width="40" height="40" style={{ borderRadius: '50%' }} />;
}
