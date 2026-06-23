/**
 * Utilisateurs.jsx — Gestion utilisateurs ERP liés aux employés RH (Supabase).
 */
import { useState, useCallback, useEffect } from 'react';
import {
  Users, Plus, Edit2, Eye, Key, Search, Filter,
  ChevronLeft, ToggleLeft, Shield, Clock, ChevronDown, ChevronRight,
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
  adminSetPassword,
  resolveRoleId,
} from '../../services/admin/users';
import { generateTempPassword } from '../../services/admin/passwordUtils';
import { getDepartmentOptions } from '../../services/admin/constants';
import { saveUserSubmoduleAccess, loadUserSubmoduleCodes } from '../../services/admin/permissions';
import { ERP_RUBRIQUES } from '../../config/menuRegistry';

const DEPT_OPTIONS = getDepartmentOptions();
const EMPTY_FORM = {
  employee_id: '',
  prenom: '', nom: '', email: '', telephone: '', poste: '',
  password: '', password_confirm: '',
  new_password: '', new_password_confirm: '',
  force_change_on_login: false,
  department_id: '', statut: 'Actif',
  est_super_admin: false,
  submoduleCodes: [],
  notes: '',
};

function visibleSubmodules(rub) {
  return (rub.submodules || []).filter((s) => !s.executiveOnly);
}

