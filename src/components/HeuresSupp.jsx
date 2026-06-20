import { BarChart3, Plus, X, TrendingUp, Filter, Pencil, Loader2 } from 'lucide-react';
import { useState, useRef, useMemo } from 'react';
import { useOvertime } from '../hooks/useOvertime';
import { workerFullName } from '../services/rh/attendance';
import { workerTarifJournalier } from '../services/rh/workers';
import { suggestHourlyRate } from '../services/rh/overtime';

function fmtMAD(n) {
  return Number(n).toLocaleString('fr-MA') + ' MAD';
}

function Toast({ toast }) {
  if (!toast) return null;
  const bg = toast.type === 'success' ? '#2E7D32' : '#D32F2F';
  return (
    <div className="rh-ext-toast" style={{ background: bg, color: '#fff', padding: '12px 20px', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.22)', fontSize: '0.88rem', fontWeight: 600 }}>
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

function today() { return new Date().toISOString().slice(0, 10); }

const STATUS_OPTS = ['Brouillon', 'Valide', 'Paye'];

const EMPTY_FORM = {
  projectId: '',
  projet: '',
  workerIds: [],
  workerId: '',
  date: today(),
  heures: '',
  tarif: '',
  motif: '',
  statut: 'Valide',
};

export default function HeuresSupp() {
  const {
    records,
    workers,
    projects,
    workerOptions,
    chantiers,
    workersByProject,
    loading,
    saving,
    error,
    configured,
    load,
    createBatch,
    update,
    remove,
    filterOvertimeRecords,
    computeOvertimeStats,
  } = useOvertime();

  const [filterOuvrier, setFilterOuvrier] = useState('');
  const [filterProjet, setFilterProjet] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
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

  const projectWorkers = useMemo(
    () => (editId ? [] : workersByProject(form.projectId)),
    [editId, form.projectId, workersByProject],
  );

  const allProjectWorkersSelected = projectWorkers.length > 0
    && projectWorkers.every((w) => form.workerIds.includes(w.id));

  function handleProjectChange(projectId) {
    const pr = projects.find((p) => String(p.id) === String(projectId));
    setForm((p) => ({
      ...p,
      projectId,
      projet: pr?.nom || '',
      workerIds: [],
      tarif: '',
    }));
  }

  function toggleWorker(workerId) {
    setForm((p) => {
      const ids = p.workerIds.includes(workerId)
        ? p.workerIds.filter((id) => id !== workerId)
        : [...p.workerIds, workerId];
      const first = workers.find((w) => w.id === ids[0]);
      const suggested = first ? suggestHourlyRate(first) : '';
      return {
        ...p,
        workerIds: ids,
        tarif: p.tarif || suggested || '',
      };
    });
  }

  function toggleAllWorkers(checked) {
    if (!checked) {
      setForm((p) => ({ ...p, workerIds: [] }));
      return;
    }
    const ids = projectWorkers.map((w) => w.id);
    const first = projectWorkers[0];
    setForm((p) => ({
      ...p,
      workerIds: ids,
      tarif: p.tarif || (first ? suggestHourlyRate(first) : '') || '',
    }));
  }

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setShowModal(true);
  }

  function openEdit(record) {
    const pr = projects.find((p) => p.nom === record.projet);
    setEditId(record.id);
    setForm({
      projectId: pr?.id ? String(pr.id) : '',
      projet: record.projet || '',
      workerIds: [],
      workerId: record.workerId || '',
      date: record.date || today(),
      heures: String(record.heures ?? ''),
      tarif: String(record.tarif ?? ''),
      motif: record.motif || '',
      statut: record.statut || 'Valide',
    });
    setErrors({});
    setShowModal(true);
  }

  function validate() {
    const e = {};
    if (editId) {
      if (!form.workerId) e.workerId = 'Requis';
      if (!form.projet) e.projet = 'Requis';
    } else {
      if (!form.projectId) e.projectId = 'Requis';
      if (!form.workerIds.length) e.workerIds = 'Sélectionnez au moins un ouvrier';
    }
    if (!form.date) e.date = 'Requis';
    if (!form.heures || Number.isNaN(Number(form.heures)) || Number(form.heures) <= 0) e.heures = 'Valeur valide requise';
    if (!form.tarif || Number.isNaN(Number(form.tarif)) || Number(form.tarif) <= 0) e.tarif = 'Tarif valide requis';
    return e;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    if (editId) {
      const result = await update(editId, {
        workerId: form.workerId,
        projet: form.projet,
        date: form.date,
        heures: form.heures,
        tarif: form.tarif,
        motif: form.motif,
        statut: form.statut,
      });
      if (!result.success) {
        notify('error', result.error || 'Erreur enregistrement.');
        return;
      }
      notify('success', 'Heures supplementaires modifiees.');
    } else {
      const result = await createBatch(
        {
          projet: form.projet,
          date: form.date,
          heures: form.heures,
          tarif: form.tarif,
          motif: form.motif,
          statut: form.statut,
        },
        form.workerIds,
      );
      if (!result.success) {
        notify('error', result.error || 'Erreur enregistrement.');
        return;
      }
      notify('success', `${result.count} enregistrement${result.count > 1 ? 's' : ''} d'heures supplementaires cree${result.count > 1 ? 's' : ''}.`);
    }

    setShowModal(false);
    setEditId(null);
  }

  async function handleDelete(id) {
    const result = await remove(id);
    notify(result.success ? 'success' : 'error', result.success ? 'Supprime.' : (result.error || 'Erreur.'));
  }

  const filtered = useMemo(
    () => filterOvertimeRecords(records, {
      ouvrier: filterOuvrier,
      projet: filterProjet,
      date: filterDate,
      statut: filterStatut,
    }),
    [records, filterOuvrier, filterProjet, filterDate, filterStatut, filterOvertimeRecords],
  );

  const stats = useMemo(() => computeOvertimeStats(filtered), [filtered, computeOvertimeStats]);

  const lineMontant = (Number(form.heures) || 0) * (Number(form.tarif) || 0);
  const previewMontant = editId ? lineMontant : lineMontant * (form.workerIds.length || 0);
  const hasFilters = filterOuvrier || filterProjet || filterDate || filterStatut;

  return (
    <div className="animate-fade-in rh-ext-page">
      <Toast toast={toast} />

      <div className="page-header flex-between finance-page-header">
        <div>
          <h1 className="page-title">Heures supplementaires</h1>
          <p className="page-subtitle finance-sub-hide-mobile">Saisie et calcul automatique du montant du au tarif x heures</p>
        </div>
        <div className="finance-page-actions finance-page-actions--solo">
          <button className="btn btn-primary" onClick={openCreate} disabled={loading || saving}>
            <Plus size={15} /> Ajouter heures sup
          </button>
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
      <div className="stat-grid rh-ext-stat-grid finance-kpi-strip">
        <div className="stat-card">
          <div className="stat-icon orange"><BarChart3 size={18} /></div>
          <div className="stat-body"><div className="stat-value">{loading ? '—' : `${stats.totalHeures}h`}</div><div className="stat-label">Total heures sup</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><TrendingUp size={18} /></div>
          <div className="stat-body"><div className="stat-value">{loading ? '—' : stats.count}</div><div className="stat-label">Enregistrements</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue"><BarChart3 size={18} /></div>
          <div className="stat-body">
            <div className="stat-value" style={{ fontSize: '1rem' }}>{loading ? '—' : fmtMAD(stats.totalMontant)}</div>
            <div className="stat-label">Montant total a payer</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card rh-ext-filter-card">
        <div className="rh-ext-filter-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-3)', fontSize: '0.85rem' }}>
            <Filter size={14} /> Filtres
          </div>
          <select value={filterOuvrier} onChange={e => setFilterOuvrier(e.target.value)}>
            <option value="">Tous les ouvriers</option>
            {workerOptions.map(w => <option key={w.id} value={w.label}>{w.label}</option>)}
          </select>
          <select value={filterProjet} onChange={e => setFilterProjet(e.target.value)}>
            <option value="">Tous les projets</option>
            {chantiers.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
            <option value="">Tous les statuts</option>
            {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
          {hasFilters && (
            <button type="button" onClick={() => { setFilterOuvrier(''); setFilterProjet(''); setFilterDate(''); setFilterStatut(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: '0.82rem', fontWeight: 600 }}>
              Effacer filtres
            </button>
          )}
        </div>
      </div>

      <div className="card rh-ext-table-card">
        <div className="card-title" style={{ marginBottom: 16 }}><BarChart3 size={16} /> Liste des heures supplementaires</div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 24px', color: 'var(--text-3)' }}>
            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ fontSize: '0.88rem' }}>Chargement…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>
            {records.length === 0 ? 'Aucune heure supplementaire enregistree.' : 'Aucun resultat pour ces filtres.'}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Ouvrier</th><th>Date</th><th>Projet</th><th>Heures sup</th><th>Tarif/h</th><th>Montant</th><th>Actions</th><th className="rh-ext-col-index">#</th></tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id}>
                    <td data-label="Ouvrier" style={{ fontWeight: 600 }}>{r.ouvrier}</td>
                    <td data-label="Date" style={{ whiteSpace: 'nowrap' }}>{r.date}</td>
                    <td data-label="Projet" style={{ color: 'var(--text-2)' }}>{r.projet}</td>
                    <td data-label="Heures sup">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-head)', fontWeight: 700, color: '#E65100' }}>
                        {r.heures}h
                      </span>
                    </td>
                    <td data-label="Tarif/h" style={{ fontFamily: 'var(--font-head)', fontWeight: 600 }}>{fmtMAD(r.tarif)}</td>
                    <td data-label="Montant">
                      <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, color: 'var(--red)', fontSize: '0.95rem' }}>
                        {fmtMAD(r.montant)}
                      </span>
                    </td>
                    <td className="rh-ext-actions-cell">
                      <div className="rh-ext-actions">
                        <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }} onClick={() => openEdit(r)} title="Modifier">
                          <Pencil size={13} style={{ color: 'var(--text-2)' }} />
                        </button>
                        <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }} onClick={() => handleDelete(r.id)} title="Supprimer">
                          <X size={13} style={{ color: 'var(--red)' }} />
                        </button>
                      </div>
                    </td>
                    <td className="rh-ext-col-index" style={{ color: 'var(--text-3)', fontSize: '0.78rem' }}>{String(i + 1).padStart(3, '0')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Total row */}
        {filtered.length > 0 && (
          <div className="rh-ext-totals-bar">
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Total heures</div>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, color: '#E65100' }}>{stats.totalHeures}h</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Montant total</div>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, color: 'var(--red)', fontSize: '1.1rem' }}>{fmtMAD(stats.totalMontant)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="rh-ext-modal-overlay" style={{ zIndex: 1000 }}>
          <div className="card rh-ext-modal-box rh-ext-modal-box--md">
            <div className="flex-between" style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.2rem', textTransform: 'uppercase' }}>
                {editId ? 'Modifier heures sup' : 'Heures supplementaires'}
              </h2>
              <button onClick={() => { setShowModal(false); setEditId(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {editId ? (
                <>
                  <div className="form-group">
                    <label>Ouvrier</label>
                    <input
                      type="text"
                      readOnly
                      value={workerOptions.find((w) => w.id === form.workerId)?.label || records.find((r) => r.id === editId)?.ouvrier || '—'}
                      style={{ ...INPUT_S(false), background: 'var(--bg)', color: 'var(--text-2)' }}
                    />
                  </div>
                  <div className="form-group">
                    <label>Projet</label>
                    <input
                      type="text"
                      value={form.projet}
                      onChange={(e) => setF('projet', e.target.value)}
                      style={INPUT_S(errors.projet)}
                    />
                    {errors.projet && <div style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.projet}</div>}
                  </div>
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label>Projet *</label>
                    <select value={form.projectId} onChange={(e) => handleProjectChange(e.target.value)} style={INPUT_S(errors.projectId)}>
                      <option value="">Choisir un projet...</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.ref ? `${p.ref} — ${p.nom}` : p.nom}</option>
                      ))}
                    </select>
                    {errors.projectId && <div style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.projectId}</div>}
                  </div>

                  <div className="form-group">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                      <label style={{ margin: 0 }}>Ouvriers affectes au projet *</label>
                      {projectWorkers.length > 0 && (
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-2)', cursor: 'pointer', fontWeight: 600 }}>
                          <input
                            type="checkbox"
                            checked={allProjectWorkersSelected}
                            onChange={(e) => toggleAllWorkers(e.target.checked)}
                          />
                          Tout selectionner
                        </label>
                      )}
                    </div>

                    {!form.projectId ? (
                      <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-3)', fontSize: '0.85rem' }}>
                        Selectionnez d&apos;abord un projet.
                      </div>
                    ) : projectWorkers.length === 0 ? (
                      <div style={{ padding: '12px 14px', borderRadius: 8, background: '#FFF3E0', border: '1px solid #FFB74D', color: '#E65100', fontSize: '0.85rem' }}>
                        Aucun ouvrier affecte a ce projet
                      </div>
                    ) : (
                      <div style={{ border: '1.5px solid ' + (errors.workerIds ? 'var(--red)' : 'var(--border)'), borderRadius: 8, maxHeight: 220, overflowY: 'auto', background: '#fff' }}>
                        {projectWorkers.map((w) => {
                          const checked = form.workerIds.includes(w.id);
                          const tarifJour = workerTarifJournalier(w);
                          return (
                            <label
                              key={w.id}
                              style={{
                                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                                borderBottom: '1px solid var(--border)', cursor: 'pointer',
                                background: checked ? '#FFF5F5' : '#fff',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleWorker(w.id)}
                                style={{ marginTop: 3 }}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text)' }}>{workerFullName(w)}</div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginTop: 2 }}>
                                  {w.fonction || '—'}
                                  {tarifJour > 0 ? ` · ${Number(tarifJour).toLocaleString('fr-MA')} MAD/jour` : ''}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                    {form.workerIds.length > 0 && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', marginTop: 6, fontWeight: 600 }}>
                        {form.workerIds.length} ouvrier{form.workerIds.length > 1 ? 's' : ''} selectionne{form.workerIds.length > 1 ? 's' : ''}
                      </div>
                    )}
                    {errors.workerIds && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 4 }}>{errors.workerIds}</div>}
                  </div>
                </>
              )}

              <div className="form-group">
                <label>Date *</label>
                <input type="date" value={form.date} onChange={e => setF('date', e.target.value)} style={INPUT_S(errors.date)} />
                {errors.date && <div style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.date}</div>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Nombre d&apos;heures supplementaires *</label>
                  <input type="number" min="0.5" step="0.5" placeholder="ex: 3" value={form.heures} onChange={e => setF('heures', e.target.value)} style={INPUT_S(errors.heures)} />
                  {errors.heures && <div style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.heures}</div>}
                </div>
                <div className="form-group">
                  <label>Tarif / heure (MAD) *</label>
                  <input type="number" min="0" step="0.01" placeholder="ex: 20" value={form.tarif} onChange={e => setF('tarif', e.target.value)} style={INPUT_S(errors.tarif)} />
                  {errors.tarif && <div style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.tarif}</div>}
                </div>
              </div>
              <div className="form-group">
                <label>Observation (optionnelle)</label>
                <textarea
                  value={form.motif}
                  onChange={(e) => setF('motif', e.target.value)}
                  rows={2}
                  placeholder="Remarque ou justification..."
                  style={{ ...INPUT_S(false), resize: 'vertical', minHeight: 64 }}
                />
              </div>
              {previewMontant > 0 && (
                <div style={{ background: '#FFF5F5', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-2)', fontSize: '0.85rem' }}>
                      {editId ? 'Montant calcule' : `Montant total (${form.workerIds.length || 0} ouvrier${form.workerIds.length > 1 ? 's' : ''})`}
                    </span>
                    <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, color: 'var(--red)', fontSize: '1.1rem' }}>{fmtMAD(previewMontant)}</span>
                  </div>
                  {!editId && form.workerIds.length > 1 && lineMontant > 0 && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 4 }}>
                      {fmtMAD(lineMontant)} par ouvrier × {form.workerIds.length}
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowModal(false); setEditId(null); }} disabled={saving}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
                  {editId ? 'Mettre à jour' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
