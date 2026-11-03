/*
 * Cloud (Supabase): account con email e link magico, progetti salvati per utente e link di condivisione in sola lettura
 * (#cloud=<token>). Senza VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY il cloud resta spento e l'app funziona come prima.
 * Lo schema e le regole di sicurezza sono in supabase/migrations/001_cloud_projects.sql; `makeCloud` prende il client da fuori
 * così si prova senza rete.
 */
import { projectFromPayload, sharePayload } from './share';

export const CLOUD_KEY = 'cloud';

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
export const cloudConfigured = () => !!(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY);

/* Token del link in sola lettura: 24 byte casuali, in base64url (non si indovina). */
export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const shareLink = (token, base = window.location.href) => {
  const url = new URL(base);
  url.search = '';
  url.hash = `${CLOUD_KEY}=${token}`;
  return url.toString();
};

/* Il token nell'indirizzo (#cloud=…), o null. */
export const cloudTokenFrom = (hash = window.location.hash) => hash.match(new RegExp(`^#${CLOUD_KEY}=([A-Za-z0-9_-]{16,})$`))?.[1] ?? null;

let clientPromise = null;
/* Il client reale, creato alla prima richiesta (la libreria si scarica solo se serve). */
export function getClient() {
  if (!cloudConfigured()) return Promise.resolve(null);
  clientPromise ||= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }));
  return clientPromise;
}

/* Il progetto è cambiato (o sparito) sul cloud dopo l'ultimo salvataggio di questo browser. */
export class CloudConflict extends Error {
  constructor() {
    super('Sul cloud c\'è una versione più recente di questo progetto.');
    this.conflict = true;
  }
}

const fail = (error) => { if (error) throw new Error(error.message || String(error)); };

export function makeCloud(client) {
  const t = client.from.bind(client);
  return {
    async signIn(email, redirectTo = window.location.origin + window.location.pathname) {
      const { error } = await client.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo } });
      fail(error);
    },
    /* accesso con il codice di 6 cifre dell'email (vale se il modello dell'email di Supabase contiene {{ .Token }}) */
    async verifyCode(email, code) {
      const { error } = await client.auth.verifyOtp({ email: email.trim(), token: String(code).trim(), type: 'email' });
      fail(error);
    },
    async signInGoogle(redirectTo = window.location.origin + window.location.pathname) {
      const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
      fail(error);
    },
    async user() {
      const { data, error } = await client.auth.getSession();
      fail(error);
      return data.session?.user ?? null;
    },
    onAuth(cb) {
      const { data } = client.auth.onAuthStateChange((_event, session) => cb(session?.user ?? null));
      return () => data.subscription.unsubscribe();
    },
    async signOut() { fail((await client.auth.signOut()).error); },

    /* i miei progetti, i più recenti per primi (senza i dati, che sono pesanti) */
    async list() {
      const { data, error } = await t('projects').select('id, name, share_token, updated_at').order('updated_at', { ascending: false });
      fail(error);
      return data;
    },
    /*
     * Crea (senza cloudId) o aggiorna il progetto; ritorna { id, share_token, updated_at }.
     * L'aggiornamento vale solo se sul cloud c'è ancora la versione che questo browser ha salvato per ultima (cloudSaved):
     * altrimenti CloudConflict, e `force` sovrascrive comunque.
     */
    async save(project, { force = false } = {}) {
      const row = { name: project.name || 'Senza nome', data: sharePayload(project) };
      if (!project.cloudId) {
        const { data, error } = await t('projects').insert(row).select('id, share_token, updated_at').single();
        fail(error);
        return data;
      }
      let q = t('projects').update(row).eq('id', project.cloudId);
      if (!force && project.cloudSaved) q = q.eq('updated_at', project.cloudSaved);
      const { data, error } = await q.select('id, share_token, updated_at').maybeSingle();
      fail(error);
      if (!data) throw new CloudConflict();
      return data;
    },
    async open(id) {
      const { data, error } = await t('projects').select('id, name, data, share_token, updated_at').eq('id', id).single();
      fail(error);
      return { ...projectFromPayload(data.data, undefined), name: data.name, cloudId: data.id, cloudShare: data.share_token, cloudSaved: data.updated_at };
    },
    async remove(id) { fail((await t('projects').delete().eq('id', id)).error); },
    /* accende il link in sola lettura (il token resta lo stesso finché non lo si spegne) */
    async share(id, existing) {
      if (existing) return existing;
      const token = newToken();
      const { error } = await t('projects').update({ share_token: token }).eq('id', id);
      fail(error);
      return token;
    },
    async unshare(id) { fail((await t('projects').update({ share_token: null }).eq('id', id)).error); },
    /* il progetto di un link, senza account (funzione del database: legge solo quel token) */
    async shared(token) {
      const { data, error } = await client.rpc('get_shared_project', { token });
      fail(error);
      const p = data && projectFromPayload(data.data);
      return p ? { ...p, name: data.name || p.name, cloudToken: token } : null;
    },
  };
}

export async function cloud() {
  const client = await getClient();
  return client ? makeCloud(client) : null;
}
