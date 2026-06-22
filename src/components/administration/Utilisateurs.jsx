/**
 * Utilisateurs.jsx — Gestion utilisateurs ERP liés aux employés RH (Supabase).
 */
import { useState, useCallback, useEffect } from 'react';
import {
  Users, Plus, Edit2, Trash2, Eye, Key, Search, Filter, Download,
  ChevronLeft, UserPlus, ToggleLeft, Shield, Clock,
} from 'lucide-react';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE,
  STATUTS_USER, MODULES_ERP, BADGE_STATUT_USER,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow, Avatar, InfoRow,
} from './shared.jsx';
import {
  createUserFromEmployee as createUser,
  updateAdminUser as updateUser,
  setUserStatut as changeStatut,
  adminResetPassword,
} from '../../services/admin/users';
import { generateTempPassword } from '../../services/admin/passwordUtils';
import { getDepartmentOptions } from '../../services/admin/constants';
import { getRolePermissionsForUser } from '../../services/admin/permissions';
import { ERP_ACTIONS, findSubmodule } from '../../config/menuRegistry';

const DEPT_OPTIONS = getDepartmentOptions();
const EMPTY_FORM = {
  employee_id: '',
  prenom: '', nom: '', email: '', telephone: '', poste: '',
  password: '', password_confirm: '',
  role_id: '', department_id: '', statut: 'Actif',
  notes: '',
};