function RubriqueAccessPicker({ selectedCodes, onChange, disabled, loading }) {
  const [expanded, setExpanded] = useState(() => {
    const init = {};
    ERP_RUBRIQUES.forEach((rub) => {
      const subs = visibleSubmodules(rub);
      if (subs.some((s) => selectedCodes.includes(s.code))) init[rub.code] = true;
    });
    return init;
  });
  const selected = new Set(selectedCodes || []);

  function setSelected(nextSet) {
    onChange([...nextSet]);
  }

  function toggleSubmodule(code) {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setSelected(next);
  }

  function toggleRubrique(rub) {
    const subs = visibleSubmodules(rub).map((s) => s.code);
    const next = new Set(selected);
    const allOn = subs.length > 0 && subs.every((c) => next.has(c));
    subs.forEach((c) => {
      if (allOn) next.delete(c);
      else next.add(c);
    });
    setSelected(next);
    if (!allOn) setExpanded((p) => ({ ...p, [rub.code]: true }));
  }

  function rubriqueState(rub) {
    const subs = visibleSubmodules(rub).map((s) => s.code);
    if (!subs.length) return { checked: false, partial: false, count: 0 };
    const count = subs.filter((c) => selected.has(c)).length;
    return {
      checked: count === subs.length,
      partial: count > 0 && count < subs.length,
      count,
      total: subs.length,
    };
  }

  if (loading) {
    return <p style={{ fontSize: '0.82rem', color: 'var(--text-3)' }}>Chargement des accès…</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {ERP_RUBRIQUES.map((rub) => {
        const state = rubriqueState(rub);
        const isOpen = expanded[rub.code];
        const subs = visibleSubmodules(rub);
        if (!subs.length) return null;

        return (
          <div
            key={rub.code}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 8,
              overflow: 'hidden',
              background: state.count ? '#F8FBFF' : '#fff',
            }}
          >
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                background: isOpen ? '#EEF4FC' : 'transparent',
              }}
            >
              <input
                type="checkbox"
                disabled={disabled}
                checked={state.checked}
                ref={(el) => { if (el) el.indeterminate = state.partial; }}
                onChange={() => toggleRubrique(rub)}
                onClick={(e) => e.stopPropagation()}
              />
              <button
                type="button"
                disabled={disabled}
                onClick={() => setExpanded((p) => ({ ...p, [rub.code]: !p[rub.code] }))}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: 8,
                  border: 'none', background: 'transparent', padding: 0, textAlign: 'left',
                  cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '0.88rem',
                }}
              >
                <span style={{ fontWeight: 700 }}>{rub.label}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>
                  {state.count}/{state.total} sous-rubriques
                </span>
                <span style={{ marginLeft: 'auto', color: 'var(--text-3)' }}>
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
              </button>
            </div>

            {isOpen && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                  gap: 6,
                  padding: '10px 12px 12px',
                  borderTop: '1px solid var(--border)',
                  background: '#fff',
                }}
              >
                {subs.map((sub) => (
                  <label
                    key={sub.code}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px',
                      border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.8rem',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      background: selected.has(sub.code) ? '#E3F2FD' : '#fff',
                      opacity: disabled ? 0.6 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={selected.has(sub.code)}
                      onChange={() => toggleSubmodule(sub.code)}
                    />
                    {sub.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function UserForm({ initial, roles, employees, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial ? {
    ...EMPTY_FORM,
    ...initial,
    password: '',
    password_confirm: '',
    new_password: '',
    new_password_confirm: '',
    submoduleCodes: initial.submoduleCodes || [],
    est_super_admin: Boolean(initial.est_super_admin),
  } : EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [loadingAccess, setLoadingAccess] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!initial?.id) return;
    setLoadingAccess(true);
    loadUserSubmoduleCodes(initial.id)
      .then((codes) => {
        setForm((p) => ({
          ...p,
          submoduleCodes: codes,
          est_super_admin: Boolean(
            initial.est_super_admin
            || roles?.find((r) => String(r.id) === String(initial.role_id))?.est_admin,
          ),
        }));
      })
      .finally(() => setLoadingAccess(false));
  }, [initial?.id, initial?.role_id, initial?.est_super_admin, roles]);

  const selectedEmployee = (employees || []).find((e) => e.id === form.employee_id);
  const linkedToRh = Boolean(selectedEmployee);
  const readonlyRhFields = linkedToRh && !initial;

  function allSubmoduleCodesList() {
    return ERP_RUBRIQUES.flatMap((rub) => visibleSubmodules(rub).map((s) => s.code));
  }

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
    if (initial && form.new_password && form.new_password !== form.new_password_confirm) {
      e.new_password_confirm = 'Les mots de passe ne correspondent pas';
    }
    if (!form.est_super_admin && !(form.submoduleCodes?.length)) {
      e.submoduleCodes = 'Sélectionnez au moins une sous-rubrique ou cochez Super Admin';
    }
    return e;
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    const {
      password_confirm, new_password_confirm, departement, submoduleCodes, est_super_admin,
      new_password, force_change_on_login, ...data
    } = form;
    onSave({
      ...data,
      submoduleCodes,
      est_super_admin,
      new_password: new_password?.trim() || '',
      force_change_on_login,
      role_id: resolveRoleId(roles, { estSuperAdmin: est_super_admin }),
      employee: selectedEmployee,
    });
  }

  const fieldStyle = (key) => ({
    ...INPUT_STYLE,
    borderColor: errors[key] ? 'var(--red)' : 'var(--border)',
    background: readonlyRhFields && ['prenom', 'nom', 'email', 'telephone', 'poste'].includes(key) ? 'var(--surface-2)' : '#fff',
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
          <input value={form.prenom} readOnly={readonlyRhFields} onChange={(e) => set('prenom', e.target.value)} style={fieldStyle('prenom')} />
        </FField>
        <FField label="Nom">
          <input value={form.nom} readOnly={readonlyRhFields} onChange={(e) => set('nom', e.target.value)} style={fieldStyle('nom')} />
        </FField>
        <FField label="Email" required>
          <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} style={fieldStyle('email')} />
          {errors.email && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.email}</div>}
        </FField>
        <FField label="Téléphone">
          <input value={form.telephone} onChange={(e) => set('telephone', e.target.value)} style={fieldStyle('telephone')} />
        </FField>
        <FField label="Poste">
          <input value={form.poste} onChange={(e) => set('poste', e.target.value)} style={fieldStyle('poste')} />
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
        {!initial ? (
          <>
            <FField label="Mot de passe temporaire" required>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="text" value={form.password} onChange={(e) => set('password', e.target.value)} style={{ ...fieldStyle('password'), flex: 1 }} autoComplete="new-password" />
                <button type="button" className="btn btn-secondary btn-sm" onClick={generatePassword}>Générer</button>
              </div>
              {errors.password && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.password}</div>}
            </FField>
            <FField label="Confirmer mot de passe">
              <input type="text" value={form.password_confirm} onChange={(e) => set('password_confirm', e.target.value)} style={fieldStyle('password_confirm')} />
              {errors.password_confirm && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.password_confirm}</div>}
            </FField>
          </>
        ) : (
          <>
            <FField label="Nouveau mot de passe">
              <input type="text" value={form.new_password} onChange={(e) => set('new_password', e.target.value)} placeholder="Laisser vide pour ne pas changer" style={fieldStyle('new_password')} autoComplete="new-password" />
            </FField>
            <FField label="Confirmer nouveau mot de passe">
              <input type="text" value={form.new_password_confirm} onChange={(e) => set('new_password_confirm', e.target.value)} style={fieldStyle('new_password_confirm')} />
              {errors.new_password_confirm && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.new_password_confirm}</div>}
            </FField>
            <FField label="À la prochaine connexion">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: '0.85rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.force_change_on_login} onChange={(e) => set('force_change_on_login', e.target.checked)} />
                Forcer le changement de mot de passe
              </label>
            </FField>
          </>
        )}
        <FField label="Statut">
          <select value={form.statut} onChange={(e) => set('statut', e.target.value)} style={SELECT_STYLE}>
            {STATUTS_USER.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </FField>
      </FRow>

      <SectionTitle icon={<Shield size={12} />}>Accès par rubrique et sous-rubrique</SectionTitle>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: '0.85rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!form.est_super_admin}
            onChange={(e) => {
              const on = e.target.checked;
              set('est_super_admin', on);
              if (on) set('submoduleCodes', allSubmoduleCodesList());
            }}
          />
          <strong>Super Admin</strong> — accès total à toutes les rubriques
        </label>
        {errors.submoduleCodes && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginBottom: 8 }}>{errors.submoduleCodes}</div>}
        <RubriqueAccessPicker
          key={initial?.id || 'new'}
          selectedCodes={form.submoduleCodes || []}
          onChange={(codes) => set('submoduleCodes', codes)}
          disabled={form.est_super_admin}
          loading={loadingAccess}
        />
      </div>

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

