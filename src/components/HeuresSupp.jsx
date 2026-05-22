import { BarChart3, Plus, X, TrendingUp } from 'lucide-react';
import { useState, useRef } from 'react';
const SEED_PROJECTS = [];

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

const EMPTY_FORM = { ouvrier: '', projet: '', date: today(), heures: '', tarif: '' };

export default function HeuresSupp({ workers: extWorkers }) {
  const workers = extWorkers && extWorkers.length > 0 ? extWorkers : [];
  const [records, setRecords] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);

  function notify(type, msg) {
    setToast({ type, msg });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }

  function setF(k, v) { setForm(p => ({ ...p, [k]: v })); }

  /* Auto-fill tarif from worker's daily rate */
  function handleOuvrierChange(name) {
    const w = workers.find(x => (x.prenom + ' ' + x.nom) === name);
    const tarifSup = w ? Math.round(w.tarif * 1.25) : '';
    setForm(p => ({ ...p, ouvrier: name, tarif: tarifSup ? String(tarifSup) : p.tarif }));
  }

  function validate() {
    const e = {};
    if (!form.ouvrier) e.ouvrier = 'Requis';
    if (!form.projet) e.projet = 'Requis';
    if (!form.date) e.date = 'Requis';
    if (!form.heures || isNaN(Number(form.heures)) || Number(form.heures) <= 0) e.heures = 'Valeur valide requise';
    if (!form.tarif || isNaN(Number(form.tarif)) || Number(form.tarif) <= 0) e.tarif = 'Tarif valide requis';
    return e;
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setRecords(prev => [{ id: Date.now(), ...form, heures: Number(form.heures), tarif: Number(form.tarif) }, ...prev]);
    notify('success', 'Heures supplementaires enregistrees.');
    setShowModal(false);
  }

  const totalHeures = records.reduce((s, r) => s + Number(r.heures), 0);
  const totalMontant = records.reduce((s, r) => s + Number(r.heures) * Number(r.tarif), 0);

  const workerNames = workers.map(w => w.prenom + ' ' + w.nom);

  /* preview montant while typing */
  const previewMontant = (Number(form.heures) || 0) * (Number(form.tarif) || 0);

  return (
    <div className="animate-fade-in">
      <Toast toast={toast} />

      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Heures supplementaires</h1>
          <p className="page-subtitle">Saisie et calcul automatique du montant du au tarif x heures</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(EMPTY_FORM); setErrors({}); setShowModal(true); }}>
          <Plus size={15} /> Ajouter heures sup
        </button>
      </div>

      {/* KPIs */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-icon orange"><BarChart3 size={18} /></div>
          <div className="stat-body"><div className="stat-value">{totalHeures}h</div><div className="stat-label">Total heures sup</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><TrendingUp size={18} /></div>
          <div className="stat-body"><div className="stat-value">{records.length}</div><div className="stat-label">Enregistrements</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue"><BarChart3 size={18} /></div>
          <div className="stat-body">
            <div className="stat-value" style={{ fontSize: '1rem' }}>{fmtMAD(totalMontant)}</div>
            <div className="stat-label">Montant total a payer</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 16 }}><BarChart3 size={16} /> Liste des heures supplementaires</div>
        {records.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>Aucune heure supplementaire enregistree.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>#</th><th>Ouvrier</th><th>Projet</th><th>Date</th><th>Heures sup</th><th>Tarif/h (MAD)</th><th>Montant (MAD)</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {records.map((r, i) => {
                  const montant = Number(r.heures) * Number(r.tarif);
                  return (
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
                          {fmtMAD(montant)}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }} onClick={() => {
                          setRecords(prev => prev.filter(x => x.id !== r.id));
                          notify('success', 'Supprime.');
                        }}>
                          <X size={13} style={{ color: 'var(--red)' }} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Total row */}
        {records.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, padding: '10px 16px', background: '#FFF5F5', borderRadius: 8, gap: 32 }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Total heures</div>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, color: '#E65100' }}>{totalHeures}h</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Montant total</div>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, color: 'var(--red)', fontSize: '1.1rem' }}>{fmtMAD(totalMontant)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 32, width: '100%', maxWidth: 480, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex-between" style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.2rem', textTransform: 'uppercase' }}>Heures supplementaires</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label>Ouvrier</label>
                <select value={form.ouvrier} onChange={e => handleOuvrierChange(e.target.value)} style={INPUT_S(errors.ouvrier)}>
                  <option value="">Choisir un ouvrier...</option>
                  {workerNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                {errors.ouvrier && <div style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.ouvrier}</div>}
              </div>
              <div className="form-group">
                <label>Projet</label>
                <select value={form.projet} onChange={e => setF('projet', e.target.value)} style={INPUT_S(errors.projet)}>
                  <option value="">Choisir un projet...</option>
                  {SEED_PROJECTS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                {errors.projet && <div style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.projet}</div>}
              </div>
              <div className="form-group">
                <label>Date</label>
                <input type="date" value={form.date} onChange={e => setF('date', e.target.value)} style={INPUT_S(errors.date)} />
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
              {/* Auto-calculated preview */}
              {previewMontant > 0 && (
                <div style={{ background: '#FFF5F5', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-2)', fontSize: '0.85rem' }}>Montant calcule automatiquement</span>
                  <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, color: 'var(--red)', fontSize: '1.1rem' }}>{fmtMAD(previewMontant)}</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary"><Plus size={14} /> Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
