import { useState, useRef, useMemo } from 'react';
import { UserSquare, Plus, Edit2, Trash2, X, Search, Filter, Loader2 } from 'lucide-react';
import { useProspects } from '../../hooks/useProspects';
import { TYPE_PROJET_VALUES, TYPE_PROJET_LABEL, SOURCE_VALUES, SOURCE_LABEL, ACTION_VALUES, NIVEAU_VALUES } from '../../constants/commercial';

/* ── helpers ── */
const IS = (e) => ({ padding: '9px 12px', border: '1.5px solid ' + (e ? 'var(--red)' : 'var(--border)'), borderRadius: 'var(--radius)', fontSize: '0.9rem', fontFamily: 'var(--font-body)', outline: 'none', width: '100%', background: '#fff' });

function Toast({ t }) {
  if (!t) return null;
  return <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: t.type === 'success' ? '#2E7D32' : '#D32F2F', color: '#fff', padding: '12px 20px', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.22)', fontSize: '0.88rem', fontWeight: 600, maxWidth: 340 }}>{t.msg}</div>;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_PART = {
  type: 'particulier', nom: '', prenom: '', email: '', telephone: '',
  source: '', type_projet: '', action: '', commentaire: '',
  statut: 'nouveau', budget: '', ville: '', date_contact: today(), prochain_suivi: '',
};
const EMPTY_BTOB = {
  type: 'btob', nom: '', nom_interlocuteur: '', prenom_interlocuteur: '', email: '', telephone: '',
  fonction: '', secteur: '', source: '', type_projet: '', niveau_decisionnel: '', action: '', commentaire: '',
  statut: 'nouveau', budget: '', ville: '', date_contact: today(), prochain_suivi: '',
};

