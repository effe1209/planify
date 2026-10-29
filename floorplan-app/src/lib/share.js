/*
 * Link di condivisione in sola lettura, senza server: il progetto compresso (deflate) e codificato in base64url
 * nella parte dell'indirizzo dopo «#progetto=». Il frammento non viene mai inviato al server che ospita il sito.
 */
export const SHARE_KEY = 'progetto';

const toB64url = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

/* Solo ciò che serve a vedere il progetto: piani con piante e impostazioni di impianti e preventivo. */
export async function shareUrl(project) {
  const data = {
    v: 1,
    name: project.name || '',
    activeFloor: project.activeFloor,
    floors: project.floors.map(({ id, name, level, plan, meta }) => ({ id, name, level, plan, meta })),
    ...(project.security && { security: project.security }),
    ...(project.electric && { electric: project.electric }),
    ...(project.plumbing && { plumbing: project.plumbing }),
    ...(project.estimate && { estimate: project.estimate }),
  };
  const packed = await pipe(new TextEncoder().encode(JSON.stringify(data)), new CompressionStream('deflate-raw'));
  const url = new URL(window.location.href);
  url.hash = `${SHARE_KEY}=${toB64url(packed)}`;
  return url.toString();
}

/* Il progetto nel link aperto, o null se l'indirizzo non ne contiene uno (o è rovinato). */
export async function readSharedProject(hash = window.location.hash) {
  const m = hash.match(new RegExp(`^#${SHARE_KEY}=([A-Za-z0-9_-]+)$`));
  if (!m) return null;
  try {
    const raw = await pipe(fromB64url(m[1]), new DecompressionStream('deflate-raw'));
    const data = JSON.parse(new TextDecoder().decode(raw));
    if (!Array.isArray(data.floors) || !data.floors.length) return null;
    return { id: 'shared', name: data.name, floors: data.floors, activeFloor: data.activeFloor || data.floors[0].id,
      ...(data.security && { security: data.security }), ...(data.electric && { electric: data.electric }),
      ...(data.plumbing && { plumbing: data.plumbing }), ...(data.estimate && { estimate: data.estimate }) };
  } catch {
    return null;
  }
}
