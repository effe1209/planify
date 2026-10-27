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

export function Logo() {
  return <img src="/favicon.svg" alt="Planify" width="30" height="30" style={{ borderRadius: '8px' }} />;
}
