/**
 * Administration.jsx — Routeur module Administration ERP CITYMO
 * Sous-modules : Utilisateurs · Rôles & Permissions · Sauvegardes
 */
import { Shield } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { isSuperAdmin } from '../services/rh/isSuperAdmin';
import { useAdministration } from '../hooks/useAdministration';
import Utilisateurs from './administration/Utilisateurs.jsx';
import Roles from './administration/Roles.jsx';
import Sauvegardes from './administration/Sauvegardes.jsx';

export default function Administration({ activeTab }) {
  const tab = activeTab || 'utilisateurs';
  const { user } = useAuth();
  const admin = useAdministration();
  const canManage = isSuperAdmin(user);

  if (!admin.configured) {
    return (
      <div className="card" style={{ padding: 32, textAlign: 'center' }}>
        <Shield size={32} style={{ color: 'var(--text-3)', marginBottom: 12 }} />
        <p style={{ margin: 0, color: 'var(--text-2)' }}>Supabase non configuré — module Administration indisponible.</p>
      </div>
    );
  }

  if (admin.loading) {
    return (
      <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>
        Chargement Administration…
      </div>
    );
  }

  if (admin.error && !admin.users.length && !admin.roles.length) {
    return (
      <div className="card" style={{ padding: 32, textAlign: 'center' }}>
        <p style={{ color: 'var(--red)', marginBottom: 8 }}>{admin.error}</p>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-3)' }}>
          Exécutez <code>supabase/migrations/20260622120000_administration_schema.sql</code> dans Supabase SQL Editor.
        </p>
        <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={admin.reload}>
          Réessayer
        </button>
      </div>
    );
  }

  const shared = {
    ...admin,
    canManage,
    currentUser: user,
  };

  return (
    <div>
      {!canManage && (
        <div style={{ marginBottom: 14, padding: '10px 14px', background: '#FFF8E1', border: '1px solid #FFE082', borderRadius: 8, fontSize: '0.82rem', color: '#E65100' }}>
          Mode lecture seule — seuls les Super Admin peuvent modifier utilisateurs, rôles et sauvegardes.
        </div>
      )}
      {tab === 'utilisateurs' && <Utilisateurs {...shared} />}
      {tab === 'roles' && <Roles {...shared} />}
      {tab === 'sauvegardes' && <Sauvegardes {...shared} />}
    </div>
  );
}