function UserForm({ initial, roles, employees, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial ? { ...EMPTY_FORM, ...initial, password: '', password_confirm: '' } : EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const selectedEmployee = (employees || []).find((e) => e.id === form.employee_id);
  const linkedToRh = Boolean(selectedEmployee);

  function onEmployeeChange(empId) {
    const emp = (employees || []).find((e) => e.id === empId);
    if (!emp) {
      set('employee_id', '');
      return;
    }
    setForm((p) => ({
      ...p,
      employee_id: empId,
      prenom: emp.firstname || '',
      nom: emp.lastname || '',
      email: emp.email || '',
      telephone: emp.telephone || '',
      poste: emp.poste || '',
      department_id: emp.department_id ? String(emp.department_id) : '',
      departement: emp.department || '',
    }));
  }

  function generatePassword() {
    const pwd = generateTempPassword(12);
    setForm((p) => ({ ...p, password: pwd, password_confirm: pwd }));
  }

  function validate() {
    const e = {};
    if (!form.employee_id && !initial) e.employee_id = 'Sélectionnez un employé RH';
    if (!form.email?.trim()) e.email = 'Requis';
    if (!initial && !form.password) e.password = 'Requis';
    if (!initial && form.password !== form.password_confirm) e.password_confirm = 'Les mots de passe ne correspondent pas';
    if (!form.role_id) e.role_id = 'Sélectionnez un rôle';
    return e;
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    const { password_confirm, departement, ...data } = form;
    onSave({ ...data, employee: selectedEmployee });
  }

  const fieldStyle = (key) => ({
    ...INPUT_STYLE,
    borderColor: errors[key] ? 'var(--red)' : 'var(--border)',
    background: linkedToRh && ['prenom', 'nom', 'email', 'telephone', 'poste'].includes(key) ? 'var(--surface-2)' : '#fff',
  });

  return (
    <form onSubmit={handleSubmit}>
      <SectionTitle icon={<Users size={12} />}>Lien employé RH</SectionTitle>
      <FRow>
        <FField label="Employé lié" required={!initial}>
          <select
            value={form.employee_id}
            onChange={(e) => onEmployeeChange(e.target.value)}
            style={{ ...SELECT_STYLE, borderColor: errors.employee_id ? 'var(--red)' : 'var(--border)' }}
            disabled={Boolean(initial?.employee_id)}
          >
            <option value="">— Sélectionner un employé —</option>
            {(employees || []).map((e) => (
              <option key={e.id} value={e.id} disabled={e.linked && e.id !== initial?.employee_id}>
                {e.label} {e.linked && e.id !== initial?.employee_id ? '(déjà lié)' : ''} — {e.email}
              </option>
            ))}
          </select>
          {errors.employee_id && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.employee_id}</div>}
          {linkedToRh && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 4 }}>
              Données récupérées automatiquement depuis RH.
            </div>
          )}
        </FField>
      </FRow>

      <SectionTitle icon={<Users size={12} />}>Informations personnelles</SectionTitle>
      <FRow>
        <FField label="Prénom">
          <input value={form.prenom} readOnly={linkedToRh} onChange={(e) => set('prenom', e.target.value)} style={fieldStyle('prenom')} />
        </FField>
        <FField label="Nom">
          <input value={form.nom} readOnly={linkedToRh} onChange={(e) => set('nom', e.target.value)} style={fieldStyle('nom')} />
        </FField>
        <FField label="Email" required>
          <input type="email" value={form.email} readOnly={linkedToRh} onChange={(e) => set('email', e.target.value)} style={fieldStyle('email')} />
          {errors.email && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.email}</div>}
        </FField>
        <FField label="Téléphone">
          <input value={form.telephone} readOnly={linkedToRh} onChange={(e) => set('telephone', e.target.value)} style={fieldStyle('telephone')} />
        </FField>
        <FField label="Poste">
          <input value={form.poste} readOnly={linkedToRh} onChange={(e) => set('poste', e.target.value)} style={fieldStyle('poste')} />
        </FField>
        <FField label="Département">
          <select value={form.department_id} onChange={(e) => set('department_id', e.target.value)} style={SELECT_STYLE}>
            <option value="">— Sélectionner —</option>
            {DEPT_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </FField>
      </FRow>

      <SectionTitle icon={<Key size={12} />}>Compte & Accès</SectionTitle>
      <FRow>
        {!initial && (
          <>
            <FField label="Mot de passe temporaire" required>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="text" value={form.password} onChange={(e) => set('password', e.target.value)} style={{ ...fieldStyle('password'), flex: 1 }} autoComplete="new-password" />
                <button type="button" className="btn btn-secondary btn-sm" onClick={generatePassword}>Générer</button>
              </div>
              {errors.password && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.password}</div>}
              <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 4 }}>Communiquez ce mot de passe à l&apos;utilisateur. Changement obligatoire à la 1ère connexion.</div>
            </FField>
            <FField label="Confirmer mot de passe">
              <input type="text" value={form.password_confirm} onChange={(e) => set('password_confirm', e.target.value)} style={fieldStyle('password_confirm')} />
              {errors.password_confirm && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.password_confirm}</div>}
            </FField>
          </>
        )}
        <FField label="Rôle" required>
          <select value={form.role_id} onChange={(e) => set('role_id', e.target.value)} style={{ ...SELECT_STYLE, borderColor: errors.role_id ? 'var(--red)' : 'var(--border)' }}>
            <option value="">— Sélectionner un rôle —</option>
            {(roles || []).filter((r) => r.statut === 'Actif').map((r) => (
              <option key={r.id} value={r.id}>{r.nom}</option>
            ))}
          </select>
          {errors.role_id && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.role_id}</div>}
        </FField>
        <FField label="Statut">
          <select value={form.statut} onChange={(e) => set('statut', e.target.value)} style={SELECT_STYLE}>
            {STATUTS_USER.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </FField>
      </FRow>

      <div style={{ marginBottom: 20 }}>
        <FField label="Notes">
          <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Notes internes..." style={{ ...TEXTAREA_STYLE, minHeight: 56 }} />
        </FField>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> {saving ? 'Enregistrement…' : (initial ? 'Enregistrer' : 'Créer utilisateur')}
        </button>
      </div>
    </form>
  );
}

