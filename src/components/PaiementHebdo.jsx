import { Banknote, CheckCircle, Filter, Search, Users, TrendingUp, Plus, Pencil, Trash2, Loader2, RefreshCw, X } from 'lucide-react';
import { useState, useRef, useMemo } from 'react';
import { useWorkerPayroll } from '../hooks/useWorkerPayroll';
import { calcPayrollTotals, weekStartMonday, weekEndSunday } from '../services/rh/workerPayroll';

function EmptyState({ icon, title, sub }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-3)' }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
        {icon}
      </div>
      <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-2)', marginBottom: 5 }}>{title}</div>
      <div style={{ fontSize: '0.83rem' }}>{sub}</div>
    </div>
  );
}

function fmtMAD(n) {
  return Number(n).toLocaleString('fr-MA') + ' MAD';
}

function Toast({ toast }) {
  if (!toast) return null;
  const bg = toast.type === 'success' ? '#2E7D32' : '#D32F2F';
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: bg, color: '#fff', padding: '12px 20px', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.22)', fontSize: '0.88rem', fontWeight: 600 }}>
      {toast.msg}
    </div>
  );
}

const INPUT_S = (err) => ({
  padding: '9px 12px', width: '100%', outline: 'none',
  fontFamily: 'var(--font-body)', fontSize: '0.9rem',
  border: '1.5px solid ' + (err ? 'var(--red)' : 'var(--border)'),
  borderRadius: 'var(--radius)', background: '#fff', boxSizing: 'border-box',
});

function currentWeekStart() {
  return weekStartMonday(new Date().toISOString().slice(0, 10));
}

const EMPTY_FORM = {
  workerId: '',
  projet: '',
  semaineDebut: currentWeekStart(),
  joursPaies: '',
  tarifJour: '',
  heuresSup: '',
  tarifSup: '',
  avances: '',
  retenues: '',
  statut: 'En attente',
  notes: '',
};

