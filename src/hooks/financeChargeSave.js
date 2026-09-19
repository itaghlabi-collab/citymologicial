export const SAVE_TIMEOUT_MS = 20000;
export const SAVE_TIMEOUT_MESSAGE = 'L’enregistrement a pris trop de temps. Vérifiez votre connexion et réessayez.';

export function withTimeout(promise, ms, message) {
  let timer;
  const settled = Promise.resolve(promise).then(
    (value) => ({ ok: true, value }),
    (err) => ({ ok: false, err }),
  );
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(message);
      err.code = 'TIMEOUT';
      reject(err);
    }, ms);
  });
  return Promise.race([
    settled.then((res) => {
      if (res.ok) return res.value;
      throw res.err;
    }),
    timeout,
  ]).finally(() => clearTimeout(timer));
}

export function upsertChargeRecord(list, charge) {
  const rows = Array.isArray(list) ? list.filter((r) => r.id !== charge.id) : [];
  return [charge, ...rows].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}
