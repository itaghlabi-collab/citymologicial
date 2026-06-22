/**
 * Roles.jsx — Rôles liés aux départements + permissions par sous-rubrique.
 */
import { useState, useCallback } from 'react';
import { Shield, Plus, Edit2, Trash2, Eye, Copy, ChevronLeft, ToggleLeft } from 'lucide-react';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow, InfoRow,
} from './shared.jsx';
import SubPermMatrix from './SubPermMatrix.jsx';
import {
  emptySubmodulePermissions,
  fullSubmodulePermissions,
  getDepartmentOptions,
  ROLE_TEMPLATES,
  departmentPermissionTemplate,
} from '../../services/admin/constants';
import {
  createRole, updateRole, deleteRole, toggleRoleStatut, duplicateRole,
} from '../../services/admin/roles';

const DEPT_OPTIONS = getDepartmentOptions();

const EMPTY_FORM = {
  nom: '',
  description: '',
  statut: 'Actif',
  est_admin: false,
  department_id: '',
  submodulePermissions: emptySubmodulePermissions(),
};

function RoleForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(() => {
    if (!initial) return { ...EMPTY_FORM, submodulePermissions: emptySubmodulePermissions() };
    return {
      ...EMPTY_FORM,
      ...initial,
      department_id: initial.department_id || '',
      submodulePermissions: initial.submodulePermissions || initial.permissions || emptySubmodulePermissions(),
    };
  });
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  function applyDepartmentTemplate() {
    if (!form.department_id) return;
    set('submodulePermissions', departmentPermissionTemplate(form.department_id));
  }

  function applyNamedTemplate(key) {
    const tpl = ROLE_TEMPLATES[key];
    if (!tpl) return;
    setForm((p) => ({
      ...p,
      department_id: tpl.departmentId || p.department_id,
      submodulePermissions: tpl.permissions(),
    }));
  }

  function handleAdminToggle(val) {
    set('est_admin', val);
    set('submodulePermissions', val ? fullSubmodulePermissions() : emptySubmodulePermissions());
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
          <input value={form.nom} onChange={(e) => set('nom', e.target.value)} style={{ ...INPUT_STYLE, borderColor: errors.nom ? 'var(--red)' : 'var(--border)' }} />
          {errors.nom && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.nom}</div>}
        </FField>
        <FField label="Département lié">
          <select value={form.department_id} onChange={(e) => set('department_id', e.target.value)} style={SELECT_STYLE}>
            <option value="">— Sélectionner —</option>
            {DEPT_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </FField>
        <FField label="Statut">
          <select value={form.statut} onChange={(e) => set('statut', e.target.value)} style={SELECT_STYLE}>
            <option value="Actif">Actif</option>
            <option value="Inactif">Inactif</option>
          </select>
        </FField>
        <FField label="Super Admin">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer', fontSize: '0.85rem' }}>
            <input type="checkbox" checked={!!form.est_admin} onChange={(e) => handleAdminToggle(e.target.checked)} />
            Accès total
          </label>
        </FField>
      </FRow>

      <div style={{ marginBottom: 12 }}>
        <FField label="Description">
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)} style={{ ...TEXTAREA_STYLE, minHeight: 48 }} />
        </FField>
      </div>

      {!form.est_admin && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={applyDepartmentTemplate} disabled={!form.department_id}>
            Modèle département
          </button>
          {Object.keys(ROLE_TEMPLATES).map((k) => (
            <button key={k} type="button" className="btn btn-ghost btn-sm" onClick={() => applyNamedTemplate(k)}>
              Modèle {k.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      <SectionTitle icon={<Shield size={12} />}>Rubriques & sous-rubriques autorisées</SectionTitle>
      <div style={{ marginBottom: 20, border: '1.5px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <SubPermMatrix
          permissions={form.submodulePermissions}
          onChange={(v) => set('submodulePermissions', v)}
          readOnly={!!form.est_admin}
        />
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          <Plus size={14} /> {saving ? 'Enregistrement…' : (initial ? 'Enregistrer' : 'Créer rôle')}
        </button>
      </div>
    </form>
  );
}

function countGranted(perms) {
  let c = 0;
  Object.values(perms || {}).forEach((acts) => {
    Object.values(acts || {}).forEach((v) => { if (v) c++; });
  });
  return c;
}

function DetailRole({ role, users, onBack, onEdit }) {
  const perms = role.submodulePermissions || role.permissions || emptySubmodulePermissions();
  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}><ChevronLeft size={15} /> Retour</button>
        <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', flex: 1 }}>{role.nom}</h2>
        <span className={`badge ${role.statut === 'Actif' ? 'badge-green' : 'badge-grey'}`}>{role.statut}</span>
        {role.est_admin && <span className="badge badge-red">Super Admin</span>}
        <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}><Edit2 size={13} /> Modifier</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: 16 }}>
        <div className="card">
          <SectionTitle>Permissions par sous-rubrique</SectionTitle>
          <div style={{ border: '1.5px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <SubPermMatrix permissions={perms} onChange={() => {}} readOnly />
          </div>
        </div>
        <div className="card">
          <SectionTitle>Informations</SectionTitle>
          <InfoRow label="Département" value={role.departement} />
          <InfoRow label="Code" value={role.code} />
          <InfoRow label="Utilisateurs" value={String((users || []).filter((u) => String(u.role_id) === String(role.id)).length)} />
          <InfoRow label="Permissions actives" value={String(countGranted(perms))} />
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
      const saved = editRole ? await updateRole(editRole.id, data) : await createRole(data);
      setRoles((prev) => {
        const exists = prev.some((r) => r.id === saved.id);
        return exists ? prev.map((r) => (r.id === saved.id ? saved : r)) : [...prev, saved];
      });
      setShowModal(false);
      setEditRole(null);
      reload?.();
    } catch (err) {
      setMsg(err.message || 'Erreur');
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
  const permsCount = roles.reduce((s, r) => s + countGranted(r.submodulePermissions || r.permissions), 0);

  if (detailId) {
    const role = roles.find((x) => x.id === detailId);
    if (!role) { setDetailId(null); return null; }
    return (
      <DetailRole
        role={role}
        users={users}
        onBack={() => setDetailId(null)}
        onEdit={() => { setEditRole(role); setShowModal(true); setDetailId(null); }}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">RÔLES & PERMISSIONS</h1>
          <p className="page-subtitle">Rôles liés aux départements CITYMO — accès par sous-rubrique.</p>
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
        <KpiCard icon={<Shield size={17} />} label="Permissions actives" value={permsCount} color="blue" />
        <KpiCard icon={<Shield size={17} />} label="Utilisateurs liés" value={users.filter((u) => u.role_id).length} color="orange" />
      </div>

      <div className="card" style={{ padding: 0 }}>
        {roles.length === 0 ? (
          <EmptyState icon={<Shield size={24} />} title="Aucun rôle" sub="Exécutez les migrations Administration dans Supabase" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rôle</th>
                  <th>Département</th>
                  <th>Utilisateurs</th>
                  <th>Permissions</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => {
                  const nb = countGranted(r.submodulePermissions || r.permissions);
                  const nbUsers = users.filter((u) => String(u.role_id) === String(r.id)).length;
                  return (
                    <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setDetailId(r.id)}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{r.nom}</div>
                        {r.est_admin && <span style={{ fontSize: '0.68rem', color: 'var(--red)', fontWeight: 700 }}>SUPER ADMIN</span>}
                      </td>
                      <td data-label="Département">{r.departement || '—'}</td>
                      <td data-label="Utilisateurs">{nbUsers}</td>
                      <td data-label="Permissions" style={{ fontWeight: 700, color: nb > 0 ? 'var(--red)' : 'var(--text-3)' }}>{nb}</td>
                      <td data-label="Statut">
                        <span className={`badge ${r.statut === 'Actif' ? 'badge-green' : 'badge-grey'}`}>{r.statut}</span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 3 }}>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDetailId(r.id)}><Eye size={13} /></button>
                          {canManage && (
                            <>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditRole(r); setShowModal(true); }}><Edit2 size={13} /></button>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleDupliquer(r)}><Copy size={13} /></button>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleToggleStatut(r.id, r.statut)}><ToggleLeft size={13} /></button>
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

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditRole(null); }} title={editRole ? 'Modifier le rôle' : 'Nouveau rôle'} width={920}>
        <RoleForm initial={editRole} onSave={handleSave} onCancel={() => { setShowModal(false); setEditRole(null); }} saving={saving} />
      </Modal>
    </div>
  );
}