export default function PaiementHebdo() {
  const {
    records,
    workers,
    workerOptions,
    chantiers,
    semaines,
    loading,
    saving,
    error,
    configured,
    load,
    create,
    update,
    markPaid,
    markAllPaid,
    remove,
    generateWeek,
    filterWorkerPayroll,
    computePayrollStats,
  } = useWorkerPayroll();

  const [search, setSearch] = useState('');
  const [filterProjet, setFilterProjet] = useState('');
  const [filterSemaine, setFilterSemaine] = useState('');
  const [filterMois, setFilterMois] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [generateSemaine, setGenerateSemaine] = useState(currentWeekStart());
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);

  function notify(type, msg) {
    setToast({ type, msg });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }

  function setF(k, v) { setForm((p) => ({ ...p, [k]: v })); }

  function handleOuvrierChange(workerId) {
    const w = workers.find((x) => x.id === workerId);
    const tarifJour = w?.tarif || 0;
    const tarifSup = tarifJour ? Math.round(tarifJour * 1.25) : '';
    setForm((p) => ({
      ...p,
      workerId,
      projet: p.projet || w?.chantier || '',
      tarifJour: tarifJour ? String(tarifJour) : p.tarifJour,
      tarifSup: tarifSup ? String(tarifSup) : p.tarifSup,
    }));
  }

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setShowModal(true);
  }

  function openEdit(record) {
    setEditId(record.id);
    setForm({
      workerId: record.workerId || '',
      projet: record.projet || '',
      semaineDebut: record.semaineDebut || currentWeekStart(),
      joursPaies: String(record.joursPaies ?? ''),
      tarifJour: String(record.tarifJour ?? ''),
      heuresSup: String(record.heuresSup ?? ''),
      tarifSup: String(record.tarifSup ?? ''),
      avances: String(record.avances ?? ''),
      retenues: String(record.retenues ?? ''),
      statut: record.statut || 'En attente',
      notes: record.notes || '',
    });
    setErrors({});
    setShowModal(true);
  }

  function validate() {
    const e = {};
    if (!form.workerId) e.workerId = 'Requis';
    if (!form.projet) e.projet = 'Requis';
    if (!form.semaineDebut) e.semaineDebut = 'Requis';
    if (form.joursPaies === '' || Number.isNaN(Number(form.joursPaies)) || Number(form.joursPaies) < 0) e.joursPaies = 'Valeur valide requise';
    if (!form.tarifJour || Number.isNaN(Number(form.tarifJour)) || Number(form.tarifJour) <= 0) e.tarifJour = 'Tarif valide requis';
    return e;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const payload = {
      ...form,
      semaineFin: weekEndSunday(form.semaineDebut),
      montantSup: calcPayrollTotals(form).montant_heures_sup,
    };

    const result = editId ? await update(editId, payload) : await create(payload);
    if (!result.success) {
      notify('error', result.error || 'Erreur enregistrement.');
      return;
    }

    notify('success', editId ? 'Paiement modifie.' : 'Paiement enregistre.');
    setShowModal(false);
    setEditId(null);
  }

  async function valider(id) {
    const result = await markPaid(id);
    notify(result.success ? 'success' : 'error', result.success ? 'Paiement valide.' : (result.error || 'Erreur.'));
  }

  async function validerTous() {
    const ids = filtered.filter((p) => p.statut === 'En attente').map((p) => p.id);
    if (!ids.length) return;
    const result = await markAllPaid(ids);
    notify(result.success ? 'success' : 'error', result.success ? 'Tous les paiements valides.' : (result.error || 'Erreur.'));
  }

  async function handleDelete(id) {
    if (!window.confirm('Supprimer ce paiement ?')) return;
    const result = await remove(id);
    notify(result.success ? 'success' : 'error', result.success ? 'Supprime.' : (result.error || 'Erreur.'));
  }

  async function handleGenerate() {
    const result = await generateWeek(generateSemaine);
    notify(
      result.success ? 'success' : 'error',
      result.success ? 'Paiements generes depuis presences et heures sup.' : (result.error || 'Erreur.'),
    );
  }

  const filtered = useMemo(
    () => filterWorkerPayroll(records, {
      search,
      projet: filterProjet,
      semaine: filterSemaine,
      mois: filterMois,
      statut: filterStatut,
    }),
    [records, search, filterProjet, filterSemaine, filterMois, filterStatut, filterWorkerPayroll],
  );

  const stats = useMemo(() => computePayrollStats(filtered), [filtered, computePayrollStats]);
  const preview = useMemo(() => calcPayrollTotals(form), [form]);
  const hasFilters = search || filterProjet || filterSemaine || filterMois || filterStatut;

  return (
    <div className="animate-fade-in">
      <Toast toast={toast} />

      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Paiement hebdomadaire</h1>
          <p className="page-subtitle">Calcul automatique : (jours x tarif) + heures supplementaires</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <input
            type="date"
            value={generateSemaine}
            onChange={(e) => setGenerateSemaine(weekStartMonday(e.target.value || currentWeekStart()))}
            style={{ padding: '7px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.85rem', fontFamily: 'var(--font-body)', outline: 'none' }}
            title="Semaine a generer"
          />
          <button className="btn btn-secondary" onClick={handleGenerate} disabled={loading || saving || !configured}>
            <RefreshCw size={15} /> Generer semaine
          </button>
          <button className="btn btn-secondary" onClick={openCreate} disabled={loading || saving || !configured}>
            <Plus size={15} /> Ajouter paiement
          </button>
          {stats.nbEnAttente > 0 && (
            <button className="btn btn-primary" onClick={validerTous} disabled={loading || saving}>
              <CheckCircle size={15} /> Valider tous les paiements
            </button>
          )}
        </div>
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

      {/* KPIs */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-icon blue"><Banknote size={18} /></div>
          <div className="stat-body">
            <div className="stat-value" style={{ fontSize: '1rem' }}>{loading ? '—' : fmtMAD(stats.totalAPayer)}</div>
            <div className="stat-label">Total a payer</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><CheckCircle size={18} /></div>
          <div className="stat-body">
            <div className="stat-value" style={{ fontSize: '1rem' }}>{loading ? '—' : fmtMAD(stats.totalPaye)}</div>
            <div className="stat-label">Deja paye</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><TrendingUp size={18} /></div>
          <div className="stat-body">
            <div className="stat-value" style={{ fontSize: '1rem' }}>{loading ? '—' : fmtMAD(stats.totalEnAttente)}</div>
            <div className="stat-label">En attente</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Users size={18} /></div>
          <div className="stat-body">
            <div className="stat-value">{loading ? '—' : stats.count}</div>
            <div className="stat-label">Employes concernes</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 12, padding: '14px 20px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-3)', fontSize: '0.85rem' }}>
            <Filter size={14} /> Filtres
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              placeholder="Rechercher un employe..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 28, paddingRight: 12, paddingTop: 7, paddingBottom: 7, border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.85rem', fontFamily: 'var(--font-body)', outline: 'none' }}
            />
          </div>
          <select value={filterProjet} onChange={e => setFilterProjet(e.target.value)} style={{ padding: '7px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.85rem', fontFamily: 'var(--font-body)', outline: 'none', background: '#fff' }}>
            <option value="">Tous les projets</option>
            {chantiers.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filterSemaine} onChange={e => setFilterSemaine(e.target.value)} style={{ padding: '7px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.85rem', fontFamily: 'var(--font-body)', outline: 'none', background: '#fff' }}>
            <option value="">Toutes les semaines</option>
            {semaines.map(s => <option key={s} value={s}>Sem. du {s}</option>)}
          </select>
          <input
            type="month"
            value={filterMois}
            onChange={e => setFilterMois(e.target.value)}
            style={{ padding: '7px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.85rem', fontFamily: 'var(--font-body)', outline: 'none' }}
          />
          <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} style={{ padding: '7px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.85rem', fontFamily: 'var(--font-body)', outline: 'none', background: '#fff' }}>
            <option value="">Tous les statuts</option>
            <option value="En attente">En attente</option>
            <option value="Paye">Paye</option>
          </select>
          {hasFilters && (
            <button onClick={() => { setSearch(''); setFilterProjet(''); setFilterSemaine(''); setFilterMois(''); setFilterStatut(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: '0.82rem', fontWeight: 600 }}>
              Effacer filtres
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 16 }}><Banknote size={16} /> Tableau de paiement</div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 24px', color: 'var(--text-3)' }}>
            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ fontSize: '0.88rem' }}>Chargement…</div>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Banknote size={22} style={{ color: 'var(--text-3)' }} />}
            title={records.length === 0 ? "Aucun paiement genere" : "Aucun resultat pour ces filtres"}
            sub={records.length === 0 ? "Les paiements sont calcules automatiquement a partir des presences et heures supplementaires" : "Modifiez vos criteres de recherche"}
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employe</th>
                  <th>Projet</th>
                  <th>Jours paies</th>
                  <th>Salaire/jour</th>
                  <th>Heures sup</th>
                  <th>Montant sup</th>
                  <th>Total</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const montantSup = p.montantSup || Math.round(p.heuresSup * p.tarifSup);
                  const isPaye = p.statut === 'Paye';
                  return (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.ouvrier}</td>
                      <td style={{ color: 'var(--text-2)' }}>{p.projet}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}>{p.joursPaies}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>j</span>
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-2)', fontSize: '0.85rem' }}>{fmtMAD(p.tarifJour)}</td>
                      <td>
                        {p.heuresSup > 0
                          ? <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: '#E65100' }}>{p.heuresSup}h</span>
                          : <span style={{ color: 'var(--text-3)' }}>—</span>
                        }
                      </td>
                      <td style={{ color: '#E65100', fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: '0.88rem' }}>
                        {p.heuresSup > 0 ? fmtMAD(montantSup) : '—'}
                      </td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, color: 'var(--red)', fontSize: '0.98rem' }}>
                          {fmtMAD(p.total)}
                        </span>
                      </td>
                      <td>
                        <span className={'badge ' + (isPaye ? 'badge-green' : 'badge-orange')}>
                          {p.statut}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          {!isPaye && (
                            <button
                              className="btn btn-sm"
                              style={{ background: '#E8F5E9', color: '#2E7D32', border: 'none', cursor: 'pointer', borderRadius: 6, padding: '5px 12px', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap' }}
                              onClick={() => valider(p.id)}
                              disabled={saving}
                            >
                              <CheckCircle size={12} style={{ marginRight: 4 }} /> Payer
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}
                            title="Modifier"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(p.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}
                            title="Supprimer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary footer */}
        <div style={{ marginTop: 16, padding: '14px 16px', background: '#F8F9FA', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', gap: 24 }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Nombre d&apos;employes</div>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800 }}>{loading ? '—' : filtered.length}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>En attente</div>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, color: '#E65100' }}>{loading ? '—' : stats.nbEnAttente}</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Total a payer cette semaine</div>
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, color: 'var(--red)', fontSize: '1.4rem' }}>{loading ? '—' : fmtMAD(stats.totalAPayer)}</div>
          </div>
        </div>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>
                {editId ? 'Modifier paiement' : 'Ajouter paiement'}
              </h2>
              <button type="button" onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>Ouvrier *</label>
                  <select value={form.workerId} onChange={e => handleOuvrierChange(e.target.value)} style={INPUT_S(errors.workerId)}>
                    <option value="">Selectionner…</option>
                    {workerOptions.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
                  </select>
                  {errors.workerId && <div style={{ color: 'var(--red)', fontSize: '0.78rem', marginTop: 4 }}>{errors.workerId}</div>}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>Projet / chantier *</label>
                  <input value={form.projet} onChange={e => setF('projet', e.target.value)} style={INPUT_S(errors.projet)} placeholder="Chantier" />
                  {errors.projet && <div style={{ color: 'var(--red)', fontSize: '0.78rem', marginTop: 4 }}>{errors.projet}</div>}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>Semaine (debut) *</label>
                  <input type="date" value={form.semaineDebut} onChange={e => setF('semaineDebut', weekStartMonday(e.target.value || currentWeekStart()))} style={INPUT_S(errors.semaineDebut)} />
                  {errors.semaineDebut && <div style={{ color: 'var(--red)', fontSize: '0.78rem', marginTop: 4 }}>{errors.semaineDebut}</div>}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>Jours paies *</label>
                    <input type="number" min="0" step="0.5" value={form.joursPaies} onChange={e => setF('joursPaies', e.target.value)} style={INPUT_S(errors.joursPaies)} />
                    {errors.joursPaies && <div style={{ color: 'var(--red)', fontSize: '0.78rem', marginTop: 4 }}>{errors.joursPaies}</div>}
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>Salaire / jour *</label>
                    <input type="number" min="0" value={form.tarifJour} onChange={e => setF('tarifJour', e.target.value)} style={INPUT_S(errors.tarifJour)} />
                    {errors.tarifJour && <div style={{ color: 'var(--red)', fontSize: '0.78rem', marginTop: 4 }}>{errors.tarifJour}</div>}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>Heures sup</label>
                    <input type="number" min="0" step="0.5" value={form.heuresSup} onChange={e => setF('heuresSup', e.target.value)} style={INPUT_S()} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>Tarif heures sup</label>
                    <input type="number" min="0" value={form.tarifSup} onChange={e => setF('tarifSup', e.target.value)} style={INPUT_S()} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>Avances</label>
                    <input type="number" min="0" value={form.avances} onChange={e => setF('avances', e.target.value)} style={INPUT_S()} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>Retenues</label>
                    <input type="number" min="0" value={form.retenues} onChange={e => setF('retenues', e.target.value)} style={INPUT_S()} />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>Statut</label>
                  <select value={form.statut} onChange={e => setF('statut', e.target.value)} style={INPUT_S()}>
                    <option value="En attente">En attente</option>
                    <option value="Paye">Paye</option>
                  </select>
                </div>

                <div style={{ padding: '12px 14px', background: '#F8F9FA', borderRadius: 8, fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span>Montant heures sup</span>
                    <strong>{fmtMAD(preview.montant_heures_sup)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Total net</span>
                    <strong style={{ color: 'var(--red)' }}>{fmtMAD(preview.montant_net)}</strong>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Enregistrement…' : (editId ? 'Enregistrer' : 'Ajouter')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
