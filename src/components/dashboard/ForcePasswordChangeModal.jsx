/**
 * ForcePasswordChangeModal.jsx — Obligatoire à la première connexion.
 */
import { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase';
import { clearMustChangePassword } from '../../services/admin/users';

const INPUT_S = {
  padding: '9px 12px',
  width: '100%',
  outline: 'none',
  fontFamily: 'var(--font-body)',
  fontSize: '0.9rem',
  border: '1.5px solid var(--border)',
  borderRadius: 'var(--radius)',
  background: '#fff',
  boxSizing: 'border-box',
};

export default function ForcePasswordChangeModal({ user, onComplete }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    if (!isSupabaseConfigured()) {
      setError('Supabase non configuré.');
      return;
    }
    setSaving(true);
    try {
      const { error: authErr } = await getSupabase().auth.updateUser({ password });
      if (authErr) throw authErr;
      await clearMustChangePassword(user.id);
      onComplete?.({ ...user, must_change_password: false });
    } catch (err) {
      setError(err?.message || 'Erreur lors du changement de mot de passe.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="user-profile-overlay" style={{ zIndex: 3000 }} role="presentation">
      <div className="card user-profile-modal user-profile-modal--sm" onClick={(e) => e.stopPropagation()}>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <KeyRound size={18} /> Changement de mot de passe requis
          </h2>
          <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-2)' }}>
            Pour des raisons de sécurité, définissez un nouveau mot de passe avant d&apos;accéder à l&apos;application.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 6 }}>Nouveau mot de passe</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={INPUT_S} autoComplete="new-password" required />
          </div>
          <div>
            <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 6 }}>Confirmer</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={INPUT_S} autoComplete="new-password" required />
          </div>
          {error && <p style={{ color: 'var(--red)', fontSize: '0.82rem', margin: 0 }}>{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%' }}>
            {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null}
            {' '}Enregistrer et continuer
          </button>
        </form>
      </div>
    </div>
  );
}
