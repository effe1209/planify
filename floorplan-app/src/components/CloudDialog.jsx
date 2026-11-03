import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Cloud, Copy, FolderOpen, LogOut, Mail, Trash2, Upload, X } from 'lucide-react';
import { cloud, cloudConfigured, shareLink } from '../lib/cloud';

/*
 * Cloud: accesso con email (link magico), salvataggio dei progetti, riapertura e link in sola lettura per i clienti.
 * Lo schema del database e le regole di sicurezza: supabase/migrations/001_cloud_projects.sql.
 */
const when = (iso) => (iso ? new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : '');

export default function CloudDialog({ project, readOnly, onOpen, onSaved, onClose, say }) {
  const dialogRef = useRef(null);
  const api = useRef(null);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const configured = cloudConfigured();

  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) el.showModal?.();
    const onCancel = (e) => { e.preventDefault(); onClose(); };
    el?.addEventListener('cancel', onCancel);
    return () => el?.removeEventListener('cancel', onCancel);
  }, [onClose]);

  const run = useCallback(async (fn) => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err.message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  const refresh = useCallback(() => run(async () => { setItems(await api.current.list()); }), [run]);

  useEffect(() => {
    if (!configured) { setReady(true); return undefined; }
    let off = () => {};
    let alive = true;
    cloud().then(async (c) => {
      api.current = c;
      const u = await c.user().catch(() => null);
      if (!alive) return;
      setUser(u);
      setReady(true);
      off = c.onAuth((nu) => { setUser(nu); if (nu) refresh(); });
      if (u) refresh();
    });
    return () => { alive = false; off(); };
  }, [configured, refresh]);

  const sendLink = (e) => {
    e.preventDefault();
    run(async () => { await api.current.signIn(email); setSent(true); });
  };
  const save = () => run(async () => {
    const res = await api.current.save(project);
    onSaved({ cloudId: res.id, cloudShare: res.share_token, cloudSaved: res.updated_at });
    say?.(project.cloudId ? 'Progetto aggiornato sul cloud' : 'Progetto salvato sul cloud');
    await refresh();
  });
  const open = (id) => run(async () => {
    const { id: _local, ...p } = await api.current.open(id);
    onOpen(p);
    onClose();
  });
  const remove = (it) => {
    if (!window.confirm(`Eliminare «${it.name}» dal cloud? Il link di condivisione smette di funzionare.`)) return;
    run(async () => { await api.current.remove(it.id); await refresh(); });
  };
  const share = () => run(async () => {
    const token = await api.current.share(project.cloudId, project.cloudShare);
    onSaved({ cloudShare: token });
    await navigator.clipboard.writeText(shareLink(token));
    say?.('Link copiato: chi lo apre vede il progetto in sola lettura');
    await refresh();
  });
  const unshare = () => run(async () => {
    await api.current.unshare(project.cloudId);
    onSaved({ cloudShare: null });
    say?.('Link spento: non funziona più');
    await refresh();
  });

  const saved = project?.cloudId ? items.find((i) => i.id === project.cloudId) : null;
  const canSave = !!project && !readOnly;

  return (
    <dialog ref={dialogRef} className="pf-dialog" aria-labelledby="pf-cloud-title">
      <header className="pf-dialog-head">
        <h2 id="pf-cloud-title"><Cloud size={18} /> Cloud</h2>
        <button type="button" className="pf-icon-btn" onClick={onClose} aria-label="Chiudi"><X size={18} /></button>
      </header>
      <div className="pf-dialog-body">
        {!configured && (
          <p className="pf-hint">
            Il cloud non è ancora collegato. Servono un progetto Supabase e le due variabili <code>VITE_SUPABASE_URL</code> e
            {' '}<code>VITE_SUPABASE_ANON_KEY</code> (vedi <code>supabase/migrations</code> per lo schema). Intanto i progetti restano su questo
            browser e il link di condivisione funziona senza server.
          </p>
        )}
        {configured && !ready && <p className="pf-hint">Un attimo…</p>}
        {configured && ready && !user && (
          <form onSubmit={sendLink} className="pf-cloud-login">
            <p className="pf-hint">Entra con la tua email: ti mando un link per accedere, senza password.</p>
            <label className="pf-field-sm">
              <span>Email</span>
              <input className="pf-input-sm" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button type="submit" className="pf-mini is-accent" disabled={busy || !email}><Mail size={13} /> Invia il link</button>
            {sent && <p className="pf-hint" role="status"><Check size={13} /> Controlla la posta: apri il link da questo browser per entrare.</p>}
          </form>
        )}
        {configured && ready && user && (
          <>
            <div className="pf-cloud-user">
              <span className="pf-hint">{user.email}</span>
              <button type="button" className="pf-mini" onClick={() => run(async () => { await api.current.signOut(); setItems([]); })}><LogOut size={13} /> Esci</button>
            </div>
            <section className="pf-cloud-block">
              <h3>Questo progetto</h3>
              {canSave ? (
                <>
                  <p className="pf-hint">
                    «{project.name || 'Senza nome'}»{saved ? ` · salvato il ${when(saved.updated_at)}` : ' · non ancora sul cloud'}
                  </p>
                  <div className="pf-security-actions">
                    <button type="button" className="pf-mini is-accent" disabled={busy} onClick={save}>
                      <Upload size={13} /> {project.cloudId ? 'Aggiorna sul cloud' : 'Salva sul cloud'}
                    </button>
                    {project.cloudId && !project.cloudShare && (
                      <button type="button" className="pf-mini" disabled={busy} onClick={share}><Copy size={13} /> Crea link in sola lettura</button>
                    )}
                    {project.cloudId && project.cloudShare && (
                      <>
                        <button type="button" className="pf-mini" disabled={busy} onClick={share}><Copy size={13} /> Copia il link</button>
                        <button type="button" className="pf-mini is-danger" disabled={busy} onClick={unshare}>Spegni il link</button>
                      </>
                    )}
                  </div>
                  {project.cloudId && <p className="pf-hint">Il link mostra l'ultima versione salvata: aggiornala dopo ogni modifica.</p>}
                </>
              ) : <p className="pf-hint">Apri un progetto tuo per salvarlo sul cloud.</p>}
            </section>
            <section className="pf-cloud-block">
              <h3>I miei progetti sul cloud</h3>
              {items.length === 0 && <p className="pf-hint">Ancora nessun progetto.</p>}
              <ul className="pf-cloud-list">
                {items.map((it) => (
                  <li key={it.id}>
                    <span><strong>{it.name || 'Senza nome'}</strong> <em>{when(it.updated_at)}{it.share_token ? ' · condiviso' : ''}</em></span>
                    <button type="button" className="pf-mini" disabled={busy} onClick={() => open(it.id)}><FolderOpen size={13} /> Apri</button>
                    <button type="button" className="pf-mini is-danger" disabled={busy} onClick={() => remove(it)} aria-label={`Elimina ${it.name}`}><Trash2 size={13} /></button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
        {error && <p className="pf-warn" role="alert">{error}</p>}
      </div>
    </dialog>
  );
}
