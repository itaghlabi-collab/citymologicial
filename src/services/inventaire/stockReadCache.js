/**
 * Cache mémoire des lectures stock (par session utilisateur).
 * Invalidé après mutation et changement de compte.
 * Une erreur n'est jamais enregistrée comme liste vide.
 */

const TTL_MS = 8000;

let epoch = 0;
let sessionKey = '';

/** @type {Record<string, { data: unknown, at: number, key: string, inFlight: Promise<unknown> | null }>} */
const stores = Object.create(null);

function getStore(name) {
  if (!stores[name]) {
    stores[name] = { data: null, at: 0, key: '', inFlight: null };
  }
  return stores[name];
}

export function setStockReadSessionKey(key) {
  const next = String(key || '');
  if (next !== sessionKey) {
    sessionKey = next;
    invalidateStockReadCaches();
  }
}

export function getStockReadSessionKey() {
  return sessionKey;
}

export function invalidateStockReadCaches() {
  epoch += 1;
  Object.keys(stores).forEach((name) => {
    const s = stores[name];
    s.data = null;
    s.at = 0;
    s.key = '';
    s.inFlight = null;
  });
}

export function peekStockReadCache(name) {
  const s = stores[name];
  if (!s || s.data == null || s.key !== sessionKey) return null;
  if (Date.now() - s.at >= TTL_MS) return null;
  return s.data;
}

export async function cachedStockRead(name, { force = false } = {}, fetcher) {
  const s = getStore(name);
  const key = sessionKey;

  if (!force && s.data != null && s.key === key && (Date.now() - s.at) < TTL_MS) {
    return s.data;
  }
  if (!force && s.inFlight && s.key === key) {
    return s.inFlight;
  }

  const startedEpoch = epoch;
  const promise = Promise.resolve()
    .then(() => fetcher())
    .then((data) => {
      if (startedEpoch === epoch) {
        s.data = data;
        s.at = Date.now();
        s.key = key;
      }
      return data;
    });

  s.inFlight = promise;
  s.key = key;
  try {
    return await promise;
  } finally {
    if (s.inFlight === promise) s.inFlight = null;
  }
}
