import { DollarSign, TrendingUp, TrendingDown, Plus, Edit2, FileText, CreditCard, X, Filter } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { getExpenses, createExpense, getPaymentOrders, getInvoices } from '../services/api';
import { DEPARTMENTS } from '../data/departments';

function fmtMAD(n) {
  const num = typeof n === 'string' ? parseFloat(n.replace(/[\s,]/g, '')) : Number(n);
  if (isNaN(num)) return (n || 0) + ' MAD';
  return num.toLocaleString('fr-MA') + ' MAD';
}

function Toast({ toast }) {
  if (!toast) return null;
  const bg = toast.type === 'success' ? '#2E7D32' : '#D32F2F';
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: bg, color: '#fff', padding: '12px 20px', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.22)', fontSize: '0.88rem', fontWeight: 600, maxWidth: 340, animation: 'fadeUp 0.3s ease' }}>
      {toast.msg}
    </div>
  );
}

const TAB_STYLE = (active) => ({
  padding: '10px 20px', border: 'none', cursor: 'pointer',
  fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.875rem', background: 'none',
  color: active ? 'var(--red)' : 'var(--text-2)',
  borderBottom: active ? '2px solid var(--red)' : '2px solid transparent',
  marginBottom: -2, transition: 'all 0.15s',
});

const INPUT_STYLE = (hasErr) => ({
  padding: '9px 12px', border: '1.5px solid ' + (hasErr ? 'var(--red)' : 'var(--border)'),
  borderRadius: 'var(--radius)', fontSize: '0.9rem', fontFamily: 'var(--font-body)',
  outline: 'none', width: '100%', background: '#fff',
});

const EMPTY_CHARGE = { libelle: '', montant: '', categorie: 'Salaires', departement_id: '', date: '', statut: 'En attente' };
const CATEGORIES = ['Salaires', 'Energie', 'Immobilier', 'Materiaux', 'Logistique', 'Fournitures', 'Assurances', 'Autres'];

