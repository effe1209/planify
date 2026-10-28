import { AlertTriangle, CheckCircle2 } from 'lucide-react';

/* Confronto tra i filtri chiesti e la pianta ottenuta: ogni differenza è visibile, mai silenziosa. */

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const KITCHEN = { open: 'a vista nel soggiorno', closed: 'separata' };

function checkFilters(plan, params) {
  const beds = plan.rooms.filter((r) => r.kind === 'bed' || r.kind === 'bed_single');
  const isSingle = (r) => r.size === 'single' || r.kind === 'bed_single' || (!r.size && /singola|cameretta/i.test(r.name));
  const got = {
    doubles: beds.filter((r) => !isSingle(r)).length,
    singles: beds.filter(isSingle).length,
    baths: plan.rooms.filter((r) => r.kind === 'bath').length,
    kitchen: plan.rooms.some((r) => r.kind === 'kitchen') ? 'closed' : 'open',
    peninsula: plan.furniture.some((f) => f.type === 'kitchen_peninsula'),
  };
  const rows = [
    { label: 'Camere matrimoniali', want: params.doubles, got: got.doubles, text: (v) => plural(v, 'matrimoniale', 'matrimoniali') },
    { label: 'Camere singole', want: params.singles, got: got.singles, text: (v) => plural(v, 'singola', 'singole') },
  ];
  if (params.baths !== 'auto' && params.baths != null) {
    rows.push({ label: 'Bagni', want: params.baths, got: got.baths, text: (v) => plural(v, 'bagno', 'bagni') });
  }
  if (params.kitchen && params.kitchen !== 'auto') {
    rows.push({ label: 'Cucina', want: params.kitchen, got: got.kitchen, text: (v) => KITCHEN[v] });
  }
  const has = (kind) => plan.rooms.some((r) => r.kind === kind);
  const yesNo = (v) => (v ? 'presente' : 'assente');
  if (params.entry === true) rows.push({ label: 'Ingresso separato', want: true, got: has('entry'), text: yesNo });
  if (params.suite) rows.push({ label: 'Suite padronale', want: true, got: has('closet') || plan.rooms.some((r) => r.name === 'Bagno padronale'), text: yesNo });
  if (params.study) rows.push({ label: 'Studio', want: true, got: has('study'), text: yesNo });
  if (params.storage) rows.push({ label: 'Ripostiglio', want: true, got: has('storage'), text: yesNo });
  if (params.peninsula) {
    rows.push({ label: 'Penisola', want: true, got: got.peninsula, text: (v) => (v ? 'presente' : 'assente') });
  }
  return rows.map((r) => ({ ...r, ok: r.want === r.got }));
}

export default function FilterCheck({ plan, params }) {
  const rows = checkFilters(plan, params);
  const bad = rows.filter((r) => !r.ok);
  return (
    <section className="pf-sec">
      <h2>Filtri richiesti</h2>
      <ul className="pf-filters">
        {rows.map((r) => (
          <li key={r.label} className={r.ok ? 'is-ok' : 'is-bad'}>
            {r.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            <span>{r.label}</span>
            <b>{r.ok ? r.text(r.got) : `${r.text(r.got)} (chiesto: ${r.text(r.want)})`}</b>
          </li>
        ))}
      </ul>
      {bad.length > 0 && (
        <p className="pf-hint">
          Alcuni filtri non sono rispettati: il motivo è nelle note qui sotto. Di solito basta aumentare le misure del
          riquadro o ridurre il numero di locali.
        </p>
      )}
    </section>
  );
}
