/**
 * Utilisateurs.jsx — Gestion utilisateurs ERP CITYMO
 * Backend-ready / Supabase Auth ready
 */
import { useState, useCallback } from 'react';
import { Users, Plus, Edit2, Trash2, Eye, Key, Search, Filter, Download, ChevronLeft, UserPlus, ToggleLeft, Shield, Clock, Activity } from 'lucide-react';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE,
  STATUTS_USER, DEPARTEMENTS, MODULES_ERP,
  BADGE_STATUT_USER,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow, Avatar, InfoRow,
  genId
} from './shared.jsx';

const EMPTY_FORM = {
  prenom: '', nom: '', email: '', telephone: '',
  password: '', password_confirm: '',
  role_id: '', departement: '', statut: 'Actif',
  modules_acces: [],
  notes: '',
};

function UserForm({ initial, roles, onSave, onCancel }) {
  const [form, setForm] = useState(initial ? { ...initial, password: '', password_confirm: '' } : EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  function toggleModule(mod) {
    const current = form.modules_acces || [];
    const next = current.includes(mod) ? current.filter(m => m !== mod) : [...current, mod];
    set('modules_acces', next);
  }

  function validate() {
    const e = {};
    if (!form.prenom.trim()) e.prenom = 'Requis';
    if (!form.nom.trim()) e.nom = 'Requis';
    if (!form.email.trim()) e.email = 'Requis';
    if (!initial && !form.password) e.password = 'Requis';
    if (!initial && form.password !== form.password_confirm) e.password_confirm = 'Les mots de passe ne correspondent pas';
    return e;
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    const { password_confirm, ...data } = form;
    onSave(data);
  }

  return (
    <form onSubmit={handleSubmit}>
      <SectionTitle icon={<Users size={12} />}>Informations personnelles</SectionTitle>
      <FRow>
        <FField label="Prénom" required>
          <input value={form.prenom} onChange={e => set('prenom', e.target.value)} placeholder="Prénom..." style={{ ...INPUT_STYLE, borderColor: errors.prenom ? 'var(--red)' : 'var(--border)' }} />
          {errors.prenom && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.prenom}</div>}
        </FField>
        <FField label="Nom" required>
          <input value={form.nom} onChange={e => set('nom', e.target.value)} placeholder="Nom..." style={{ ...INPUT_STYLE, borderColor: errors.nom ? 'var(--red)' : 'var(--border)' }} />
          {errors.nom && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.nom}</div>}
        </FField>
        <FField label="Email" required>
          <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@citymo.ma" style={{ ...INPUT_STYLE, borderColor: errors.email ? 'var(--red)' : 'var(--border)' }} />
          {errors.email && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.email}</div>}
        </FField>
        <FField label="Téléphone">
          <input value={form.telephone} onChange={e => set('telephone', e.target.value)} placeholder="+212 6XX XXX XXX" style={INPUT_STYLE} />
        </FField>
      </FRow>

      <SectionTitle icon={<Key size={12} />}>Compte & Accès</SectionTitle>
      <FRow>
        {!initial && (
          <>
            <FField label="Mot de passe" required>
              <input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="••••••••" style={{ ...INPUT_STYLE, borderColor: errors.password ? 'var(--red)' : 'var(--border)' }} />
              {errors.password && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.password}</div>}
            </FField>
            <FField label="Confirmer mot de passe">
              <input type="password" value={form.password_confirm} onChange={e => set('password_confirm', e.target.value)} placeholder="••••••••" style={{ ...INPUT_STYLE, borderColor: errors.password_confirm ? 'var(--red)' : 'var(--border)' }} />
              {errors.password_confirm && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.password_confirm}</div>}
            </FField>
          </>
        )}
        <FField label="Rôle">
          <select value={form.role_id} onChange={e => set('role_id', e.target.value)} style={SELECT_STYLE}>
            <option value="">— Sélectionner un rôle —</option>
            {(roles || []).map(r => <option key={r.id} value={r.id}>{r.nom}</option>)}
          </select>
        </FField>
        <FField label="Département">
          <select value={form.departement} onChange={e => set('departement', e.target.value)} style={SELECT_STYLE}>
            <option value="">— Sélectionner —</option>
            {DEPARTEMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </FField>
        <FField label="Statut">
          <select value={form.statut} onChange={e => set('statut', e.target.value)} style={SELECT_STYLE}>
            {STATUTS_USER.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </FField>
      </FRow>

      <SectionTitle icon={<Shield size={12} />}>Modules accessibles</SectionTitle>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {MODULES_ERP.map(mod => {
          const checked = (form.modules_acces || []).includes(mod);
          return (
            <button
              key={mod}
              type="button"
              onClick={() => toggleModule(mod)}
              style={{
                padding: '5px 14px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                border: '1.5px solid', transition: 'all 0.15s',
                borderColor: checked ? 'var(--red)' : 'var(--border)',
                background: checked ? 'var(--red-light)' : 'var(--surface-2)',
                color: checked ? 'var(--red)' : 'var(--text-2)',
              }}
            >
              {mod}
            </button>
          );
        })}
      </div>

      <div style={{ marginBottom: 20 }}>
        <FField label="Notes">
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Notes internes..." style={{ ...TEXTAREA_STYLE, minHeight: 56 }} />
        </FField>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> {initial ? 'Enregistrer' : 'Créer utilisateur'}
        </button>
      </div>
    </form>
  );
}

