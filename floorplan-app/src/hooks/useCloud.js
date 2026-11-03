import { useCallback, useEffect, useRef, useState } from 'react';
import { cloud, cloudConfigured } from '../lib/cloud';

/* Il cloud nell'app: se è collegato, chi è dentro e i suoi progetti sul cloud (senza i dati). */
export function useCloud() {
  const configured = cloudConfigured();
  const apiRef = useRef(null);
  const [ready, setReady] = useState(!configured);
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);

  const refresh = useCallback(async () => {
    if (!apiRef.current) return;
    try { setItems(await apiRef.current.list()); } catch { /* offline: resta l'elenco di prima */ }
  }, []);

  useEffect(() => {
    if (!configured) return undefined;
    let off = () => {};
    let alive = true;
    cloud().then(async (c) => {
      if (!alive || !c) return;
      apiRef.current = c;
      const u = await c.user().catch(() => null);
      if (!alive) return;
      setUser(u);
      setReady(true);
      if (u) refresh();
      off = c.onAuth((nu) => { setUser(nu); if (nu) refresh(); else setItems([]); });
    });
    return () => { alive = false; off(); };
  }, [configured, refresh]);

  return { configured, ready, user, items, refresh, api: apiRef };
}
