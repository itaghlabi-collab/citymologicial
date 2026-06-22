/**
 * ChangePasswordModal.jsx — Changement mot de passe Supabase Auth
 */
import { useState } from 'react';
import { X, Loader2, KeyRound } from 'lucide-react';
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase';

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

export default function ChangePasswordModal({ onClose }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
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
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err?.message || 'Erreur lors du changement de mot de passe.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="user-profile-overlay" onClick={onClose} role="presentation">
      <div className="card user-profile-modal user-profile-modal--sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex-between" style={{ marginBottom: 16 }}>
          <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <KeyRound size={18} /> Changer mot de passe
          </h2>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        {success ? (
          <p style={{ color: '#2E7D32', fontSize: '0.9rem', margin: 0 }}>Mot de passe mis à jour avec succès.</p>
        ) : (
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
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                {' '}Enregistrer
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
