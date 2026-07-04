/**
 * Définir le mot de passe utilisateur — exécution native Vercel (sans Railway).
 * Synchronise aussi auth.users.email depuis le profil ERP si différent.
 */
import { getSupabaseAdmin, requireSupabaseSuperAdmin } from './supabaseAdminVercel.mjs';
import { setAuthUserPassword, syncAuthUserEmail } from './adminAuthUserVercel.mjs';

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

export async function handleAdminSetPassword(req, res, userId) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await requireSupabaseSuperAdmin(req);

    const { password, must_change_password, email } = await readJsonBody(req);
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: 'Mot de passe requis (6 caractères minimum).' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'Identifiant utilisateur requis.' });
    }

    const admin = getSupabaseAdmin();

    let targetEmail = String(email || '').trim().toLowerCase();
    if (!targetEmail) {
      const { data: profile } = await admin.from('profiles').select('email').eq('id', userId).maybeSingle();
      targetEmail = (profile?.email || '').trim().toLowerCase();
    }

    let emailSync = null;
    if (targetEmail) {
      emailSync = await syncAuthUserEmail(admin, userId, targetEmail);
    }

    await setAuthUserPassword(admin, userId, password);

    const { error: profErr } = await admin
      .from('profiles')
      .update({
        must_change_password: Boolean(must_change_password),
        ...(targetEmail ? { email: targetEmail } : {}),
      })
      .eq('id', userId);
    if (profErr) {
      return res.status(400).json({ error: profErr.message });
    }

    return res.status(200).json({
      ok: true,
      message: 'Mot de passe mis à jour.',
      email_sync: emailSync,
    });
  } catch (err) {
    const status = err.status || 500;
    if (status === 500 && err.message?.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      return res.status(503).json({
        error: 'SUPABASE_SERVICE_ROLE_KEY manquant sur Vercel (Settings → Environment Variables).',
      });
    }
    return res.status(status).json({ error: err.message || 'Erreur serveur.' });
  }
}

export async function handleAdminSyncEmail(req, res, userId) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await requireSupabaseSuperAdmin(req);

    if (!userId) {
      return res.status(400).json({ error: 'Identifiant utilisateur requis.' });
    }

    const { email } = await readJsonBody(req);
    const admin = getSupabaseAdmin();

    let targetEmail = String(email || '').trim().toLowerCase();
    if (!targetEmail) {
      const { data: profile } = await admin.from('profiles').select('email').eq('id', userId).maybeSingle();
      targetEmail = (profile?.email || '').trim().toLowerCase();
    }

    const emailSync = await syncAuthUserEmail(admin, userId, targetEmail);

    await admin.from('profiles').update({ email: targetEmail }).eq('id', userId);

    return res.status(200).json({
      ok: true,
      message: emailSync.synced ? 'Email de connexion synchronisé.' : 'Email déjà à jour.',
      email_sync: emailSync,
    });
  } catch (err) {
    const status = err.status || 500;
    if (status === 500 && err.message?.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      return res.status(503).json({
        error: 'SUPABASE_SERVICE_ROLE_KEY manquant sur Vercel (Settings → Environment Variables).',
      });
    }
    return res.status(status).json({ error: err.message || 'Erreur serveur.' });
  }
}