export default function Prospects() {
  const {
    records,
    loading,
    saving,
    error,
    configured,
    load,
    create,
    update,
    remove,
    villes,
    filterProspects,
    computeProspectStats,
    STATUT_VALUES,
    STATUT_LABEL,
  } = useProspects();

  const [modal, setModal] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState(EMPTY_PART);
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterVille, setFilterVille] = useState('');
  const [filterTypeProjet, setFilterTypeProjet] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [deleting, setDeleting] = useState(null);
  const toastRef = useRef(null);

  function toast2(type, msg) {
    setToast({ type, msg });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }

  function openAdd() {
    setEditRow(null);
    setForm(EMPTY_PART);
    setErrors({});
    setModal(true);
  }

  function openEdit(row) {
    setEditRow(row);
    setForm({
      ...row,
      budget: row.budget != null ? String(row.budget) : '',
      date_contact: row.date_contact || today(),
      prochain_suivi: row.prochain_suivi || '',
    });
    setErrors({});
    setModal(true);
  }

  function setField(k, v) {
    setForm(p => ({ ...p, [k]: v }));
  }

  function switchType(t) {
    setForm(t === 'particulier' ? { ...EMPTY_PART } : { ...EMPTY_BTOB });
    setErrors({});
  }

  function validate() {
    const e = {};
    if (form.type === 'particulier') {
      if (!form.nom?.trim()) e.nom = 'Requis';
      if (!form.telephone?.trim()) e.telephone = 'Requis';
      if (!form.type_projet) e.type_projet = 'Requis';
    } else {
      if (!form.nom_interlocuteur?.trim()) e.nom_interlocuteur = 'Requis';
      if (!form.telephone && !form.email) e.telephone = 'Tel ou Email requis';
      if (!form.type_projet) e.type_projet = 'Requis';
    }
    return e;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const result = editRow ? await update(editRow.id, form) : await create(form);
    if (!result.success) {
      toast2('error', result.error || 'Erreur enregistrement.');
      return;
    }

    toast2('success', editRow ? 'Prospect mis a jour.' : 'Prospect ajoute.');
    setModal(false);
  }

  async function handleDelete(row) {
    if (!window.confirm('Supprimer ce prospect ?')) return;
    setDeleting(row.id);
    const result = await remove(row.id);
    toast2(result.success ? 'success' : 'error', result.success ? 'Prospect supprime.' : (result.error || 'Erreur.'));
    setDeleting(null);
  }

  const filtered = useMemo(
    () => filterProspects(records, {
      search,
      type: filterType,
      statut: filterStatut,
      source: filterSource,
      ville: filterVille,
      typeProjet: filterTypeProjet,
      date: filterDate,
    }),
    [records, search, filterType, filterStatut, filterSource, filterVille, filterTypeProjet, filterDate, filterProspects],
  );

  const stats = useMemo(() => computeProspectStats(records), [records, computeProspectStats]);
  const hasFilters = filterType || filterStatut || filterSource || filterVille || filterTypeProjet || filterDate;

  return (
    <div className="animate-fade-in">
      <Toast t={toast} />

      {/* Header */}
      <div className="page-header prospects-header">
        <div>
          <h1 className="page-title">Prospects</h1>
          <p className="page-subtitle">Gestion des leads entrants — particuliers et entreprises</p>
        </div>
        <button className="btn btn-primary prospects-add-btn" onClick={openAdd} disabled={loading || saving || !configured}><Plus size={15} /> Nouveau prospect</button>
      </div>

      {!configured && (
        <div style={{ background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#E65100' }}>
          Supabase non configuré — ajoutez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env
        </div>
      )}

      {error && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#FFEBEE', border: '1px solid #EF9A9A', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#C62828' }}>
          <span>{error}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={load}>Réessayer</button>
        </div>
      )}

      {/* KPI stats */}
      <div className="prospects-kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))' }}>
        <div className="prospects-kpi-card">
          <div className="stat-icon"><UserSquare size={16} /></div>
          <div className="stat-body">
            <div className="stat-value">{loading ? '—' : stats.total}</div>
            <div className="stat-label">Total prospects</div>
          </div>
        </div>
        <div className="prospects-kpi-card">
          <div className="stat-icon orange"><UserSquare size={16} /></div>
          <div className="stat-body">
            <div className="stat-value">{loading ? '—' : stats.nouveaux}</div>
            <div className="stat-label">Nouveaux</div>
          </div>
        </div>
        <div className="prospects-kpi-card">
          <div className="stat-icon blue"><UserSquare size={16} /></div>
          <div className="stat-body">
            <div className="stat-value">{loading ? '—' : stats.enCours}</div>
            <div className="stat-label">En cours</div>
          </div>
        </div>
        <div className="prospects-kpi-card">
          <div className="stat-icon green"><UserSquare size={16} /></div>
          <div className="stat-body">
            <div className="stat-value">{loading ? '—' : stats.convertis}</div>
            <div className="stat-label">Convertis</div>
          </div>
        </div>
      </div>

      {/* Search + Filters — compact block */}
      <div className="prospects-search-block">
        <div className="prospects-search-row">
          <Search size={15} className="prospects-search-icon" />
          <input
            className="prospects-search-input"
            placeholder="Rechercher nom, tel, email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="prospects-filters-row">
          <div className="prospects-filter-wrap">
            <Filter size={13} className="prospects-filter-icon" />
            <select
              className="prospects-filter-select"
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
            >
              <option value="">Tous les types</option>
              <option value="particulier">Particulier</option>
              <option value="btob">BtoB</option>
            </select>
          </div>
          <div className="prospects-filter-wrap">
            <select className="prospects-filter-select" value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
              <option value="">Tous les statuts</option>
              {STATUT_VALUES.map(s => <option key={s} value={s}>{STATUT_LABEL[s]}</option>)}
            </select>
          </div>
          <div className="prospects-filter-wrap">
            <select className="prospects-filter-select" value={filterSource} onChange={e => setFilterSource(e.target.value)}>
              <option value="">Toutes les sources</option>
              {SOURCE_VALUES.map(v => <option key={v} value={v}>{SOURCE_LABEL[v]}</option>)}
            </select>
          </div>
          <div className="prospects-filter-wrap">
            <select className="prospects-filter-select" value={filterTypeProjet} onChange={e => setFilterTypeProjet(e.target.value)}>
              <option value="">Tous les projets</option>
              {TYPE_PROJET_VALUES.map(v => <option key={v} value={v}>{TYPE_PROJET_LABEL[v]}</option>)}
            </select>
          </div>
          {villes.length > 0 && (
            <div className="prospects-filter-wrap">
              <select className="prospects-filter-select" value={filterVille} onChange={e => setFilterVille(e.target.value)}>
                <option value="">Toutes les villes</option>
                {villes.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          )}
          <div className="prospects-filter-wrap">
            <input type="date" className="prospects-filter-select" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
          </div>
          {hasFilters && (
            <button
              onClick={() => { setFilterType(''); setFilterStatut(''); setFilterSource(''); setFilterVille(''); setFilterTypeProjet(''); setFilterDate(''); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: '0.82rem', fontWeight: 600, alignSelf: 'center' }}
            >
              Effacer filtres
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="card prospects-list-card">
        <div className="flex-between mb-4">
          <div className="card-title" style={{ marginBottom: 0 }}>
            <UserSquare size={16} /> Prospects ({filtered.length})
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>
            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ fontSize: '0.88rem' }}>Chargement...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>
            {records.length === 0 ? 'Aucun prospect enregistre.' : 'Aucun prospect trouve.'}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="table-wrap prospects-table-desktop">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Nom / Entreprise</th>
                    <th>Contact</th>
                    <th>Projet</th>
                    <th>Action</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const displayName = r.type === 'btob'
                      ? (r.nom || r.nom_interlocuteur || '-')
                      : ((r.prenom || '') + ' ' + (r.nom || '')).trim() || '-';
                    const contact = r.type === 'btob'
                      ? (r.email || r.telephone || '-')
                      : (r.telephone || '-');
                    return (
                      <tr key={r.id}>
                        <td data-label="Type"><span className={'badge ' + (r.type === 'btob' ? 'badge-blue' : 'badge-orange')}>{r.type === 'btob' ? 'BtoB' : 'Particulier'}</span></td>
                        <td data-label="Nom / Entreprise" style={{ fontWeight: 600 }}>
                          {displayName}
                          {r.type === 'btob' && r.nom_interlocuteur && <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', fontWeight: 400 }}>{r.prenom_interlocuteur} {r.nom_interlocuteur}</div>}
                        </td>
                        <td data-label="Contact" style={{ color: 'var(--text-2)', fontSize: '0.875rem' }}>{contact}</td>
                        <td data-label="Projet"><span className="badge badge-grey">{TYPE_PROJET_LABEL[r.type_projet] || r.type_projet || '-'}</span></td>
                        <td data-label="Action" style={{ fontSize: '0.875rem', color: 'var(--text-2)' }}>{r.action || '-'}</td>
                        <td data-label="Date" style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>{r.created_at ? String(r.created_at).slice(0, 10) : '-'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }} onClick={() => openEdit(r)}><Edit2 size={13} /></button>
                            <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }} onClick={() => handleDelete(r)} disabled={deleting === r.id}><Trash2 size={13} style={{ color: 'var(--red)' }} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="prospects-mobile-list">
              {filtered.map(r => {
                const displayName = r.type === 'btob'
                  ? (r.nom || r.nom_interlocuteur || '-')
                  : ((r.prenom || '') + ' ' + (r.nom || '')).trim() || '-';
                const contactLine = r.type === 'btob'
                  ? [r.email, r.telephone].filter(Boolean).join(' · ')
                  : (r.telephone || '');
                const interlocuteur = r.type === 'btob' && r.nom_interlocuteur
                  ? ((r.prenom_interlocuteur || '') + ' ' + r.nom_interlocuteur).trim()
                  : null;
                return (
                  <div key={r.id} className="prospect-mobile-card">
                    <div className="pmc-top">
                      <div className="pmc-identity">
                        <span className={'badge ' + (r.type === 'btob' ? 'badge-blue' : 'badge-orange')} style={{ marginBottom: 4 }}>
                          {r.type === 'btob' ? 'BtoB' : 'Particulier'}
                        </span>
                        <div className="pmc-name">{displayName}</div>
                        {interlocuteur && <div className="pmc-sub">{interlocuteur}</div>}
                      </div>
                      <div className="pmc-actions">
                        <button className="btn btn-ghost btn-sm pmc-btn" onClick={() => openEdit(r)} title="Modifier">
                          <Edit2 size={14} />
                        </button>
                        <button className="btn btn-ghost btn-sm pmc-btn" onClick={() => handleDelete(r)} disabled={deleting === r.id} title="Supprimer">
                          <Trash2 size={14} style={{ color: 'var(--red)' }} />
                        </button>
                      </div>
                    </div>
                    <div className="pmc-meta">
                      {contactLine && <span className="pmc-meta-item">{contactLine}</span>}
                      {r.type_projet && <span className="pmc-meta-item badge badge-grey">{TYPE_PROJET_LABEL[r.type_projet] || r.type_projet}</span>}
                      {r.action && <span className="pmc-meta-item pmc-action">{r.action}</span>}
                      {r.created_at && <span className="pmc-meta-item pmc-date">{String(r.created_at).slice(0, 10)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── MODAL ── */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 32, width: '100%', maxWidth: 520, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex-between" style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.3rem', textTransform: 'uppercase' }}>
                {editRow ? 'Modifier prospect' : 'Nouveau prospect'}
              </h2>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><X size={20} /></button>
            </div>

            {/* Type switch */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 20, border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
              {['particulier', 'btob'].map(t => (
                <button key={t} type="button" onClick={() => switchType(t)} style={{ flex: 1, padding: '9px 0', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.95rem', textTransform: 'uppercase', letterSpacing: 1, background: form.type === t ? 'var(--red)' : '#fff', color: form.type === t ? '#fff' : 'var(--text-2)', transition: 'all 0.15s' }}>
                  {t === 'particulier' ? 'Particulier' : 'BtoB'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>

              {form.type === 'particulier' && (<>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label>Prenom</label>
                    <input style={IS(false)} value={form.prenom || ''} onChange={e => setField('prenom', e.target.value)} placeholder="Youssef" />
                  </div>
                  <div className="form-group">
                    <label>Nom *</label>
                    <input style={IS(errors.nom)} value={form.nom || ''} onChange={e => setField('nom', e.target.value)} placeholder="Amrani" />
                    {errors.nom && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.nom}</span>}
                  </div>
                </div>
                <div className="form-group">
                  <label>Telephone *</label>
                  <input style={IS(errors.telephone)} value={form.telephone || ''} onChange={e => setField('telephone', e.target.value)} placeholder="+213 600 000 000" />
                  {errors.telephone && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.telephone}</span>}
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" style={IS(false)} value={form.email || ''} onChange={e => setField('email', e.target.value)} placeholder="youssef@email.dz" />
                </div>
              </>)}

              {form.type === 'btob' && (<>
                <div className="form-group">
                  <label>Societe / Entreprise</label>
                  <input style={IS(false)} value={form.nom || ''} onChange={e => setField('nom', e.target.value)} placeholder="Citymo SARL" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label>Prenom interlocuteur *</label>
                    <input style={IS(errors.prenom_interlocuteur)} value={form.prenom_interlocuteur || ''} onChange={e => setField('prenom_interlocuteur', e.target.value)} placeholder="Karim" />
                  </div>
                  <div className="form-group">
                    <label>Nom interlocuteur *</label>
                    <input style={IS(errors.nom_interlocuteur)} value={form.nom_interlocuteur || ''} onChange={e => setField('nom_interlocuteur', e.target.value)} placeholder="Benali" />
                    {errors.nom_interlocuteur && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.nom_interlocuteur}</span>}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label>Email</label>
                    <input type="email" style={IS(false)} value={form.email || ''} onChange={e => setField('email', e.target.value)} placeholder="k.benali@entreprise.dz" />
                  </div>
                  <div className="form-group">
                    <label>Telephone</label>
                    <input style={IS(errors.telephone)} value={form.telephone || ''} onChange={e => setField('telephone', e.target.value)} placeholder="+213 661 000 000" />
                    {errors.telephone && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.telephone}</span>}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label>Fonction</label>
                    <input style={IS(false)} value={form.fonction || ''} onChange={e => setField('fonction', e.target.value)} placeholder="Directeur General" />
                  </div>
                  <div className="form-group">
                    <label>Secteur</label>
                    <input style={IS(false)} value={form.secteur || ''} onChange={e => setField('secteur', e.target.value)} placeholder="Immobilier, BTP..." />
                  </div>
                </div>
                <div className="form-group">
                  <label>Niveau decisionnel</label>
                  <select style={IS(false)} value={form.niveau_decisionnel || ''} onChange={e => setField('niveau_decisionnel', e.target.value)}>
                    <option value="">Choisir...</option>
                    {NIVEAU_VALUES.map(n => <option key={n}>{n}</option>)}
                  </select>
                </div>
              </>)}

              {/* Common fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Type de projet *</label>
                  <select style={IS(errors.type_projet)} value={form.type_projet || ''} onChange={e => setField('type_projet', e.target.value)}>
                    <option value="">Choisir...</option>
                    {TYPE_PROJET_VALUES.map(v => <option key={v} value={v}>{TYPE_PROJET_LABEL[v]}</option>)}
                  </select>
                  {errors.type_projet && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.type_projet}</span>}
                </div>
                <div className="form-group">
                  <label>Source</label>
                  <select style={IS(false)} value={form.source || ''} onChange={e => setField('source', e.target.value)}>
                    <option value="">Choisir...</option>
                    {SOURCE_VALUES.map(v => <option key={v} value={v}>{SOURCE_LABEL[v]}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Statut</label>
                  <select style={IS(false)} value={form.statut || 'nouveau'} onChange={e => setField('statut', e.target.value)}>
                    {STATUT_VALUES.map(s => <option key={s} value={s}>{STATUT_LABEL[s]}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Budget (MAD)</label>
                  <input type="number" min="0" style={IS(false)} value={form.budget || ''} onChange={e => setField('budget', e.target.value)} placeholder="500000" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Ville</label>
                  <input style={IS(false)} value={form.ville || ''} onChange={e => setField('ville', e.target.value)} placeholder="Casablanca" />
                </div>
                <div className="form-group">
                  <label>Action</label>
                  <select style={IS(false)} value={form.action || ''} onChange={e => setField('action', e.target.value)}>
                    <option value="">Choisir...</option>
                    {ACTION_VALUES.map(a => <option key={a}>{a}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Date de contact</label>
                  <input type="date" style={IS(false)} value={form.date_contact || ''} onChange={e => setField('date_contact', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Prochain suivi</label>
                  <input type="date" style={IS(false)} value={form.prochain_suivi || ''} onChange={e => setField('prochain_suivi', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label>Commentaire / besoin</label>
                <textarea rows={3} style={{ ...IS(false), resize: 'vertical' }} value={form.commentaire || ''} onChange={e => setField('commentaire', e.target.value)} placeholder="Details, notes, contexte..." />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> : <><Plus size={14} /> {editRow ? 'Enregistrer' : 'Ajouter'}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
