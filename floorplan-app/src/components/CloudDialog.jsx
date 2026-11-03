import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Cloud, Copy, FolderOpen, KeyRound, LogOut, Mail, Trash2, Upload, X } from 'lucide-react';
import { shareLink } from '../lib/cloud';

/*
 * Cloud: accesso (Google, email con link o con codice), salvataggio dei progetti, riapertura e link in sola lettura per i clienti.
 * Lo stato (utente, elenco) è in hooks/useCloud.js; lo schema del database in supabase/migrations/001_cloud_projects.sql.
 */
const when = (iso) => (iso ? new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : '');

export default function CloudDialog({ cx, project, readOnly, onOpen, onSaved, onClose, say }) {
  const dialogRef = useRef(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { configured, ready, user, items, refresh, api } = cx;

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

  const sendLink = (e) => {
    e.preventDefault();
    run(async () => { await api.current.signIn(email); setSent(true); });
  };
  const sendCode = (e) => {
    e.preventDefault();
    run(async () => { await api.current.verifyCode(email, code); setCode(''); setSent(false); });
  };
  const save = () => run(async () => {
    const res = await api.current.save(project);
    onSaved({ cloudId: res.id, cloudShare: res.share_token, cloudSaved: res.updated_at });
    say?.(project.cloudId ? 'Progetto aggiornato sul cloud' : 'Progetto salvato sul cloud: da ora si salva da solo');
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
          <div className="pf-cloud-login">
            <button type="button" className="pf-mini is-accent" disabled={busy} onClick={() => run(() => api.current.signInGoogle())}>
              Continua con Google
            </button>
            <p className="pf-hint">Oppure con la tua email: ti mando un link (e un codice di 6 cifre), senza password.</p>
            <form onSubmit={sendLink} className="pf-cloud-login">
              <label className="pf-field-sm">
                <span>Email</span>
                <input className="pf-input-sm" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <button type="submit" className="pf-mini" disabled={busy || !email}><Mail size={13} /> Invia il link</button>
            </form>
            {sent && (
              <form onSubmit={sendCode} className="pf-cloud-login">
                <p className="pf-hint" role="status"><Check size={13} /> Controlla la posta: apri il link da questo browser oppure scrivi qui il codice.</p>
                <label className="pf-field-sm">
                  <span>Codice</span>
                  <input className="pf-input-sm" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" value={code}
                    onChange={(e) => setCode(e.target.value)} />
                </label>
                <button type="submit" className="pf-mini" disabled={busy || code.trim().length < 6}><KeyRound size={13} /> Entra con il codice</button>
              </form>
            )}
          </div>
        )}
        {configured && ready && user && (
          <>
            <div className="pf-cloud-user">
              <span className="pf-hint">{user.email}</span>
              <button type="button" className="pf-mini" onClick={() => run(async () => { await api.current.signOut(); })}><LogOut size={13} /> Esci</button>
            </div>
            <section className="pf-cloud-block">
              <h3>Questo progetto</h3>
              {canSave ? (
                <>
                  <p className="pf-hint">
                    «{project.name || 'Senza nome'}»{saved ? ` · salvato il ${when(saved.updated_at)} · si salva da solo` : ' · non ancora sul cloud'}
                  </p>
                  <div className="pf-security-actions">
                    <button type="button" className="pf-mini is-accent" disabled={busy} onClick={save}>
                      <Upload size={13} /> {project.cloudId ? 'Salva ora' : 'Salva sul cloud'}
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
                  {project.cloudId && project.cloudShare && <p className="pf-hint">Il link mostra l'ultima versione salvata, quindi sempre quella aggiornata.</p>}
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
