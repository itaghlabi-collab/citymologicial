/**
 * Routes admin utilisateurs — mot de passe + sync email auth (service_role).
 */
const express = require('express');
const { requireSupabaseSuperAdmin } = require('../middleware/supabaseAuth');
const { getSupabaseAdmin } = require('../lib/supabaseAdmin');

const router = express.Router();

router.use(requireSupabaseSuperAdmin);

async function syncAuthUserEmail(admin, userId, email) {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return null;

  const { data: authData, error: getErr } = await admin.auth.admin.getUserById(userId);
  if (getErr) throw new Error(getErr.message);
  if (!authData?.user) throw new Error('Compte Auth introuvable.');

  const current = (authData.user.email || '').toLowerCase();
  if (current === target) return { synced: false, email: target };

  const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
    email: target,
    email_confirm: true,
  });
  if (updErr) throw new Error(updErr.message);

  return { synced: true, email: target, previous: current };
}

/** POST /api/admin/users/:id/email — synchroniser auth.users.email */
router.post('/:id/email', async (req, res, next) => {
  try {
    const userId = req.params.id;
    const admin = getSupabaseAdmin();

    let targetEmail = String(req.body?.email || '').trim().toLowerCase();
    if (!targetEmail) {
      const { data: profile } = await admin.from('profiles').select('email').eq('id', userId).maybeSingle();
      targetEmail = (profile?.email || '').trim().toLowerCase();
    }

    const emailSync = await syncAuthUserEmail(admin, userId, targetEmail);
    await admin.from('profiles').update({ email: targetEmail }).eq('id', userId);

    res.json({
      ok: true,
      message: emailSync?.synced ? 'Email de connexion synchronisé.' : 'Email déjà à jour.',
      email_sync: emailSync,
    });
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/users/:id/password — définir mot de passe manuellement */
router.post('/:id/password', async (req, res, next) => {
  try {
    const { password, must_change_password } = req.body || {};
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: 'Mot de passe requis (6 caractères minimum).' });
    }

    const userId = req.params.id;
    const admin = getSupabaseAdmin();

    const { data: profile } = await admin.from('profiles').select('email').eq('id', userId).maybeSingle();
    const targetEmail = (profile?.email || '').trim().toLowerCase();
    let emailSync = null;
    if (targetEmail) {
      emailSync = await syncAuthUserEmail(admin, userId, targetEmail);
    }

    const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
      password: String(password),
    });
    if (authErr) throw new Error(authErr.message);

    const { error: profErr } = await admin
      .from('profiles')
      .update({
        must_change_password: Boolean(must_change_password),
        ...(targetEmail ? { email: targetEmail } : {}),
      })
      .eq('id', userId);
    if (profErr) throw new Error(profErr.message);

    res.json({ ok: true, message: 'Mot de passe mis à jour.', email_sync: emailSync });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
