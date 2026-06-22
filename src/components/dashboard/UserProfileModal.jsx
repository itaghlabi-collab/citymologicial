/**
 * UserProfileModal.jsx — Détail profil utilisateur connecté
 */
import { useEffect, useState } from 'react';
import { X, Loader2, User } from 'lucide-react';
import { fetchProfile } from '../../services/supabase/auth';
import { getCurrentSession } from '../../services/auth';
import { formatDate, formatDateTime } from '../../utils/formatters';

function Field({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>{value || '—'}</div>
    </div>
  );
}

export default function UserProfileModal({ user, onClose }) {
  const [profile, setProfile] = useState(null);
  const [lastSignIn, setLastSignIn] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [p, session] = await Promise.all([
          fetchProfile(user?.id),
          getCurrentSession(),
        ]);
        if (!active) return;
        setProfile(p);
        setLastSignIn(session?.user?.last_sign_in_at || null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user?.id]);

  const nom = profile?.nom || user?.nom || '—';
  const parts = nom.trim().split(/\s+/);
  const prenom = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || '—';
  const nomFamille = parts.length > 1 ? parts[parts.length - 1] : '—';

  return (
    <div className="user-profile-overlay" onClick={onClose} role="presentation">
      <div className="card user-profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="flex-between" style={{ marginBottom: 16 }}>
          <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <User size={18} /> Mon profil
          </h2>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-3)' }}>
            <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px' }} />
            Chargement…
          </div>
        ) : (
          <>
            <div className="user-profile-modal-head">
              <div className="user-profile-modal-avatar">
                {user?.initiales || user?.nom?.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem' }}>{nom}</div>
                <div style={{ fontSize: '0.84rem', color: 'var(--text-3)' }}>{profile?.email || user?.email}</div>
                <span className="badge badge-blue" style={{ marginTop: 6, fontSize: '0.7rem' }}>{profile?.role || user?.role}</span>
              </div>
            </div>
            <div className="user-profile-modal-grid">
              <Field label="Prénom" value={prenom} />
              <Field label="Nom" value={nomFamille} />
              <Field label="Email" value={profile?.email || user?.email} />
              <Field label="Téléphone" value={profile?.telephone || user?.telephone} />
              <Field label="Rôle" value={profile?.role || user?.role} />
              <Field label="Département" value={profile?.department_id ? `ID ${profile.department_id}` : '—'} />
              <Field label="Compte créé le" value={formatDate(profile?.created_at, 'medium')} />
              <Field label="Dernière connexion" value={formatDateTime(lastSignIn)} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