function DetailUser({ user, roles, onBack, onEdit, onResetPwd, onChangeStatut }) {
  const role = (roles || []).find(r => String(r.id) === String(user.role_id));
  const fullName = [user.prenom, user.nom].filter(Boolean).join(' ');

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={onBack}>
          <ChevronLeft size={15} /> Retour
        </button>
        <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', flex: 1 }}>Profil utilisateur</h2>
        <span className={'badge ' + (BADGE_STATUT_USER[user.statut] || 'badge-grey')}>{user.statut}</span>
        <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={onEdit}>
          <Edit2 size={13} /> Modifier
        </button>
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
              <InfoRow label="Prénom" value={user.prenom} />
              <InfoRow label="Nom" value={user.nom} />
              <InfoRow label="Email" value={user.email} />
              <InfoRow label="Téléphone" value={user.telephone} />
              <InfoRow label="Département" value={user.departement} />
              <InfoRow label="Date création" value={user.date_creation} />
            </div>
          </div>

          <div className="card">
            <SectionTitle icon={<Shield size={12} />}>Modules accessibles</SectionTitle>
            {(user.modules_acces || []).length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {user.modules_acces.map(mod => (
                  <span key={mod} style={{ padding: '4px 12px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600, background: 'var(--red-light)', color: 'var(--red)', border: '1.5px solid var(--red)' }}>
                    {mod}
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--text-3)', fontSize: '0.84rem' }}>Aucun module assigné.</div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card">
            <SectionTitle icon={<Clock size={12} />}>Session & Connexion</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <InfoRow label="Dernière connexion" value={user.derniere_connexion || '—'} />
              <InfoRow label="Connexions totales" value={user.nb_connexions ? String(user.nb_connexions) : '0'} />
              <InfoRow label="Adresse IP" value={user.derniere_ip || '—'} />
            </div>
          </div>

          <div className="card">
            <SectionTitle>Actions rapides</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }} onClick={onResetPwd}>
                <Key size={13} /> Réinitialiser mot de passe
              </button>
              {user.statut === 'Actif' ? (
                <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', color: '#E65100' }} onClick={() => onChangeStatut(user.id, 'Suspendu')}>
                  <ToggleLeft size={13} /> Suspendre
                </button>
              ) : (
                <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', color: '#2E7D32' }} onClick={() => onChangeStatut(user.id, 'Actif')}>
                  <ToggleLeft size={13} /> Activer
                </button>
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

export default function Utilisateurs({ roles, onUsersChange }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const today = new Date().toISOString().slice(0, 10);

  function updateUsers(updater) {
    setUsers(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (onUsersChange) onUsersChange(next);
      return next;
    });
  }

  const handleSave = useCallback((data) => {
    if (editUser) {
      updateUsers(prev => prev.map(x => x.id === editUser.id ? { ...x, ...data } : x));
    } else {
      updateUsers(prev => [...prev, { ...data, id: genId(), date_creation: today, nb_connexions: 0 }]);
    }
    setShowModal(false); setEditUser(null);
  }, [editUser, today]);

  function handleDelete(id) {
    if (window.confirm('Supprimer cet utilisateur ?')) { updateUsers(prev => prev.filter(x => x.id !== id)); setDetailId(null); }
  }
  function handleChangeStatut(id, statut) {
    updateUsers(prev => prev.map(x => x.id === id ? { ...x, statut } : x));
    if (detailId === id) setDetailId(prev => prev);
  }
  function handleResetPwd(id) {
    alert("Un email de réinitialisation sera envoyé à l'utilisateur via Supabase Auth.");
  }

  const filtered = users.filter(x => {
    const q = search.toLowerCase();
    const fullName = [x.prenom, x.nom].filter(Boolean).join(' ');
    return (!q || fullName.toLowerCase().includes(q) || (x.email || '').toLowerCase().includes(q))
      && (!filterStatut || x.statut === filterStatut)
      && (!filterDept || x.departement === filterDept);
  });

  const total     = users.length;
  const actifs    = users.filter(x => x.statut === 'Actif').length;
  const admins    = users.filter(x => {
    const r = (roles || []).find(r => String(r.id) === String(x.role_id));
    return r && (r.nom.toLowerCase().includes('admin') || r.est_admin);
  }).length;
  const suspendus = users.filter(x => x.statut === 'Suspendu').length;

  if (detailId) {
    const u = users.find(x => x.id === detailId);
    if (!u) { setDetailId(null); return null; }
    return (
      <DetailUser
        user={u} roles={roles}
        onBack={() => setDetailId(null)}
        onEdit={() => { setEditUser(u); setShowModal(true); setDetailId(null); }}
        onResetPwd={() => handleResetPwd(u.id)}
        onChangeStatut={handleChangeStatut}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">UTILISATEURS</h1>
          <p className="page-subtitle">Gestion des accès et utilisateurs ERP.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowFilters(f => !f)}><Filter size={14} /> Filtres</button>
          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><UserPlus size={14} /> Inviter</button>
          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Download size={14} /> Export</button>
          <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { setEditUser(null); setShowModal(true); }}>
            <Plus size={15} /> Ajouter utilisateur
          </button>
        </div>
      </div>

      <div className="stat-grid finance-kpi-grid" style={{ marginBottom: 20 }}>
        <KpiCard icon={<Users size={17} />}   label="Total utilisateurs" value={total}     color="grey"   />
        <KpiCard icon={<Users size={17} />}   label="Actifs"             value={actifs}    color="green"  />
        <KpiCard icon={<Shield size={17} />}  label="Administrateurs"    value={admins}    color="red"    />
        <KpiCard icon={<Users size={17} />}   label="Suspendus"          value={suspendus} color="orange" />
      </div>

      {showFilters ? (
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nom, email..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 150 }}>
              <option value="">Tous statuts</option>
              {STATUTS_USER.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterDept} onChange={e => setFilterDept(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 160 }}>
              <option value="">Tous départements</option>
              {DEPARTEMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterStatut(''); setFilterDept(''); }}>Réinitialiser</button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un utilisateur..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <EmptyState icon={<Users size={24} />} title="Aucun utilisateur" sub="Ajoutez le premier utilisateur ERP" action="Ajouter utilisateur" onAction={() => { setEditUser(null); setShowModal(true); }} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Utilisateur</th>
                  <th>Email</th>
                  <th>Téléphone</th>
                  <th>Rôle</th>
                  <th>Département</th>
                  <th>Statut</th>
                  <th>Dernière connexion</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(x => {
                  const fullName = [x.prenom, x.nom].filter(Boolean).join(' ');
                  const role = (roles || []).find(r => String(r.id) === String(x.role_id));
                  return (
                    <tr key={x.id} style={{ cursor: 'pointer' }} onClick={() => setDetailId(x.id)}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar nom={fullName} size={32} />
                          <span style={{ fontWeight: 600 }}>{fullName || '—'}</span>
                        </div>
                      </td>
                      <td data-label="Email" style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>{x.email}</td>
                      <td data-label="Tel." style={{ fontSize: '0.82rem' }}>{x.telephone || '—'}</td>
                      <td data-label="Rôle">
                        {role ? <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>{role.nom}</span> : '—'}
                      </td>
                      <td data-label="Département" style={{ fontSize: '0.82rem' }}>{x.departement || '—'}</td>
                      <td data-label="Statut">
                        <span className={'badge ' + (BADGE_STATUT_USER[x.statut] || 'badge-grey')} style={{ fontSize: '0.72rem' }}>{x.statut}</span>
                      </td>
                      <td data-label="Connexion" style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>{x.derniere_connexion || '—'}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 3 }}>
                          <button className="btn btn-secondary btn-sm" title="Voir profil" onClick={() => setDetailId(x.id)}><Eye size={13} /></button>
                          <button className="btn btn-ghost btn-sm" title="Modifier" onClick={() => { setEditUser(x); setShowModal(true); }}><Edit2 size={13} /></button>
                          <button className="btn btn-ghost btn-sm" title="Réinitialiser MDP" onClick={() => handleResetPwd(x.id)}><Key size={13} /></button>
                          <button className="btn btn-ghost btn-sm" title={x.statut === 'Actif' ? 'Suspendre' : 'Activer'} onClick={() => handleChangeStatut(x.id, x.statut === 'Actif' ? 'Suspendu' : 'Actif')}>
                            <ToggleLeft size={13} style={{ color: x.statut === 'Actif' ? '#E65100' : '#2E7D32' }} />
                          </button>
                          <button className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => handleDelete(x.id)} style={{ color: 'var(--red)' }}><Trash2 size={13} /></button>
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

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditUser(null); }} title={editUser ? "Modifier l'utilisateur" : 'Nouvel utilisateur'} width={720}>
        <UserForm initial={editUser} roles={roles} onSave={handleSave} onCancel={() => { setShowModal(false); setEditUser(null); }} />
      </Modal>
    </div>
  );
}
