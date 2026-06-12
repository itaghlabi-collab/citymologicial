import {
  Banknote, CheckCircle, Filter, Search, Users, TrendingUp, Plus, Pencil, Trash2, Loader2, X,
} from 'lucide-react';
import { useState, useRef, useMemo } from 'react';
import { useWorkerPayroll } from '../hooks/useWorkerPayroll';
import { calcWorkerLineAmount, PAYROLL_UI_STATUTS, buildWorkerPayrollLine } from '../services/rh/workerPayroll';
import { workerFullName } from '../services/rh/attendance';
import { workerTarifHoraire } from '../services/rh/workers';

function fmtMAD(n) {
  return Number(n).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';
}

function today() {
  return new Date().toISOString().slice(0, 10);
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

const EMPTY_BATCH = {
  projectId: '',
  projet: '',
  paymentDate: today(),
  statut: 'En attente',
  notes: '',
  selected: {},
};

export default function PaiementHebdo() {
  const {
    records, projects, workersByProject, loading, saving, error, configured, load,
    createBatch, update, markPaid, remove, filterWorkerPayroll, computePayrollStats, chantiers,
  } = useWorkerPayroll();

  const [search, setSearch] = useState('');
  const [filterProjet, setFilterProjet] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_BATCH);
  const [editForm, setEditForm] = useState({});
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);

  function notify(type, msg) {
    setToast({ type, msg });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }

  const projectWorkers = useMemo(
    () => (editId ? [] : workersByProject(form.projectId)),
    [editId, form.projectId, workersByProject],
  );

  const selectedLines = useMemo(() => {
    return Object.entries(form.selected)
      .filter(([, v]) => v.checked)
      .map(([workerId, v]) => ({
        workerId,
        heures: Number(v.heures) || 0,
        tarifHoraire: Number(v.tarifHoraire) || 0,
      }));
  }, [form.selected]);

  const batchTotal = useMemo(
    () => selectedLines.reduce((s, l) => s + calcWorkerLineAmount(l.heures, l.tarifHoraire), 0),
    [selectedLines],
  );

  function handleProjectChange(projectId) {
    const pr = projects.find((p) => String(p.id) === String(projectId));
    setForm((p) => ({ ...p, projectId, projet: pr?.nom || '', selected: {} }));
  }

  function toggleWorker(worker) {
    setForm((p) => {
      const sel = { ...p.selected };
      if (sel[worker.id]?.checked) {
        delete sel[worker.id];
      } else {
        const line = buildWorkerPayrollLine(worker);
        sel[worker.id] = { checked: true, heures: '', tarifHoraire: line.tarifHoraire };
      }
      return { ...p, selected: sel };
    });
  }

  function toggleAll(checked) {
    if (!checked) {
      setForm((p) => ({ ...p, selected: {} }));
      return;
    }
    const sel = {};
    projectWorkers.forEach((w) => {
      const line = buildWorkerPayrollLine(w);
      sel[w.id] = { checked: true, heures: '', tarifHoraire: line.tarifHoraire };
    });
    setForm((p) => ({ ...p, selected: sel }));
  }

  function setWorkerField(workerId, field, value) {
    setForm((p) => ({
      ...p,
      selected: {
        ...p.selected,
        [workerId]: { ...p.selected[workerId], [field]: value },
      },
    }));
  }

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_BATCH);
    setErrors({});
    setShowModal(true);
  }

  function openEdit(record) {
    setEditId(record.id);
    setEditForm({
      projectId: record.projectId || '',
      projet: record.projet || '',
      paymentDate: record.paymentDate || today(),
      heures: String(record.heures ?? ''),
      tarifHoraire: String(record.tarifHoraire ?? ''),
      statut: record.statut || 'En attente',
      notes: record.notes || '',
    });
    setErrors({});
    setShowModal(true);
  }

  function validateBatch() {
    const e = {};
    if (!form.projectId) e.projectId = 'Requis';
    if (!form.paymentDate) e.paymentDate = 'Requis';
    if (!selectedLines.length) e.workers = 'Sélectionnez au moins un ouvrier';
    selectedLines.forEach((l) => {
      if (!l.heures || l.heures <= 0) e[`h_${l.workerId}`] = 'Heures requises';
    });
    return e;
  }

  function validateEdit() {
    const e = {};
    if (!editForm.heures || Number(editForm.heures) <= 0) e.heures = 'Heures requises';
    if (!editForm.tarifHoraire || Number(editForm.tarifHoraire) <= 0) e.tarifHoraire = 'Tarif requis';
    return e;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (editId) {
      const errs = validateEdit();
      if (Object.keys(errs).length) { setErrors(errs); return; }
      const result = await update(editId, editForm);
      if (!result.success) { notify('error', result.error || 'Erreur.'); return; }
      notify('success', 'Paiement modifié.');
    } else {
      const errs = validateBatch();
      if (Object.keys(errs).length) { setErrors(errs); return; }
      const result = await createBatch(
        {
          projectId: form.projectId,
          projet: form.projet,
          paymentDate: form.paymentDate,
          statut: form.statut,
          notes: form.notes,
        },
        selectedLines,
      );
      if (!result.success) { notify('error', result.error || 'Erreur.'); return; }
      notify('success', `${result.count} paiement(s) enregistré(s) — total ${fmtMAD(batchTotal)}`);
    }
    setShowModal(false);
  }

  async function handleDelete(id) {
    if (!window.confirm('Supprimer ce paiement ?')) return;
    const result = await remove(id);
    notify(result.success ? 'success' : 'error', result.success ? 'Supprimé.' : (result.error || 'Erreur.'));
  }

  const filtered = useMemo(
    () => filterWorkerPayroll(records, { search, projet: filterProjet, statut: filterStatut }),
    [records, search, filterProjet, filterStatut, filterWorkerPayroll],
  );

  const stats = useMemo(() => computePayrollStats(filtered), [filtered, computePayrollStats]);
  const allSelected = projectWorkers.length > 0 && projectWorkers.every((w) => form.selected[w.id]?.checked);
  const hasFilters = search || filterProjet || filterStatut;
  const editPreview = calcWorkerLineAmount(editForm.heures, editForm.tarifHoraire);

  return (
    <div className="animate-fade-in">
      <Toast toast={toast} />

      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Paiement hebdomadaire ouvriers</h1>
          <p className="page-subtitle">Projet → ouvriers affectés → heures × tarif horaire (MAD)</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate} disabled={loading || saving || !configured}>
          <Plus size={15} /> Nouveau paiement
        </button>
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

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-icon blue"><Banknote size={18} /></div>
          <div className="stat-body">
            <div className="stat-value" style={{ fontSize: '1rem' }}>{loading ? '—' : fmtMAD(stats.totalAPayer)}</div>
            <div className="stat-label">Total</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><CheckCircle size={18} /></div>
          <div className="stat-body">
            <div className="stat-value" style={{ fontSize: '1rem' }}>{loading ? '—' : fmtMAD(stats.totalPaye)}</div>
            <div className="stat-label">Payé</div>
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
            <div className="stat-label">Lignes</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12, padding: '14px 20px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Filter size={14} style={{ color: 'var(--text-3)' }} />
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input placeholder="Rechercher un ouvrier..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 28, padding: '7px 12px 7px 28px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.85rem' }} />
          </div>
          <select value={filterProjet} onChange={(e) => setFilterProjet(e.target.value)} style={{ padding: '7px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.85rem', background: '#fff' }}>
            <option value="">Tous les projets</option>
            {chantiers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} style={{ padding: '7px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.85rem', background: '#fff' }}>
            <option value="">Tous les statuts</option>
            {PAYROLL_UI_STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {hasFilters && (
            <button type="button" onClick={() => { setSearch(''); setFilterProjet(''); setFilterStatut(''); }} style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>Effacer</button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 16 }}><Banknote size={16} /> Paiements ouvriers</div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}><Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />Chargement…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: '0.88rem' }}>
            {records.length === 0 ? 'Aucun paiement. Cliquez sur « Nouveau paiement ».' : 'Aucun résultat.'}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Ouvrier</th><th>Fonction</th><th>Projet</th>
                  <th>Heures</th><th>Tarif/h</th><th>Montant</th><th>Statut</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td>{p.paymentDate ? new Date(p.paymentDate).toLocaleDateString('fr-MA') : '—'}</td>
                    <td style={{ fontWeight: 600 }}>{p.ouvrier}</td>
                    <td>{p.fonction || '—'}</td>
                    <td>{p.projet || '—'}</td>
                    <td>{p.heures} h</td>
                    <td>{fmtMAD(p.tarifHoraire)}</td>
                    <td style={{ fontWeight: 800, color: 'var(--red)' }}>{fmtMAD(p.total)}</td>
                    <td>
                      <span className={'badge ' + (p.statut === 'Payé' ? 'badge-green' : p.statut === 'En attente' ? 'badge-orange' : 'badge-red')}>
                        {p.statut}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {p.statut === 'En attente' && (
                          <button type="button" className="btn btn-sm" style={{ background: '#E8F5E9', color: '#2E7D32', border: 'none' }} onClick={() => markPaid(p.id).then((r) => notify(r.success ? 'success' : 'error', r.success ? 'Marqué payé.' : r.error))}>Payer</button>
                        )}
                        <button type="button" onClick={() => openEdit(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><Pencil size={14} /></button>
                        <button type="button" onClick={() => handleDelete(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 640, maxHeight: '92vh', overflowY: 'auto', padding: 24 }}>
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem', margin: 0 }}>
                {editId ? 'Modifier paiement ouvrier' : 'Nouveau paiement ouvriers'}
              </h2>
              <button type="button" onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <form onSubmit={handleSubmit}>
              {editId ? (
                <div style={{ display: 'grid', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Heures travaillées *</label>
                      <input type="number" min="0" step="0.5" value={editForm.heures} onChange={(e) => setEditForm((p) => ({ ...p, heures: e.target.value }))} style={INPUT_S(errors.heures)} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Tarif horaire *</label>
                      <input type="number" min="0" step="0.01" value={editForm.tarifHoraire} onChange={(e) => setEditForm((p) => ({ ...p, tarifHoraire: e.target.value }))} style={INPUT_S(errors.tarifHoraire)} />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Statut</label>
                    <select value={editForm.statut} onChange={(e) => setEditForm((p) => ({ ...p, statut: e.target.value }))} style={INPUT_S(false)}>
                      {PAYROLL_UI_STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div style={{ padding: 12, background: '#F8F9FA', borderRadius: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Montant</span><strong style={{ color: 'var(--red)' }}>{fmtMAD(editPreview)}</strong>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Projet / chantier *</label>
                    <select value={form.projectId} onChange={(e) => handleProjectChange(e.target.value)} style={INPUT_S(errors.projectId)}>
                      <option value="">Choisir un projet…</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.ref ? `${p.ref} — ${p.nom}` : p.nom}</option>)}
                    </select>
                    {errors.projectId && <div style={{ color: 'var(--red)', fontSize: '0.78rem' }}>{errors.projectId}</div>}
                  </div>

                  <div>
                    <div className="flex-between" style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Ouvriers affectés *</label>
                      {projectWorkers.length > 0 && (
                        <label style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <input type="checkbox" checked={allSelected} onChange={(e) => toggleAll(e.target.checked)} /> Tout sélectionner
                        </label>
                      )}
                    </div>
                    {!form.projectId ? (
                      <div style={{ padding: 12, background: 'var(--bg)', borderRadius: 8, color: 'var(--text-3)', fontSize: '0.85rem' }}>Sélectionnez d&apos;abord un projet.</div>
                    ) : projectWorkers.length === 0 ? (
                      <div style={{ padding: 12, background: '#FFF3E0', borderRadius: 8, color: '#E65100', fontSize: '0.85rem' }}>Aucun ouvrier affecté à ce projet.</div>
                    ) : (
                      <div style={{ border: '1.5px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 90px 90px 100px', gap: 8, padding: '8px 12px', background: '#F8F9FA', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)' }}>
                          <span /><span>Ouvrier</span><span>Tarif/h</span><span>Heures</span><span>Montant</span>
                        </div>
                        {projectWorkers.map((w) => {
                          const sel = form.selected[w.id];
                          const tarifH = sel?.tarifHoraire ?? workerTarifHoraire(w);
                          const montant = calcWorkerLineAmount(sel?.heures, tarifH);
                          return (
                            <div key={w.id} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 90px 90px 100px', gap: 8, padding: '10px 12px', borderTop: '1px solid var(--border)', alignItems: 'center', background: sel?.checked ? '#FFF5F5' : '#fff' }}>
                              <input type="checkbox" checked={!!sel?.checked} onChange={() => toggleWorker(w)} />
                              <div>
                                <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{workerFullName(w)}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{w.fonction || '—'}</div>
                              </div>
                              <span style={{ fontSize: '0.82rem' }}>{fmtMAD(tarifH)}</span>
                              <input
                                type="number" min="0" step="0.5" disabled={!sel?.checked}
                                value={sel?.heures ?? ''} placeholder="h"
                                onChange={(e) => setWorkerField(w.id, 'heures', e.target.value)}
                                style={{ ...INPUT_S(errors[`h_${w.id}`]), padding: '6px 8px', fontSize: '0.85rem' }}
                              />
                              <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--red)' }}>{sel?.checked && montant > 0 ? fmtMAD(montant) : '—'}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {errors.workers && <div style={{ color: 'var(--red)', fontSize: '0.78rem', marginTop: 4 }}>{errors.workers}</div>}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Date de paiement *</label>
                      <input type="date" value={form.paymentDate} onChange={(e) => setForm((p) => ({ ...p, paymentDate: e.target.value }))} style={INPUT_S(errors.paymentDate)} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Statut</label>
                      <select value={form.statut} onChange={(e) => setForm((p) => ({ ...p, statut: e.target.value }))} style={INPUT_S(false)}>
                        {PAYROLL_UI_STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>

                  {batchTotal > 0 && (
                    <div style={{ padding: '12px 14px', background: '#FFF5F5', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600 }}>Total général ({selectedLines.length} ouvrier{selectedLines.length > 1 ? 's' : ''})</span>
                      <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, color: 'var(--red)', fontSize: '1.15rem' }}>{fmtMAD(batchTotal)}</span>
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