function submoduleLabels(codes) {
  if (!codes?.length) return '—';
  const byRubrique = {};
  codes.forEach((code) => {
    const found = ERP_RUBRIQUES.find((r) => r.submodules.some((s) => s.code === code));
    const sub = found?.submodules.find((s) => s.code === code);
    if (!found || !sub) return;
    if (!byRubrique[found.label]) byRubrique[found.label] = [];
    byRubrique[found.label].push(sub.label);
  });
  return Object.entries(byRubrique)
    .map(([rub, subs]) => `${rub} (${subs.join(', ')})`)
    .join(' · ');
}

function rubriqueSummaryFromSubmodules(codes) {
  if (!codes?.length) return [];
  const set = new Set(codes);
  return ERP_RUBRIQUES.filter((rub) =>
    rub.submodules.some((s) => set.has(s.code)),
  ).map((rub) => {
    const total = visibleSubmodules(rub).length;
    const count = visibleSubmodules(rub).filter((s) => set.has(s.code)).length;
    return { code: rub.code, label: rub.label, count, total, partial: count < total };
  });
}

function DetailUser({ user, canManage, onBack, onEdit, onChangeStatut }) {
  const fullName = [user.prenom, user.nom].filter(Boolean).join(' ');
  const [submodules, setSubmodules] = useState([]);

  useEffect(() => {
    if (user?.id) loadUserSubmoduleCodes(user.id).then(setSubmodules);
  }, [user?.id]);

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
                {user.role_nom?.toLowerCase().includes('admin') && (
                  <span className="badge badge-red" style={{ marginTop: 4, display: 'inline-block' }}>Super Admin</span>
                )}
              </div>
            </div>
            <SectionTitle>Informations</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
              <InfoRow label="Accès" value={submoduleLabels(submodules)} />
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
              {canManage && (
                <>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}>
                    <Edit2 size={13} /> Modifier / mot de passe
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
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [createdCreds, setCreatedCreds] = useState(null);
  const [userAccess, setUserAccess] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map = {};
      for (const u of users) {
        if (!u.id) continue;
        const codes = await loadUserSubmoduleCodes(u.id);
        map[u.id] = rubriqueSummaryFromSubmodules(codes);
      }
      if (!cancelled) setUserAccess(map);
    })();
    return () => { cancelled = true; };
  }, [users]);

  const handleSave = useCallback(async (data) => {
    setSaving(true);
    setMsg('');
    const editingId = editUser?.id;
    const newPassword = data.new_password?.trim() || '';
    try {
      let saved;
      const tempPwd = data.password;
      if (editUser) {
        saved = await updateUser(editUser.id, data, null);
        if (!data.est_super_admin) {
          await saveUserSubmoduleAccess(editUser.id, data.submoduleCodes || []);
        } else {
          const allCodes = ERP_RUBRIQUES.flatMap((r) => visibleSubmodules(r).map((s) => s.code));
          await saveUserSubmoduleAccess(editUser.id, allCodes);
        }
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
        if (!data.est_super_admin) {
          await saveUserSubmoduleAccess(saved.id, data.submoduleCodes || []);
        }
        setCreatedCreds({ email: saved.email, password: tempPwd, nom: [saved.prenom, saved.nom].filter(Boolean).join(' ') });
      }
      setUsers((prev) => {
        const exists = prev.some((u) => u.id === saved.id);
        return exists ? prev.map((u) => (u.id === saved.id ? saved : u)) : [saved, ...prev];
      });
      setShowModal(false);
      setEditUser(null);
      reload?.();

      if (editingId && newPassword) {
        try {
          await adminSetPassword(editingId, newPassword, {
            mustChangePassword: Boolean(data.force_change_on_login),
          });
        } catch (pwdErr) {
          setMsg(`Utilisateur enregistré, mais mot de passe non modifié : ${pwdErr.message}`);
        }
      }
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

  const filtered = users.filter((x) => {
    const q = search.toLowerCase();
    const fullName = [x.prenom, x.nom].filter(Boolean).join(' ');
    return (!q || fullName.toLowerCase().includes(q) || (x.email || '').toLowerCase().includes(q))
      && (!filterStatut || x.statut === filterStatut)
      && (!filterDept || x.departement === filterDept);
  });

  const depts = [...new Set(users.map((u) => u.departement).filter(Boolean))].sort();

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
          canManage={canManage}
          onBack={() => setDetailId(null)}
          onEdit={() => { setEditUser(u); setShowModal(true); }}
          onChangeStatut={handleChangeStatut}
        />
        <Modal open={showModal} onClose={() => { setShowModal(false); setEditUser(null); }} title="Modifier l'utilisateur" width={760}>
          <UserForm initial={editUser} roles={roles} employees={employees} onSave={handleSave} onCancel={() => { setShowModal(false); setEditUser(null); }} saving={saving} />
        </Modal>
      </>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">UTILISATEURS</h1>
          <p className="page-subtitle">Comptes ERP — accès par sous-rubrique, mot de passe modifiable manuellement.</p>
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
                  <th>Rubriques</th>
                  <th>Département</th>
                  <th>Statut</th>
                  <th>Dernière connexion</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((x) => {
                  const fullName = [x.prenom, x.nom].filter(Boolean).join(' ');
                  const rubSummary = userAccess[x.id] || [];
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
                      <td data-label="Rubriques" style={{ fontSize: '0.75rem', maxWidth: 240 }}>
                        {rubSummary.slice(0, 3).map((rub) => (
                          <span
                            key={rub.code}
                            className={`badge ${rub.partial ? 'badge-orange' : 'badge-blue'}`}
                            style={{ fontSize: '0.65rem', marginRight: 4, marginBottom: 2 }}
                            title={rub.partial ? `${rub.count}/${rub.total} sous-rubriques` : 'Rubrique complète'}
                          >
                            {rub.label}{rub.partial ? ` (${rub.count}/${rub.total})` : ''}
                          </span>
                        ))}
                        {rubSummary.length > 3 && <span style={{ color: 'var(--text-3)' }}>+{rubSummary.length - 3}</span>}
                        {!rubSummary.length && '—'}
                      </td>
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
      <Modal open={showModal} onClose={() => { setShowModal(false); setEditUser(null); }} title={editUser ? "Modifier l'utilisateur" : 'Nouvel utilisateur'} width={760}>
        <UserForm initial={editUser} roles={roles} employees={employees} onSave={handleSave} onCancel={() => { setShowModal(false); setEditUser(null); }} saving={saving} />
      </Modal>
    </div>
  );
}
