/* Cloud: il modulo si prova con un finto client (lib/cloud.js). */
import assert from 'node:assert/strict';
import { cloudTokenFrom, makeCloud, newToken, shareLink } from '../src/lib/cloud.js';

const token = newToken();
assert.match(token, /^[A-Za-z0-9_-]{32}$/);
assert.notEqual(token, newToken());
assert.equal(cloudTokenFrom(`#cloud=${token}`), token);
assert.equal(cloudTokenFrom('#cloud=corto'), null);
assert.equal(cloudTokenFrom('#progetto=abc'), null);
assert.equal(shareLink(token, 'https://x.it/app?y=1#a'), `https://x.it/app#cloud=${token}`);

// finto client: registra le chiamate
const calls = [];
const rows = new Map();
const chain = (table, op, payload) => {
  const c = { eqs: [], select(cols) { c.cols = cols; return c; }, eq(k, v) { c.eqs.push([k, v]); return c; }, order() { return c; },
    single() { return c.then((r) => ({ data: Array.isArray(r.data) ? r.data[0] : r.data, error: r.error })); },
    then(res, rej) {
      calls.push({ table, op, payload, eqs: c.eqs });
      let data = null;
      if (op === 'insert') { data = { id: 'new-id', share_token: null, updated_at: 't', ...payload }; rows.set('new-id', data); }
      if (op === 'select') data = c.eqs.length ? { id: c.eqs[0][1], name: 'P', data: payload?.data ?? rows.get(c.eqs[0][1])?.data, share_token: null, updated_at: 't' } : [...rows.values()];
      if (op === 'update') data = { id: c.eqs[0]?.[1], share_token: payload.share_token ?? null, updated_at: 't2' };
      return Promise.resolve({ data, error: null }).then(res, rej);
    } };
  return c;
};
const client = {
  from: (table) => ({ select: () => chain(table, 'select'), insert: (p) => chain(table, 'insert', p), update: (p) => chain(table, 'update', p), delete: () => chain(table, 'delete') }),
  rpc: async (fn, args) => ({ data: fn === 'get_shared_project' && args.token === token
    ? { name: 'Casa', data: { floors: [{ id: 'f1', name: 'T', level: 0, plan: {}, meta: {} }] }, updated_at: 't' } : null, error: null }),
  auth: { signInWithOtp: async (a) => { calls.push({ auth: a }); return { error: null }; }, getSession: async () => ({ data: { session: { user: { id: 'u' } } }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({ error: null }) },
};
const c = makeCloud(client);
const project = { id: 'local', name: 'Casa', activeFloor: 'f1', floors: [{ id: 'f1', name: 'T', level: 0, plan: { rooms: [] }, meta: {} }], cloudId: undefined, secret: 'non va nel cloud' };

await c.signIn(' a@b.it ', 'https://x.it/');
assert.equal(calls.at(-1).auth.email, 'a@b.it');
assert.equal((await c.user()).id, 'u');

const saved = await c.save(project);
assert.equal(saved.id, 'new-id');
const ins = calls.find((x) => x.op === 'insert');
assert.equal(ins.payload.name, 'Casa');
assert.equal(ins.payload.data.floors[0].id, 'f1');
assert.ok(!('secret' in ins.payload.data), 'nel cloud solo ciò che serve a vedere il progetto');

await c.save({ ...project, cloudId: 'new-id' });
const upd = calls.filter((x) => x.op === 'update').at(-1);
assert.deepEqual(upd.eqs, [['id', 'new-id']]);

const opened = await c.open('new-id');
assert.equal(opened.cloudId, 'new-id');
assert.equal(opened.floors.length, 1);

assert.equal(await c.share('new-id', 'esistente'), 'esistente', 'il token resta lo stesso');
const tk = await c.share('new-id', null);
assert.match(tk, /^[A-Za-z0-9_-]{32}$/);
await c.unshare('new-id');
assert.equal(calls.filter((x) => x.op === 'update').at(-1).payload.share_token, null);

const sh = await c.shared(token);
assert.equal(sh.name, 'Casa');
assert.equal(sh.cloudToken, token);
assert.equal(await c.shared('token-sbagliato-0000000000'), null);
console.log('cloud ok');