function PermissionsModal({ open, onClose, userId, userName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;
    setLoading(true);
    getRolePermissionsForUser(userId)
      .then(setData)
      .finally(() => setLoading(false));
  }, [open, userId]);

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title={`Permissions — ${userName}`} width={640}>
      {loading ? (
        <p style={{ color: 'var(--text-3)' }}>Chargement…</p>
      ) : (
        <>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-2)', marginTop: 0 }}>
            Rôle : <strong>{data?.role?.nom || '—'}</strong>
            {data?.role?.est_admin && <span className="badge badge-red" style={{ marginLeft: 8 }}>Super Admin</span>}
          </p>
          {data?.role?.est_admin ? (
            <p style={{ color: 'var(--text-2)' }}>Accès complet à toutes les rubriques et sous-rubriques.</p>
          ) : (
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: 6 }}>Rubrique</th>
                    <th style={{ textAlign: 'left', padding: 6 }}>Sous-rubrique</th>
                    <th style={{ textAlign: 'left', padding: 6 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.permissions || []).map((p) => {
                    const found = findSubmodule(p.submodule_code);
                    const acts = ERP_ACTIONS.find((a) => a.code === p.action_code)?.label || p.action_code;
                    return (
                      <tr key={`${p.submodule_code}-${p.action_code}`}>
                        <td style={{ padding: 6 }}>{found?.rubrique?.label || p.module_code}</td>
                        <td style={{ padding: 6, fontWeight: 600 }}>{found?.submodule?.label || p.submodule_code}</td>
                        <td style={{ padding: 6 }}>{acts}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {(data?.exceptions || []).length > 0 && (
                <>
                  <div style={{ marginTop: 12, fontWeight: 700, fontSize: '0.75rem', color: 'var(--orange)' }}>Exceptions utilisateur</div>
                  <ul style={{ fontSize: '0.78rem', paddingLeft: 18 }}>
                    {data.exceptions.map((e) => (
                      <li key={`${e.submodule_code}-${e.action_code}`}>
                        {findSubmodule(e.submodule_code)?.submodule?.label || e.submodule_code} — {e.action_code} : {e.granted ? 'autorisé' : 'refusé'}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

function DetailUser({ user, roles, canManage, onBack, onEdit, onResetPwd, onChangeStatut, onViewPerms }) {
  const role = (roles || []).find((r) => String(r.id) === String(user.role_id));
  const fullName = [user.prenom, user.nom].filter(Boolean).join(' ');

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={onBack}>
          <ChevronLeft size={15} /> Retour
        </button>
        <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', flex: 1 }}>Profil utilisateur</h2>
        <span className={`badge ${BADGE_STATUT_USER[user.statut] || 'badge-grey'}`}>{user.statut}</span>
        {canManage && (
          <button type="button" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={onEdit}>
            <Edit2 size={13} /> Modifier
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}>
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <Avatar nom={fullName} size={60} />
              <div>
                <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.2rem' }}>{fullName || '—'}</div>
                <div style={{ fontSize: '0.84rem', color: 'var(--text-2)' }}>{user.email}</div>
                {role && <span className="badge badge-blue" style={{ marginTop: 4, display: 'inline-block' }}>{role.nom}</span>}
              </div>
            </div>
            <SectionTitle>Informations</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
              <InfoRow label="Employé RH" value={user.employee_id ? fullName : '—'} />
              <InfoRow label="Poste" value={user.poste} />
              <InfoRow label="Département" value={user.departement} />
              <InfoRow label="Téléphone" value={user.telephone} />
              <InfoRow label="Date création" value={user.date_creation} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card">
            <SectionTitle icon={<Clock size={12} />}>Session & Connexion</SectionTitle>
            <InfoRow label="Dernière connexion" value={user.derniere_connexion || '—'} />
          </div>
          <div className="card">
            <SectionTitle>Actions rapides</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onViewPerms}>
                <Shield size={13} /> Voir permissions
              </button>
              {canManage && (
                <>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={onResetPwd}>
                    <Key size={13} /> Réinitialiser mot de passe
                  </button>
                  {user.statut === 'Actif' ? (
                    <button type="button" className="btn btn-ghost btn-sm" style={{ color: '#E65100' }} onClick={() => onChangeStatut(user.id, 'Suspendu')}>
                      <ToggleLeft size={13} /> Suspendre
                    </button>
                  ) : (
                    <button type="button" className="btn btn-ghost btn-sm" style={{ color: '#2E7D32' }} onClick={() => onChangeStatut(user.id, 'Actif')}>
                      <ToggleLeft size={13} /> Activer
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          {user.notes && (
            <div className="card">
              <SectionTitle>Notes</SectionTitle>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-2)', margin: 0 }}>{user.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Utilisateurs({
  users = [], setUsers, roles = [], employees = [], reload, canManage,
}) {
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [permsUser, setPermsUser] = useState(null);
  const [msg, setMsg] = useState('');
  const [createdCreds, setCreatedCreds] = useState(null);

  const handleSave = useCallback(async (data) => {
    setSaving(true);
    setMsg('');
    try {
      let saved;
      const tempPwd = data.password;
      if (editUser) {
        saved = await updateUser(editUser.id, data, data.employee);
      } else {
        saved = await createUser({
          employee: data.employee,
          role_id: data.role_id,
          department_id: data.department_id,
          statut: data.statut,
          password: data.password,
          notes: data.notes,
          mustChangePassword: true,
        });
        setCreatedCreds({ email: saved.email, password: tempPwd, nom: [saved.prenom, saved.nom].filter(Boolean).join(' ') });
      }
      setUsers((prev) => {
        const exists = prev.some((u) => u.id === saved.id);
        return exists ? prev.map((u) => (u.id === saved.id ? saved : u)) : [saved, ...prev];
      });
      setShowModal(false);
      setEditUser(null);
      reload?.();
    } catch (err) {
      setMsg(err.message || 'Erreur enregistrement');
    } finally {
      setSaving(false);
    }
  }, [editUser, reload, setUsers]);

  async function handleChangeStatut(id, statut) {
    if (!canManage) return;
    try {
      await changeStatut(id, statut);
      setUsers((prev) => prev.map((x) => (x.id === id ? { ...x, statut } : x)));
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleResetPwd(u) {
    if (!canManage || !u?.email) return;
    try {
      await adminResetPassword(u.id, u.email);
      alert(`Email de réinitialisation envoyé à ${u.email}. L'utilisateur devra définir un nouveau mot de passe.`);
    } catch (err) {
      alert(err.message);
    }
  }

  const depts = [...new Set(users.map((u) => u.departement).filter(Boolean))].sort();

  const filtered = users.filter((x) => {
    const q = search.toLowerCase();
    const fullName = [x.prenom, x.nom].filter(Boolean).join(' ');
    return (!q || fullName.toLowerCase().includes(q) || (x.email || '').toLowerCase().includes(q))
      && (!filterStatut || x.statut === filterStatut)
      && (!filterDept || x.departement === filterDept)
      && (!filterRole || String(x.role_id) === String(filterRole));
  });

  const total = users.length;
  const actifs = users.filter((x) => x.statut === 'Actif').length;
  const admins = users.filter((x) => {
    const r = roles.find((r) => String(r.id) === String(x.role_id));
    return r && (r.est_admin || r.nom?.toLowerCase().includes('admin'));
  }).length;
  const suspendus = users.filter((x) => x.statut === 'Suspendu').length;

  if (detailId) {
    const u = users.find((x) => x.id === detailId);
    if (!u) { setDetailId(null); return null; }
    return (
      <>
        <DetailUser
          user={u}
          roles={roles}
          canManage={canManage}
          onBack={() => setDetailId(null)}
          onEdit={() => { setEditUser(u); setShowModal(true); }}
          onResetPwd={() => handleResetPwd(u)}
          onChangeStatut={handleChangeStatut}
          onViewPerms={() => setPermsUser(u)}
        />
        <PermissionsModal open={Boolean(permsUser)} onClose={() => setPermsUser(null)} userId={permsUser?.id} userName={[permsUser?.prenom, permsUser?.nom].filter(Boolean).join(' ')} />
      </>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">UTILISATEURS</h1>
          <p className="page-subtitle">Comptes ERP liés aux employés RH — rôles et permissions héritées.</p>
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowFilters((f) => !f)}><Filter size={14} /> Filtres</button>
            <button type="button" className="btn btn-primary" onClick={() => { setEditUser(null); setShowModal(true); }}>
              <Plus size={15} /> Ajouter utilisateur
            </button>
          </div>
        )}
      </div>

      {msg && <div style={{ marginBottom: 12, padding: 10, background: 'var(--red-light)', color: 'var(--red)', borderRadius: 8, fontSize: '0.84rem' }}>{msg}</div>}

      <div className="stat-grid finance-kpi-grid" style={{ marginBottom: 20 }}>
        <KpiCard icon={<Users size={17} />} label="Total utilisateurs" value={total} color="grey" />
        <KpiCard icon={<Users size={17} />} label="Actifs" value={actifs} color="green" />
        <KpiCard icon={<Shield size={17} />} label="Administrateurs" value={admins} color="red" />
        <KpiCard icon={<Users size={17} />} label="Suspendus" value={suspendus} color="orange" />
      </div>

      <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher nom, email..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
          {showFilters && (
            <>
              <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 150 }}>
                <option value="">Tous statuts</option>
                {STATUTS_USER.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 160 }}>
                <option value="">Tous rôles</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
              </select>
              <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 180 }}>
                <option value="">Tous départements</option>
                {depts.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <EmptyState icon={<Users size={24} />} title="Aucun utilisateur" sub="Liez un employé RH à un compte ERP" action={canManage ? 'Ajouter utilisateur' : undefined} onAction={canManage ? () => { setEditUser(null); setShowModal(true); } : undefined} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Utilisateur</th>
                  <th>Email</th>
                  <th>Poste</th>
                  <th>Rôle</th>
                  <th>Département</th>
                  <th>Statut</th>
                  <th>Dernière connexion</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((x) => {
                  const fullName = [x.prenom, x.nom].filter(Boolean).join(' ');
                  const role = roles.find((r) => String(r.id) === String(x.role_id));
                  return (
                    <tr key={x.id} style={{ cursor: 'pointer' }} onClick={() => setDetailId(x.id)}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar nom={fullName} size={32} />
                          <span style={{ fontWeight: 600 }}>{fullName || '—'}</span>
                        </div>
                      </td>
                      <td data-label="Email" style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>{x.email}</td>
                      <td data-label="Poste" style={{ fontSize: '0.82rem' }}>{x.poste || '—'}</td>
                      <td data-label="Rôle">{role ? <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>{role.nom}</span> : '—'}</td>
                      <td data-label="Département" style={{ fontSize: '0.82rem' }}>{x.departement || '—'}</td>
                      <td data-label="Statut">
                        <span className={`badge ${BADGE_STATUT_USER[x.statut] || 'badge-grey'}`} style={{ fontSize: '0.72rem' }}>{x.statut}</span>
                      </td>
                      <td data-label="Connexion" style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>{x.derniere_connexion || '—'}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 3 }}>
                          <button type="button" className="btn btn-secondary btn-sm" title="Voir profil" onClick={() => setDetailId(x.id)}><Eye size={13} /></button>
                          {canManage && (
                            <>
                              <button type="button" className="btn btn-ghost btn-sm" title="Modifier" onClick={() => { setEditUser(x); setShowModal(true); }}><Edit2 size={13} /></button>
                              <button type="button" className="btn btn-ghost btn-sm" title="Permissions" onClick={() => setPermsUser(x)}><Shield size={13} /></button>
                              <button type="button" className="btn btn-ghost btn-sm" title="Réinitialiser MDP" onClick={() => handleResetPwd(x)}><Key size={13} /></button>
                              <button type="button" className="btn btn-ghost btn-sm" title={x.statut === 'Actif' ? 'Suspendre' : 'Activer'} onClick={() => handleChangeStatut(x.id, x.statut === 'Actif' ? 'Suspendu' : 'Actif')}>
                                <ToggleLeft size={13} style={{ color: x.statut === 'Actif' ? '#E65100' : '#2E7D32' }} />
                              </button>
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

      <Modal open={Boolean(createdCreds)} onClose={() => setCreatedCreds(null)} title="Compte créé" width={480}>
        {createdCreds && (
          <div>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-2)' }}>
              Transmettez ces identifiants à <strong>{createdCreds.nom}</strong>. Le mot de passe est géré par Supabase Auth et ne sera pas stocké dans l&apos;ERP.
            </p>
            <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 14, marginBottom: 16, fontFamily: 'monospace', fontSize: '0.85rem' }}>
              <div>Email : {createdCreds.email}</div>
              <div>Mot de passe temporaire : {createdCreds.password}</div>
            </div>
            <p style={{ fontSize: '0.78rem', color: '#E65100' }}>Changement de mot de passe obligatoire à la première connexion.</p>
            <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={() => setCreatedCreds(null)}>Fermer</button>
          </div>
        )}
      </Modal>
      <Modal open={showModal} onClose={() => { setShowModal(false); setEditUser(null); }} title={editUser ? "Modifier l'utilisateur" : 'Nouvel utilisateur'} width={720}>
        <UserForm initial={editUser} roles={roles} employees={employees} onSave={handleSave} onCancel={() => { setShowModal(false); setEditUser(null); }} saving={saving} />
      </Modal>
      <PermissionsModal open={Boolean(permsUser) && !detailId} onClose={() => setPermsUser(null)} userId={permsUser?.id} userName={[permsUser?.prenom, permsUser?.nom].filter(Boolean).join(' ')} />
    </div>
  );
}
