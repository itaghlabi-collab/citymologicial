import { BarChart3, Plus, X, TrendingUp, Filter, Pencil, Loader2 } from 'lucide-react';
import { useState, useRef, useMemo } from 'react';
import { useOvertime } from '../hooks/useOvertime';

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

function today() { return new Date().toISOString().slice(0, 10); }

const STATUS_OPTS = ['Brouillon', 'Valide', 'Paye'];

const EMPTY_FORM = {
  workerId: '',
  projet: '',
  date: today(),
  heures: '',
  tarif: '',
  statut: 'Valide',
};

export default function HeuresSupp() {
  const {
    records,
    workers,
    workerOptions,
    chantiers,
    loading,
    saving,
    error,
    configured,
    load,
    create,
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

  function handleOuvrierChange(workerId) {
    const w = workers.find((x) => x.id === workerId);
    const tarifSup = w ? Math.round(w.tarif * 1.25) : '';
    setForm((p) => ({
      ...p,
      workerId,
      projet: p.projet || w?.chantier || '',
      tarif: tarifSup ? String(tarifSup) : p.tarif,
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
      date: record.date || today(),
      heures: String(record.heures ?? ''),
      tarif: String(record.tarif ?? ''),
      statut: record.statut || 'Valide',
    });
    setErrors({});
    setShowModal(true);
  }

  function validate() {
    const e = {};
    if (!form.workerId) e.workerId = 'Requis';
    if (!form.projet) e.projet = 'Requis';
    if (!form.date) e.date = 'Requis';
    if (!form.heures || Number.isNaN(Number(form.heures)) || Number(form.heures) <= 0) e.heures = 'Valeur valide requise';
    if (!form.tarif || Number.isNaN(Number(form.tarif)) || Number(form.tarif) <= 0) e.tarif = 'Tarif valide requis';
    return e;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const result = editId ? await update(editId, form) : await create(form);
    if (!result.success) {
      notify('error', result.error || 'Erreur enregistrement.');
      return;
    }

    notify('success', editId ? 'Heures supplementaires modifiees.' : 'Heures supplementaires enregistrees.');
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

  const previewMontant = (Number(form.heures) || 0) * (Number(form.tarif) || 0);
  const hasFilters = filterOuvrier || filterProjet || filterDate || filterStatut;

  return (
    <div className="animate-fade-in">
      <Toast toast={toast} />

      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Heures supplementaires</h1>
          <p className="page-subtitle">Saisie et calcul automatique du montant du au tarif x heures</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate} disabled={loading || saving}>
          <Plus size={15} /> Ajouter heures sup
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

      {/* KPIs */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', marginBottom: 16 }}>
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
      <div className="card" style={{ marginBottom: 12, padding: '14px 20px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-3)', fontSize: '0.85rem' }}>
            <Filter size={14} /> Filtres
          </div>
          <select value={filterOuvrier} onChange={e => setFilterOuvrier(e.target.value)} style={{ padding: '7px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.85rem', fontFamily: 'var(--font-body)', outline: 'none', background: '#fff' }}>
            <option value="">Tous les ouvriers</option>
            {workerOptions.map(w => <option key={w.id} value={w.label}>{w.label}</option>)}
          </select>
          <select value={filterProjet} onChange={e => setFilterProjet(e.target.value)} style={{ padding: '7px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.85rem', fontFamily: 'var(--font-body)', outline: 'none', background: '#fff' }}>
            <option value="">Tous les projets</option>
            {chantiers.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} style={{ padding: '7px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.85rem', fontFamily: 'var(--font-body)', outline: 'none', background: '#fff' }}>
            <option value="">Tous les statuts</option>
            {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ padding: '7px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.85rem', fontFamily: 'var(--font-body)', outline: 'none' }} />
          {hasFilters && (
            <button onClick={() => { setFilterOuvrier(''); setFilterProjet(''); setFilterDate(''); setFilterStatut(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: '0.82rem', fontWeight: 600 }}>
              Effacer filtres
            </button>
          )}
        </div>
      </div>

      <div className="card">
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
                <tr><th>#</th><th>Ouvrier</th><th>Projet</th><th>Date</th><th>Heures sup</th><th>Tarif/h (MAD)</th><th>Montant (MAD)</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id}>
                    <td style={{ color: 'var(--text-3)', fontSize: '0.78rem' }}>{String(i + 1).padStart(3, '0')}</td>
                    <td style={{ fontWeight: 600 }}>{r.ouvrier}</td>
                    <td style={{ color: 'var(--text-2)' }}>{r.projet}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.date}</td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-head)', fontWeight: 700, color: '#E65100' }}>
                        {r.heures}h
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-head)', fontWeight: 600 }}>{fmtMAD(r.tarif)}</td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, color: 'var(--red)', fontSize: '0.95rem' }}>
                        {fmtMAD(r.montant)}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }} onClick={() => openEdit(r)} title="Modifier">
                          <Pencil size={13} style={{ color: 'var(--text-2)' }} />
                        </button>
                        <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }} onClick={() => handleDelete(r.id)} title="Supprimer">
                          <X size={13} style={{ color: 'var(--red)' }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Total row */}
        {filtered.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, padding: '10px 16px', background: '#FFF5F5', borderRadius: 8, gap: 32 }}>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 32, width: '100%', maxWidth: 480, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex-between" style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.2rem', textTransform: 'uppercase' }}>
                {editId ? 'Modifier heures sup' : 'Heures supplementaires'}
              </h2>
              <button onClick={() => { setShowModal(false); setEditId(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label>Ouvrier</label>
                <select value={form.workerId} onChange={e => handleOuvrierChange(e.target.value)} style={INPUT_S(errors.workerId)}>
                  <option value="">Choisir un ouvrier...</option>
                  {workerOptions.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
                </select>
                {errors.workerId && <div style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.workerId}</div>}
              </div>
              <div className="form-group">
                <label>Projet</label>
                <select value={form.projet} onChange={e => setF('projet', e.target.value)} style={INPUT_S(errors.projet)}>
                  <option value="">Choisir un projet...</option>
                  {chantiers.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                {errors.projet && <div style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.projet}</div>}
              </div>
              <div className="form-group">
                <label>Date</label>
                <input type="date" value={form.date} onChange={e => setF('date', e.target.value)} style={INPUT_S(errors.date)} />
                {errors.date && <div style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.date}</div>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Nb. heures supplementaires</label>
                  <input type="number" min="0.5" step="0.5" placeholder="ex: 3" value={form.heures} onChange={e => setF('heures', e.target.value)} style={INPUT_S(errors.heures)} />
                  {errors.heures && <div style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.heures}</div>}
                </div>
                <div className="form-group">
                  <label>Tarif / heure (MAD)</label>
                  <input type="number" min="0" placeholder="ex: 87" value={form.tarif} onChange={e => setF('tarif', e.target.value)} style={INPUT_S(errors.tarif)} />
                  {errors.tarif && <div style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.tarif}</div>}
                </div>
              </div>
              {previewMontant > 0 && (
                <div style={{ background: '#FFF5F5', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-2)', fontSize: '0.85rem' }}>Montant calcule automatiquement</span>
                  <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, color: 'var(--red)', fontSize: '1.1rem' }}>{fmtMAD(previewMontant)}</span>
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
