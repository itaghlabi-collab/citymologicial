import { ClockIcon, Plus, X, Filter, CheckCircle, XCircle, CalendarOff } from 'lucide-react';

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
import { useState, useRef } from 'react';
const SEED_PROJECTS = [];

const STATUS_OPTS = ['Present', 'Absent', 'Retard', 'Demi-journee'];
const STATUS_BADGE = { Present: 'badge-green', Absent: 'badge-red', Retard: 'badge-orange', 'Demi-journee': 'badge-blue' };

function today() { return new Date().toISOString().slice(0, 10); }

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

const EMPTY_FORM = { ouvrier: '', projet: '', date: today(), heureEntree: '07:30', heureSortie: '17:00', statut: 'Present', notes: '' };

export default function Presence({ workers: extWorkers }) {
  const workers = extWorkers && extWorkers.length > 0 ? extWorkers : [];
  const [records, setRecords] = useState([]);
  const [filterOuvrier, setFilterOuvrier] = useState('');
  const [filterProjet, setFilterProjet] = useState('');
  const [filterDate, setFilterDate] = useState('');
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

  function validate() {
    const e = {};
    if (!form.ouvrier) e.ouvrier = 'Requis';
    if (!form.projet) e.projet = 'Requis';
    if (!form.date) e.date = 'Requis';
    return e;
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setRecords(prev => [{ id: Date.now(), ...form }, ...prev]);
    notify('success', 'Presence enregistree.');
    setShowModal(false);
  }

  const filtered = records.filter(r => {
    if (filterOuvrier && !r.ouvrier.toLowerCase().includes(filterOuvrier.toLowerCase())) return false;
    if (filterProjet && r.projet !== filterProjet) return false;
    if (filterDate && r.date !== filterDate) return false;
    return true;
  });

  const totalPresent = filtered.filter(r => r.statut === 'Present').length;
  const totalAbsent = filtered.filter(r => r.statut === 'Absent').length;

  const workerNames = workers.map(w => w.prenom + ' ' + w.nom);

  return (
    <div className="animate-fade-in">
      <Toast toast={toast} />

      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Presence ouvriers</h1>
          <p className="page-subtitle">Suivi des entrees, sorties et absences</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(EMPTY_FORM); setErrors({}); setShowModal(true); }}>
          <Plus size={15} /> Ajouter une presence
        </button>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-icon green"><CheckCircle size={18} /></div>
          <div className="stat-body"><div className="stat-value">{totalPresent}</div><div className="stat-label">Presents</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><XCircle size={18} /></div>
          <div className="stat-body"><div className="stat-value">{totalAbsent}</div><div className="stat-label">Absents</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue"><ClockIcon size={18} /></div>
          <div className="stat-body"><div className="stat-value">{filtered.length}</div><div className="stat-label">Enregistrements</div></div>
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
            {workerNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <select value={filterProjet} onChange={e => setFilterProjet(e.target.value)} style={{ padding: '7px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.85rem', fontFamily: 'var(--font-body)', outline: 'none', background: '#fff' }}>
            <option value="">Tous les projets</option>
            {SEED_PROJECTS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ padding: '7px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.85rem', fontFamily: 'var(--font-body)', outline: 'none' }} />
          {(filterOuvrier || filterProjet || filterDate) && (
            <button onClick={() => { setFilterOuvrier(''); setFilterProjet(''); setFilterDate(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: '0.82rem', fontWeight: 600 }}>
              Effacer filtres
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 16 }}><ClockIcon size={16} /> Feuille de presence</div>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<CalendarOff size={22} style={{ color: 'var(--text-3)' }} />}
            title={records.length === 0 ? "Aucune presence enregistree" : "Aucun resultat pour ces filtres"}
            sub={records.length === 0 ? "Ajoutez la premiere feuille de presence via le bouton ci-dessus" : "Modifiez vos criteres de recherche"}
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>#</th><th>Ouvrier</th><th>Projet</th><th>Date</th><th>Entree</th><th>Sortie</th><th>Statut</th><th>Notes</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id}>
                    <td style={{ color: 'var(--text-3)', fontSize: '0.78rem' }}>{String(i + 1).padStart(3, '0')}</td>
                    <td style={{ fontWeight: 600 }}>{r.ouvrier}</td>
                    <td style={{ color: 'var(--text-2)' }}>{r.projet}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.date}</td>
                    <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}>{r.heureEntree || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}>{r.heureSortie || '—'}</td>
                    <td><span className={'badge ' + (STATUS_BADGE[r.statut] || 'badge-grey')}>{r.statut}</span></td>
                    <td style={{ color: 'var(--text-3)', fontSize: '0.82rem', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.notes || '—'}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }} onClick={() => {
                        setRecords(prev => prev.filter(x => x.id !== r.id));
                        notify('success', 'Enregistrement supprime.');
                      }}>
                        <X size={13} style={{ color: 'var(--red)' }} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 32, width: '100%', maxWidth: 500, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex-between" style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.2rem', textTransform: 'uppercase' }}>Ajouter une presence</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Ouvrier</label>
                  <select value={form.ouvrier} onChange={e => setF('ouvrier', e.target.value)} style={INPUT_S(errors.ouvrier)}>
                    <option value="">Choisir...</option>
                    {workerNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  {errors.ouvrier && <div style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.ouvrier}</div>}
                </div>
                <div className="form-group">
                  <label>Projet</label>
                  <select value={form.projet} onChange={e => setF('projet', e.target.value)} style={INPUT_S(errors.projet)}>
                    <option value="">Choisir...</option>
                    {SEED_PROJECTS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  {errors.projet && <div style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.projet}</div>}
                </div>
              </div>
              <div className="form-group">
                <label>Date</label>
                <input type="date" value={form.date} onChange={e => setF('date', e.target.value)} style={INPUT_S(errors.date)} />
                {errors.date && <div style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.date}</div>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Heure entree</label>
                  <input type="time" value={form.heureEntree} onChange={e => setF('heureEntree', e.target.value)} style={INPUT_S(false)} />
                </div>
                <div className="form-group">
                  <label>Heure sortie</label>
                  <input type="time" value={form.heureSortie} onChange={e => setF('heureSortie', e.target.value)} style={INPUT_S(false)} />
                </div>
              </div>
              <div className="form-group">
                <label>Statut</label>
                <select value={form.statut} onChange={e => setF('statut', e.target.value)} style={INPUT_S(false)}>
                  {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Notes (optionnel)</label>
                <textarea rows={2} value={form.notes} onChange={e => setF('notes', e.target.value)} style={{ ...INPUT_S(false), resize: 'vertical' }} placeholder="Remarques..." />
              </div>
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
