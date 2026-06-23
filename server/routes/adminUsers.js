/**
 * Routes admin utilisateurs — mot de passe (service_role côté serveur uniquement).
 */
const express = require('express');
const { requireSupabaseSuperAdmin } = require('../middleware/supabaseAuth');
const { getSupabaseAdmin } = require('../lib/supabaseAdmin');

const router = express.Router();

router.use(requireSupabaseSuperAdmin);

/** POST /api/admin/users/:id/password — définir mot de passe manuellement */
router.post('/:id/password', async (req, res, next) => {
  try {
    const { password, must_change_password } = req.body || {};
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: 'Mot de passe requis (6 caractères minimum).' });
    }

    const userId = req.params.id;
    const admin = getSupabaseAdmin();

    const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
      password: String(password),
    });
    if (authErr) throw new Error(authErr.message);

    const { error: profErr } = await admin
      .from('profiles')
      .update({ must_change_password: Boolean(must_change_password) })
      .eq('id', userId);
    if (profErr) throw new Error(profErr.message);

    res.json({ ok: true, message: 'Mot de passe mis à jour.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
