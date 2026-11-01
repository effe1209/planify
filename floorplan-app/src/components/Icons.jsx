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

/* Il marchio Planify: la P con il quadratino lime su fondo nero (a 2× per gli schermi nitidi). */
export function Logo() {
  return <img src="/planify-mark.png" srcSet="/planify-mark-64.png 1x, /planify-mark.png 2x" alt="Planify" width="32" height="32" style={{ borderRadius: 8 }} />;
}
