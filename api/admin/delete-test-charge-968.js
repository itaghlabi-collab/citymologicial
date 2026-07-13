/**
 * POST /api/admin/delete-test-charge-968
 * Suppression unique : CHG-2026-968 (test, 10,96 MAD, 2026-07-11).
 */
import { getSupabaseAdmin } from '../../lib/supabaseAdminVercel.mjs';

const REF = 'CHG-2026-968';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  try {
    const admin = getSupabaseAdmin();
    const { data: charge, error: findErr } = await admin
      .from('finance_charges')
      .select('id, ref_charge, libelle, montant, date_charge')
      .eq('ref_charge', REF)
      .maybeSingle();

    if (findErr) throw findErr;
    if (!charge) {
      return res.status(404).json({ ok: false, message: 'Charge introuvable (déjà supprimée ?).' });
    }

    const libelleOk = String(charge.libelle || '').trim().toLowerCase() === 'test';
    const montantOk = Math.abs(Number(charge.montant) - 10.96) < 0.01;
    const dateOk = String(charge.date_charge || '').startsWith('2026-07-11');

    if (!libelleOk || !montantOk || !dateOk) {
      return res.status(409).json({
        ok: false,
        message: 'Enregistrement ne correspond pas au test attendu — suppression annulée.',
      });
    }

    const id = charge.id;

    await admin
      .from('project_expenses')
      .delete()
      .eq('source_type', 'finance_charge')
      .eq('source_id', id);

    await admin
      .from('finance_transactions')
      .delete()
      .or(`charge_id.eq.${id},and(source_type.eq.charge,source_id.eq.${id})`);

    const { error: delErr } = await admin.from('finance_charges').delete().eq('id', id);
    if (delErr) throw delErr;

    return res.status(200).json({ ok: true, deleted: REF, id });
  } catch (err) {
    console.error('[CITYMO] delete-test-charge-968', err);
    return res.status(500).json({ ok: false, error: err.message || 'Erreur suppression.' });
  }
}
