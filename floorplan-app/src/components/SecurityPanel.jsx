import { Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { billOfMaterials, DEVICE_STYLE } from '../lib/ajax';

/*
 * Allarme Ajax: avvia la disposizione ottimale dei dispositivi sul progetto (tutti i piani), aggiunge
 * volumetrici, imposta lo stato delle porte interne per il calcolo e mostra legenda e distinta materiali.
 */
export default function SecurityPanel({ project, floorId, onPlan, onClear, doors = 'closed', onDoors, onAddSensor, roomName }) {
  const devices = project.security?.devices || [];
  const bom = billOfMaterials(project, devices);
  const here = devices.filter((d) => d.floor === floorId).length;

  return (
    <section className="pf-sec pf-security">
      <h2>Allarme Ajax</h2>
      {!devices.length ? (
        <p className="pf-hint">
          Analizza stanze, porte e finestre di tutti i piani e posiziona i dispositivi Ajax Systems più adatti:
          contatti sui varchi, volumetrici, antincendio, allagamento, centrale e tastiera.
        </p>
      ) : (
        <p className="pf-hint">
          <b>{devices.length}</b> dispositivi nel progetto, <b>{here}</b> su questo piano. Clicca un dispositivo
          per spostarlo, ruotarlo o cambiarne modello e altezza.
        </p>
      )}
      {devices.length > 0 && onDoors && (
        <label className="pf-field-sm">
          <span>Porte interne ad allarme inserito</span>
          <select className="pf-input-sm" value={typeof doors === 'string' ? doors : 'closed'} onChange={(e) => onDoors(e.target.value)}>
            <option value="closed">Chiuse (caso peggiore)</option>
            <option value="open">Aperte</option>
          </select>
        </label>
      )}
      <div className="pf-security-actions">
        <button type="button" className="pf-btn-add" onClick={onPlan}>
          <ShieldCheck size={14} /> {devices.length ? 'Ricalcola disposizione' : 'Disposizione ottimale allarme'}
        </button>
        {devices.length > 0 && onAddSensor && (
          <button type="button" className="pf-mini" onClick={onAddSensor}
            title={roomName ? `Aggiungi un MotionProtect in «${roomName}»` : 'Aggiungi un MotionProtect (seleziona prima un locale)'}>
            <Plus size={13} /> Volumetrico{roomName ? ` in ${roomName}` : ''}
          </button>
        )}
        {devices.length > 0 && (
          <button type="button" className="pf-mini" onClick={onClear} title="Rimuovi i dispositivi dal progetto"
            aria-label="Rimuovi i dispositivi"><Trash2 size={13} /></button>
        )}
      </div>

      {bom.length > 0 && (
        <>
          <ul className="pf-dev-legend">
            {bom.map((r) => {
              const st = DEVICE_STYLE[r.model.id];
              return (
                <li key={r.model.id} title={r.model.use}>
                  <i style={{ background: st.color }}>{st.tag}</i>
                  <span>{r.model.name}</span>
                  <b>×{r.qty}</b>
                </li>
              );
            })}
          </ul>
          <details className="pf-bom">
            <summary>Distinta materiali</summary>
            <table>
              <thead>
                <tr><th>Modello</th><th>Q.tà</th><th>Posizione e scopo</th></tr>
              </thead>
              <tbody>
                {bom.map((r) => (
                  <tr key={r.model.id}>
                    <td><b>{r.model.name}</b><small>{r.model.type}</small></td>
                    <td>{r.qty}</td>
                    <td>{r.places.join(', ')}<small>{r.purposes.join(' · ')}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}
