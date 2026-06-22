/**
 * Roles.jsx — Gestion RBAC Rôles & Permissions ERP CITYMO (Supabase).
 */
import { useState, useCallback } from 'react';
import { Shield, Plus, Edit2, Trash2, Eye, Copy, Download, ChevronLeft, CheckSquare, Square, ToggleLeft } from 'lucide-react';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE, MODULES_ERP, ACTIONS_PERMS,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow, InfoRow,
} from './shared.jsx';
import { emptyPermissionMatrix, fullPermissionMatrix } from '../../services/admin/constants';
import {
  createRole,
  updateRole,
  deleteRole,
  toggleRoleStatut,
  duplicateRole,
} from '../../services/admin/roles';

const EMPTY_FORM = { nom: '', description: '', statut: 'Actif', est_admin: false, permissions: emptyPermissionMatrix() };

function PermMatrix({ permissions, onChange, readOnly }) {
  function togglePerm(mod, action) {
    if (readOnly) return;
    const next = {
      ...permissions,
      [mod]: { ...permissions[mod], [action]: !permissions[mod][action] },
    };
    onChange(next);
  }
  function toggleAll(mod) {
    if (readOnly) return;
    const allOn = ACTIONS_PERMS.every((a) => permissions[mod][a]);
    const next = { ...permissions, [mod]: {} };
    ACTIONS_PERMS.forEach((a) => { next[mod][a] = !allOn; });
    onChange(next);
  }
  function toggleAction(action) {
    if (readOnly) return;
    const allOn = MODULES_ERP.every((m) => permissions[m][action]);
    const next = { ...permissions };
    MODULES_ERP.forEach((m) => { next[m] = { ...next[m], [action]: !allOn }; });
    onChange(next);
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
        <thead>
          <tr style={{ background: 'var(--surface-2)' }}>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-3)', fontSize: '0.72rem', textTransform: 'uppercase', minWidth: 130 }}>Module</th>
            {ACTIONS_PERMS.map((a) => (
              <th key={a} style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: 'var(--text-3)', fontSize: '0.7rem', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                {!readOnly ? (
                  <button type="button" onClick={() => toggleAction(a)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 3, margin: '0 auto' }} title="Tout activer/désactiver">
                    {a}
                  </button>
                ) : a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MODULES_ERP.map((mod, idx) => {
            const allOn = ACTIONS_PERMS.every((a) => permissions[mod] && permissions[mod][a]);
            return (
              <tr key={mod} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? '#fff' : 'var(--surface-2)' }}>
                <td style={{ padding: '8px 12px', fontWeight: 600, fontSize: '0.82rem' }}>
                  {!readOnly ? (
                    <button type="button" onClick={() => toggleAll(mod)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: allOn ? 'var(--red)' : 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {allOn ? <CheckSquare size={13} /> : <Square size={13} />}
                      {mod}
                    </button>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {allOn ? <CheckSquare size={13} style={{ color: 'var(--red)' }} /> : <Square size={13} style={{ color: 'var(--text-3)' }} />}
                      {mod}
                    </span>
                  )}
                </td>
                {ACTIONS_PERMS.map((a) => {
                  const on = permissions[mod] && permissions[mod][a];
                  return (
                    <td key={a} style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => togglePerm(mod, a)}
                        disabled={readOnly}
                        style={{ background: 'none', border: 'none', cursor: readOnly ? 'default' : 'pointer', color: on ? 'var(--red)' : 'var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        {on ? <CheckSquare size={16} /> : <Square size={16} />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RoleForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial || { ...EMPTY_FORM, permissions: emptyPermissionMatrix() });
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  function handleAdminToggle(val) {
    set('est_admin', val);
    set('permissions', val ? fullPermissionMatrix() : emptyPermissionMatrix());
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    if (!form.nom.trim()) { setErrors({ nom: 'Requis' }); return; }
    onSave(form);
  }

  return (
    <form onSubmit={handleSubmit}>
      <SectionTitle icon={<Shield size={12} />}>Informations du rôle</SectionTitle>
      <FRow>
        <FField label="Nom du rôle" required>
          <input value={form.nom} onChange={(e) => set('nom', e.target.value)} placeholder="Ex: Chef de projet..." style={{ ...INPUT_STYLE, borderColor: errors.nom ? 'var(--red)' : 'var(--border)' }} />
          {errors.nom && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.nom}</div>}
        </FField>
        <FField label="Statut">
          <select value={form.statut} onChange={(e) => set('statut', e.target.value)} style={SELECT_STYLE}>
            <option value="Actif">Actif</option>
            <option value="Inactif">Inactif</option>
          </select>
        </FField>
        <FField label="Accès administrateur">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer', fontSize: '0.85rem' }}>
            <input type="checkbox" checked={!!form.est_admin} onChange={(e) => handleAdminToggle(e.target.checked)} style={{ width: 16, height: 16 }} />
            Super Admin (accès complet)
          </label>
        </FField>
      </FRow>
      <div style={{ marginBottom: 16 }}>
        <FField label="Description">
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Description du rôle..." style={{ ...TEXTAREA_STYLE, minHeight: 56 }} />
        </FField>
      </div>

      <SectionTitle icon={<Shield size={12} />}>Matrice de permissions</SectionTitle>
      <div style={{ marginBottom: 20, border: '1.5px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <PermMatrix permissions={form.permissions} onChange={(v) => set('permissions', v)} readOnly={!!form.est_admin} />
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> {saving ? 'Enregistrement…' : (initial ? 'Enregistrer' : 'Créer rôle')}
        </button>
      </div>
    </form>
  );
}

function DetailRole({ role, users, onBack, onEdit }) {
  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}><ChevronLeft size={15} /> Retour</button>
        <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', flex: 1 }}>{role.nom}</h2>
        <span className={`badge ${role.statut === 'Actif' ? 'badge-green' : 'badge-grey'}`} style={{ fontSize: '0.72rem' }}>{role.statut}</span>
        {role.est_admin && <span className="badge badge-red" style={{ fontSize: '0.72rem' }}>Super Admin</span>}
        <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}><Edit2 size={13} /> Modifier</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 16, alignItems: 'start' }}>
        <div className="card">
          <SectionTitle icon={<Shield size={12} />}>Matrice de permissions</SectionTitle>
          <div style={{ border: '1.5px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <PermMatrix permissions={role.permissions || emptyPermissionMatrix()} onChange={() => {}} readOnly />
          </div>
        </div>
        <div className="card">
          <SectionTitle>Informations</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <InfoRow label="Code" value={role.code} />
            <InfoRow label="Statut" value={role.statut} />
            <InfoRow label="Date création" value={role.date_creation} />
            <InfoRow label="Utilisateurs" value={String((users || []).filter((u) => String(u.role_id) === String(role.id)).length)} />
            {role.description && <InfoRow label="Description" value={role.description} />}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Roles({ users = [], roles = [], setRoles, reload, canManage }) {
  const [showModal, setShowModal] = useState(false);
  const [editRole, setEditRole] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const handleSave = useCallback(async (data) => {
    if (!canManage) return;
    setSaving(true);
    setMsg('');
    try {
      const saved = editRole
        ? await updateRole(editRole.id, data)
        : await createRole(data);
      setRoles((prev) => {
        const exists = prev.some((r) => r.id === saved.id);
        return exists ? prev.map((r) => (r.id === saved.id ? saved : r)) : [...prev, saved];
      });
      setShowModal(false);
      setEditRole(null);
      reload?.();
    } catch (err) {
      setMsg(err.message || 'Erreur enregistrement rôle');
    } finally {
      setSaving(false);
    }
  }, [canManage, editRole, reload, setRoles]);

  async function handleDelete(id) {
    if (!canManage || !window.confirm('Supprimer ce rôle ?')) return;
    try {
      await deleteRole(id);
      setRoles((prev) => prev.filter((x) => x.id !== id));
      setDetailId(null);
      reload?.();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDupliquer(role) {
    if (!canManage) return;
    try {
      const copy = await duplicateRole(role);
      setRoles((prev) => [...prev, copy]);
      reload?.();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleToggleStatut(id, currentStatut) {
    if (!canManage) return;
    try {
      const next = await toggleRoleStatut(id, currentStatut);
      setRoles((prev) => prev.map((x) => (x.id === id ? { ...x, statut: next } : x)));
    } catch (err) {
      alert(err.message);
    }
  }

  const total = roles.length;
  const actifs = roles.filter((x) => x.statut === 'Actif').length;
  const permsCount = roles.reduce((s, r) => {
    let c = 0;
    if (r.permissions) MODULES_ERP.forEach((m) => ACTIONS_PERMS.forEach((a) => { if (r.permissions[m] && r.permissions[m][a]) c++; }));
    return s + c;
  }, 0);
  const usersAffectes = (users || []).filter((u) => u.role_id).length;

  if (detailId) {
    const role = roles.find((x) => x.id === detailId);
    if (!role) { setDetailId(null); return null; }
    return (
      <DetailRole
        role={role}
        users={users}
        onBack={() => setDetailId(null)}
        onEdit={() => { if (canManage) { setEditRole(role); setShowModal(true); setDetailId(null); } }}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">RÔLES & PERMISSIONS</h1>
          <p className="page-subtitle">Chaque utilisateur hérite des permissions de son rôle.</p>
        </div>
        {canManage && (
          <button type="button" className="btn btn-primary" onClick={() => { setEditRole(null); setShowModal(true); }}>
            <Plus size={15} /> Ajouter rôle
          </button>
        )}
      </div>

      {msg && <div style={{ marginBottom: 12, padding: 10, background: 'var(--red-light)', color: 'var(--red)', borderRadius: 8, fontSize: '0.84rem' }}>{msg}</div>}

      <div className="stat-grid finance-kpi-grid" style={{ marginBottom: 20 }}>
        <KpiCard icon={<Shield size={17} />} label="Total rôles" value={total} color="grey" />
        <KpiCard icon={<Shield size={17} />} label="Rôles actifs" value={actifs} color="green" />
        <KpiCard icon={<CheckSquare size={17} />} label="Permissions actives" value={permsCount} color="blue" />
        <KpiCard icon={<Shield size={17} />} label="Utilisateurs liés" value={usersAffectes} color="orange" />
      </div>

      <div className="card" style={{ padding: 0 }}>
        {roles.length === 0 ? (
          <EmptyState icon={<Shield size={24} />} title="Aucun rôle défini" sub="Exécutez la migration Administration dans Supabase" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rôle</th>
                  <th>Description</th>
                  <th>Utilisateurs</th>
                  <th>Permissions</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => {
                  const nbPerms = (() => { let c = 0; if (r.permissions) MODULES_ERP.forEach((m) => ACTIONS_PERMS.forEach((a) => { if (r.permissions[m] && r.permissions[m][a]) c++; })); return c; })();
                  const nbUsers = (users || []).filter((u) => String(u.role_id) === String(r.id)).length;
                  return (
                    <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setDetailId(r.id)}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 34, height: 34, borderRadius: 8, background: r.est_admin ? 'var(--red-light)' : '#E3F2FD', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Shield size={15} style={{ color: r.est_admin ? 'var(--red)' : '#1565C0' }} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.87rem' }}>{r.nom}</div>
                            {r.est_admin && <span style={{ fontSize: '0.68rem', color: 'var(--red)', fontWeight: 700 }}>SUPER ADMIN</span>}
                          </div>
                        </div>
                      </td>
                      <td data-label="Description" style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>
                        {r.description ? (r.description.length > 60 ? `${r.description.slice(0, 60)}...` : r.description) : '—'}
                      </td>
                      <td data-label="Utilisateurs"><span style={{ fontWeight: 700 }}>{nbUsers}</span></td>
                      <td data-label="Permissions">
                        <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: nbPerms > 0 ? 'var(--red)' : 'var(--text-3)' }}>
                          {nbPerms} / {MODULES_ERP.length * ACTIONS_PERMS.length}
                        </span>
                      </td>
                      <td data-label="Statut">
                        <span className={`badge ${r.statut === 'Actif' ? 'badge-green' : 'badge-grey'}`} style={{ fontSize: '0.72rem' }}>{r.statut}</span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 3 }}>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDetailId(r.id)}><Eye size={13} /></button>
                          {canManage && (
                            <>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditRole(r); setShowModal(true); }}><Edit2 size={13} /></button>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleDupliquer(r)}><Copy size={13} /></button>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleToggleStatut(r.id, r.statut)}>
                                <ToggleLeft size={13} style={{ color: r.statut === 'Actif' ? '#E65100' : '#2E7D32' }} />
                              </button>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleDelete(r.id)} style={{ color: 'var(--red)' }}><Trash2 size={13} /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditRole(null); }} title={editRole ? 'Modifier le rôle' : 'Nouveau rôle'} width={860}>
        <RoleForm initial={editRole} onSave={handleSave} onCancel={() => { setShowModal(false); setEditRole(null); }} saving={saving} />
      </Modal>
    </div>
  );
}
