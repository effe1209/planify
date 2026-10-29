import { fmtM } from '../lib/utils';

/* Abaco dei serramenti di tutto il progetto (lib/schedule.js); i codici compaiono in pianta nella vista «Tecnico». */
export default function SchedulePanel({ schedule }) {
  if (!schedule?.rows.length) return null;
  const total = (p) => schedule.rows.filter((r) => r.code.startsWith(p)).reduce((s, r) => s + r.qty, 0);
  return (
    <section className="pf-sec">
      <details className="pf-bom">
        <summary>Abaco dei serramenti · {total('P')} porte, {total('F')} finestre</summary>
        <table className="pf-est-table">
          <thead><tr><th>Cod.</th><th>Tipo</th><th>L × H (m)</th><th>Q.tà</th></tr></thead>
          <tbody>
            {schedule.rows.map((r) => (
              <tr key={r.code} title={`${r.places.join(', ')}${r.open ? ` · apertura ${r.open}` : ''}`}>
                <td><b>{r.code}</b></td>
                <td>{r.type}</td>
                <td>{fmtM(r.w)} × {fmtM(r.h)}</td>
                <td>{r.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="pf-hint">Codici in pianta con la vista «Tecnico», insieme alle quote interne dei locali.</p>
      </details>
    </section>
  );
}