export default function Comptabilite() {
  const [tab, setTab] = useState('charges');
  const [filterDept, setFilterDept] = useState('');
  const [charges, setCharges] = useState([]);
  const [paiements, setPaiements] = useState([]);
  const [factures, setFactures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_CHARGE);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);

  function showToast(type, msg) {
    setToast({ type, msg });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    setLoading(true);
    const [c, p, f] = await Promise.all([getExpenses(), getPaymentOrders(), getInvoices()]);
    setCharges(c); setPaiements(p); setFactures(f);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function setField(k, v) { setForm(prev => ({ ...prev, [k]: v })); }

  function validate() {
    const e = {};
    if (!form.libelle?.trim()) e.libelle = 'Requis';
    if (!form.montant || isNaN(Number(form.montant))) e.montant = 'Montant invalide';
    return e;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      await createExpense({ ...form, montant: Number(form.montant) });
      showToast('success', 'Charge creee avec succes !');
      setShowModal(false);
      setForm(EMPTY_CHARGE);
      setErrors({});
      load();
    } catch (err) {
      showToast('error', err.message || 'Erreur lors de la creation.');
    } finally {
      setSaving(false);
    }
  }

  /* KPI computed values */
  const totalEntrees = factures.filter(f => f.status === 'paid' || f.status === 'Payee').reduce((s, f) => s + Number(f.montant || f.amount || 0), 0);
  const totalCharges = charges.reduce((s, c) => s + Number(c.montant || c.amount || 0), 0);
  const soldeNet = totalEntrees - totalCharges;
  const ordresEnCours = paiements.filter(p => p.status === 'En cours' || p.status === 'pending').length;

  /* Bar chart data (charges by category) */
  const catTotals = {};
  charges.forEach(c => {
    const cat = c.categorie || c.category || 'Autres';
    catTotals[cat] = (catTotals[cat] || 0) + Number(c.montant || c.amount || 0);
  });
  const catEntries = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxCat = catEntries.length ? Math.max(...catEntries.map(([, v]) => v)) : 1;

  const Spinner = () => (
    <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>
      <div style={{ width: 28, height: 28, border: '3px solid var(--border)', borderTopColor: 'var(--red)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 10px' }} />
      Chargement...
    </div>
  );

  return (
    <div className="animate-fade-in">
      <Toast toast={toast} />

      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Comptabilite / Tresorerie</h1>
          <p className="page-subtitle">Charges, paiements et suivi de tresorerie</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(EMPTY_CHARGE); setErrors({}); setShowModal(true); }}>
          <Plus size={15} /> Nouvelle charge
        </button>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-icon green"><TrendingUp size={18} /></div>
          <div className="stat-body"><div className="stat-value">{loading ? '—' : fmtMAD(totalEntrees)}</div><div className="stat-label">Entrees (factures payees)</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><TrendingDown size={18} /></div>
          <div className="stat-body"><div className="stat-value">{loading ? '—' : fmtMAD(totalCharges)}</div><div className="stat-label">Charges totales</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue"><DollarSign size={18} /></div>
          <div className="stat-body"><div className="stat-value" style={{ color: soldeNet >= 0 ? '#2E7D32' : 'var(--red)' }}>{loading ? '—' : fmtMAD(soldeNet)}</div><div className="stat-label">Solde net (MAD)</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><CreditCard size={18} /></div>
          <div className="stat-body"><div className="stat-value">{loading ? '—' : ordresEnCours}</div><div className="stat-label">Ordres en cours</div></div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid var(--border)' }}>
        {[['charges','Charges'],['paiements','Ordres de paiement'],['tresorerie','Repartition charges']].map(([k, v]) => (
          <button key={k} onClick={() => setTab(k)} style={TAB_STYLE(tab === k)}>{v}</button>
        ))}
      </div>

      {/* ── CHARGES ── */}
      {tab === 'charges' && (
        <div className="card">
          <div className="flex-between mb-4">
            <div className="card-title" style={{ marginBottom: 0 }}><TrendingDown size={16} /> Charges</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.82rem', color: 'var(--text-3)' }}><Filter size={13} /></div>
              <select value={filterDept} onChange={e => setFilterDept(e.target.value)} style={{ padding: '6px 10px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.82rem', fontFamily: 'var(--font-body)', outline: 'none', background: '#fff' }}>
                <option value="">Tous les departements</option>
                {DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{d.code} — {d.nom}</option>)}
              </select>
              <button className="btn btn-primary btn-sm" onClick={() => { setForm(EMPTY_CHARGE); setErrors({}); setShowModal(true); }}>
                <Plus size={14} /> Ajouter
              </button>
            </div>
          </div>
          {loading ? <Spinner /> : charges.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-3)' }}>Aucune charge enregistree.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Reference</th><th>Libelle</th><th>Departement</th><th>Categorie</th><th>Montant (MAD)</th><th>Date</th><th>Statut</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {charges.filter(c => !filterDept || Number(c.departement_id) === Number(filterDept)).map((c, i) => {
                    const statut = c.status || c.statut || 'En attente';
                    const dept = DEPARTMENTS.find(d => d.id === Number(c.departement_id));
                    return (
                      <tr key={c.id || i}>
                        <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>{c.ref || c.reference || ('CH-' + String(i + 1).padStart(3, '0'))}</td>
                        <td style={{ fontWeight: 600 }}>{c.libelle || c.label || '-'}</td>
                        <td>{dept ? <span className="badge badge-blue" title={dept.nom}>{dept.code}</span> : <span style={{ color: 'var(--text-3)', fontSize: '0.78rem' }}>—</span>}</td>
                        <td><span className="badge badge-grey">{c.categorie || c.category || '-'}</span></td>
                        <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}>{fmtMAD(c.montant || c.amount || 0)}</td>
                        <td>{c.date || '-'}</td>
                        <td><span className={'badge ' + (statut === 'Paye' || statut === 'paid' ? 'badge-green' : 'badge-orange')}>{statut}</span></td>
                        <td><button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }}><Edit2 size={13} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── PAIEMENTS ── */}
      {tab === 'paiements' && (
        <div className="card">
          <div className="flex-between mb-4">
            <div className="card-title" style={{ marginBottom: 0 }}><CreditCard size={16} /> Ordres de paiement</div>
            <button className="btn btn-primary btn-sm"><Plus size={14} /> Nouvel ordre</button>
          </div>
          {loading ? <Spinner /> : paiements.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-3)' }}>Aucun ordre de paiement.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Reference</th><th>Beneficiaire</th><th>Montant (MAD)</th><th>Date</th><th>Mode</th><th>Statut</th></tr>
                </thead>
                <tbody>
                  {paiements.map((p, i) => {
                    const statut = p.status || p.statut || '-';
                    return (
                      <tr key={p.id || i}>
                        <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>{p.ref || p.reference || ('OP-' + String(i + 1).padStart(3, '0'))}</td>
                        <td style={{ fontWeight: 600 }}>{p.beneficiaire || p.recipient || '-'}</td>
                        <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}>{fmtMAD(p.montant || p.amount || 0)}</td>
                        <td>{p.date || '-'}</td>
                        <td><span className="badge badge-blue">{p.mode || p.paymentMode || 'Virement'}</span></td>
                        <td><span className={'badge ' + (statut === 'Execute' || statut === 'executed' ? 'badge-green' : 'badge-orange')}>{statut}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TRESORERIE / BAR CHART ── */}
      {tab === 'tresorerie' && (
        <div className="card">
          <div className="card-title"><TrendingUp size={16} /> Repartition des charges par categorie (MAD)</div>
          {loading ? <Spinner /> : catEntries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>Aucune charge a afficher.</div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                {catEntries.map(([cat, val]) => (
                  <div key={cat}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.83rem' }}>
                      <span style={{ fontWeight: 600 }}>{cat}</span>
                      <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>{fmtMAD(val)}</span>
                    </div>
                    <div className="progress-bar-wrap" style={{ height: 8 }}>
                      <div className="progress-bar-fill" style={{ width: Math.round(val / maxCat * 100) + '%' }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="divider" style={{ marginTop: 20 }} />
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 12 }}>
                <div style={{ padding: '10px 16px', background: 'var(--bg)', borderRadius: 8 }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: 2 }}>Total charges</div>
                  <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.1rem' }}>{fmtMAD(totalCharges)}</div>
                </div>
                <div style={{ padding: '10px 16px', background: 'var(--bg)', borderRadius: 8 }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: 2 }}>Total entrees</div>
                  <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.1rem', color: '#2E7D32' }}>{fmtMAD(totalEntrees)}</div>
                </div>
                <div style={{ padding: '10px 16px', background: 'var(--bg)', borderRadius: 8 }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: 2 }}>Solde net</div>
                  <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.1rem', color: soldeNet >= 0 ? '#2E7D32' : 'var(--red)' }}>{fmtMAD(soldeNet)}</div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal: Nouvelle charge */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 32, width: '100%', maxWidth: 480, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex-between mb-4" style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.3rem', textTransform: 'uppercase' }}>Nouvelle charge</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label>Libelle</label>
                <input type="text" placeholder="Salaires employes Juin" value={form.libelle} onChange={e => setField('libelle', e.target.value)} style={INPUT_STYLE(errors.libelle)} />
                {errors.libelle && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 2 }}>{errors.libelle}</div>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Montant (MAD)</label>
                  <input type="number" placeholder="50000" min="0" value={form.montant} onChange={e => setField('montant', e.target.value)} style={INPUT_STYLE(errors.montant)} />
                  {errors.montant && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 2 }}>{errors.montant}</div>}
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={form.date} onChange={e => setField('date', e.target.value)} style={INPUT_STYLE(false)} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Categorie</label>
                  <select value={form.categorie} onChange={e => setField('categorie', e.target.value)} style={INPUT_STYLE(false)}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Departement</label>
                  <select value={form.departement_id} onChange={e => setField('departement_id', e.target.value)} style={INPUT_STYLE(false)}>
                    <option value="">Choisir un departement...</option>
                    {DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{d.code} — {d.nom}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Statut</label>
                <select value={form.statut} onChange={e => setField('statut', e.target.value)} style={INPUT_STYLE(false)}>
                  <option value="En attente">En attente</option>
                  <option value="Paye">Paye</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving
                    ? <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    : <><Plus size={14} /> Enregistrer</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
