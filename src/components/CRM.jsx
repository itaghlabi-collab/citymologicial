import { Users, FileText, DollarSign, Plus, Edit2, Trash2, ChevronRight, X } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { getClients, createClient, getQuotes, createQuote, getInvoices, createInvoice, getProspects } from '../services/api';

/* ── Helpers ── */
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

function devisStatusBadge(s) {
  if (s === 'Accepte' || s === 'accepted') return 'badge-green';
  if (s === 'Envoye' || s === 'sent') return 'badge-blue';
  if (s === 'En cours' || s === 'pending') return 'badge-orange';
  return 'badge-grey';
}

function factStatusBadge(s) {
  if (s === 'Payee' || s === 'paid') return 'badge-green';
  if (s === 'En attente' || s === 'unpaid') return 'badge-orange';
  if (s === 'Retard' || s === 'overdue') return 'badge-red';
  return 'badge-grey';
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
  outline: 'none', width: '100%',
});

export default function CRM() {
  const [tab, setTab] = useState('prospects');

  /* Data state */
  const [prospects, setProspects] = useState([]);
  const [clients, setClients] = useState([]);
  const [devis, setDevis] = useState([]);
  const [factures, setFactures] = useState([]);
  const [loading, setLoading] = useState(true);

  /* Modal state */
  const [modal, setModal] = useState(null); // 'client' | 'devis' | 'facture'
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);

  function showToast(type, msg) {
    setToast({ type, msg });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    setLoading(true);
    const [p, c, d, f] = await Promise.all([getProspects(), getClients(), getQuotes(), getInvoices()]);
    setProspects(p); setClients(c); setDevis(d); setFactures(f);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openModal(type) {
    const defaults = {
      client: { nom: '', email: '', telephone: '', ville: '', secteur: '' },
      devis: { client: '', montant: '', description: '', dateExpiration: '' },
      facture: { client: '', montant: '', description: '', dateEcheance: '', statut: 'En attente' },
    };
    setForm(defaults[type] || {});
    setErrors({});
    setModal(type);
  }

  function closeModal() { setModal(null); setForm({}); setErrors({}); }

  function setField(k, v) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = {};
    if (modal === 'client') {
      if (!form.nom?.trim()) errs.nom = 'Requis';
      if (!form.email?.trim() || !form.email.includes('@')) errs.email = 'Email invalide';
    } else if (modal === 'devis') {
      if (!form.client?.trim()) errs.client = 'Requis';
      if (!form.montant || isNaN(Number(form.montant))) errs.montant = 'Montant invalide';
    } else if (modal === 'facture') {
      if (!form.client?.trim()) errs.client = 'Requis';
      if (!form.montant || isNaN(Number(form.montant))) errs.montant = 'Montant invalide';
    }
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      const payload = { ...form, montant: Number(form.montant) };
      if (modal === 'client') await createClient(payload);
      else if (modal === 'devis') await createQuote(payload);
      else if (modal === 'facture') await createInvoice(payload);
      showToast('success', modal === 'client' ? 'Client cree avec succes !' : modal === 'devis' ? 'Devis cree avec succes !' : 'Facture creee avec succes !');
      closeModal();
      load();
    } catch (err) {
      showToast('error', err.message || 'Erreur lors de la creation.');
    } finally {
      setSaving(false);
    }
  }

  const totalCA = clients.reduce((s, c) => s + (Number(c.ca || c.chiffre_affaires || 0)), 0);

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
          <h1 className="page-title">CRM / Commercial</h1>
          <p className="page-subtitle">Prospects, clients, devis et facturation</p>
        </div>
        <button className="btn btn-primary" onClick={() => openModal(tab === 'clients' ? 'client' : tab === 'devis' ? 'devis' : tab === 'factures' ? 'facture' : 'client')}>
          <Plus size={15} /> Nouveau
        </button>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-icon orange"><Users size={18} /></div>
          <div className="stat-body"><div className="stat-value">{loading ? '—' : prospects.length}</div><div className="stat-label">Prospects actifs</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue"><Users size={18} /></div>
          <div className="stat-body"><div className="stat-value">{loading ? '—' : clients.length}</div><div className="stat-label">Clients actifs</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple"><FileText size={18} /></div>
          <div className="stat-body"><div className="stat-value">{loading ? '—' : devis.length}</div><div className="stat-label">Devis en cours</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><DollarSign size={18} /></div>
          <div className="stat-body"><div className="stat-value">{loading ? '—' : fmtMAD(totalCA)}</div><div className="stat-label">CA total</div></div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid var(--border)' }}>
        {[['prospects','Prospects'],['clients','Clients'],['devis','Devis'],['factures','Factures']].map(([k, v]) => (
          <button key={k} onClick={() => setTab(k)} style={TAB_STYLE(tab === k)}>{v}</button>
        ))}
      </div>

      {/* ── PROSPECTS ── */}
      {tab === 'prospects' && (
        <div className="card">
          <div className="flex-between mb-4">
            <div className="card-title" style={{ marginBottom: 0 }}><Users size={16} /> Prospects</div>
            <button className="btn btn-primary btn-sm" onClick={() => openModal('client')}><Plus size={14} /> Ajouter</button>
          </div>
          {loading ? <Spinner /> : prospects.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-3)' }}>Aucun prospect. Connectez le backend ou ajoutez-en un.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Nom</th><th>Contact</th><th>Telephone</th><th>Valeur estimee</th><th>Temperature</th><th>Actions</th></tr></thead>
                <tbody>
                  {prospects.map((p, i) => {
                    const status = p.status || p.temperature || p.statut || 'Froid';
                    return (
                      <tr key={p.id || i}>
                        <td style={{ fontWeight: 600 }}>{p.nom || p.name || '-'}</td>
                        <td>{p.contact || p.contactNom || '-'}</td>
                        <td>{p.telephone || p.tel || '-'}</td>
                        <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}>{fmtMAD(p.valeur || p.value || 0)}</td>
                        <td><span className={'badge ' + (status === 'Chaud' || status === 'hot' ? 'badge-red' : status === 'Tiede' || status === 'warm' ? 'badge-orange' : 'badge-blue')}>{status}</span></td>
                        <td><button className="btn btn-secondary btn-sm"><ChevronRight size={13} /> Convertir</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── CLIENTS ── */}
      {tab === 'clients' && (
        <div className="card">
          <div className="flex-between mb-4">
            <div className="card-title" style={{ marginBottom: 0 }}><Users size={16} /> Clients</div>
            <button className="btn btn-primary btn-sm" onClick={() => openModal('client')}><Plus size={14} /> Ajouter</button>
          </div>
          {loading ? <Spinner /> : clients.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-3)' }}>Aucun client enregistre.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Client</th><th>Email</th><th>Ville</th><th>CA total (MAD)</th><th>Statut</th><th>Actions</th></tr></thead>
                <tbody>
                  {clients.map((c, i) => {
                    const statut = c.status || c.statut || 'Actif';
                    return (
                      <tr key={c.id || i}>
                        <td style={{ fontWeight: 600 }}>{c.nom || c.name || '-'}</td>
                        <td>{c.email || '-'}</td>
                        <td>{c.ville || c.city || '-'}</td>
                        <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}>{fmtMAD(c.ca || c.chiffre_affaires || 0)}</td>
                        <td><span className={'badge ' + (statut === 'Actif' ? 'badge-green' : 'badge-blue')}>{statut}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }}><Edit2 size={13} /></button>
                            <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }}><Trash2 size={13} style={{ color: 'var(--red)' }} /></button>
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
      )}

      {/* ── DEVIS ── */}
      {tab === 'devis' && (
        <div className="card">
          <div className="flex-between mb-4">
            <div className="card-title" style={{ marginBottom: 0 }}><FileText size={16} /> Devis</div>
            <button className="btn btn-primary btn-sm" onClick={() => openModal('devis')}><Plus size={14} /> Nouveau devis</button>
          </div>
          {loading ? <Spinner /> : devis.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-3)' }}>Aucun devis enregistre.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Reference</th><th>Client</th><th>Montant (MAD)</th><th>Date</th><th>Expiration</th><th>Statut</th><th>Actions</th></tr></thead>
                <tbody>
                  {devis.map((d, i) => (
                    <tr key={d.id || i}>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>{d.ref || d.reference || ('DV-' + String(i + 1).padStart(3, '0'))}</td>
                      <td>{d.client || d.clientNom || '-'}</td>
                      <td style={{ fontWeight: 700 }}>{fmtMAD(d.montant || d.amount || 0)}</td>
                      <td>{d.date || d.dateCreation || '-'}</td>
                      <td>{d.dateExpiration || d.expiry || '-'}</td>
                      <td><span className={'badge ' + devisStatusBadge(d.status || d.statut || '')}>{d.status || d.statut || '-'}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-secondary btn-sm">Transformer</button>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }}><Edit2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── FACTURES ── */}
      {tab === 'factures' && (
        <div className="card">
          <div className="flex-between mb-4">
            <div className="card-title" style={{ marginBottom: 0 }}><DollarSign size={16} /> Factures</div>
            <button className="btn btn-primary btn-sm" onClick={() => openModal('facture')}><Plus size={14} /> Nouvelle facture</button>
          </div>
          {loading ? <Spinner /> : factures.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-3)' }}>Aucune facture enregistree.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Reference</th><th>Client</th><th>Montant (MAD)</th><th>Date</th><th>Echeance</th><th>Statut</th><th>Actions</th></tr></thead>
                <tbody>
                  {factures.map((f, i) => (
                    <tr key={f.id || i}>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>{f.ref || f.reference || ('FA-' + String(i + 1).padStart(3, '0'))}</td>
                      <td>{f.client || f.clientNom || '-'}</td>
                      <td style={{ fontWeight: 700 }}>{fmtMAD(f.montant || f.amount || 0)}</td>
                      <td>{f.date || f.dateCreation || '-'}</td>
                      <td>{f.echeance || f.dateEcheance || '-'}</td>
                      <td><span className={'badge ' + factStatusBadge(f.status || f.statut || '')}>{f.status || f.statut || '-'}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }}><Edit2 size={13} /></button>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }}><Trash2 size={13} style={{ color: 'var(--red)' }} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══ MODAL ══ */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 32, width: '100%', maxWidth: 500, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex-between mb-4" style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.3rem', textTransform: 'uppercase' }}>
                {modal === 'client' ? 'Nouveau client' : modal === 'devis' ? 'Nouveau devis' : 'Nouvelle facture'}
              </h2>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* CLIENT FORM */}
              {modal === 'client' && (<>
                <div className="form-group">
                  <label>Nom / Societe</label>
                  <input type="text" placeholder="Entreprise ABC" value={form.nom || ''} onChange={e => setField('nom', e.target.value)} style={INPUT_STYLE(errors.nom)} />
                  {errors.nom && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 2 }}>{errors.nom}</div>}
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" placeholder="contact@client.ma" value={form.email || ''} onChange={e => setField('email', e.target.value)} style={INPUT_STYLE(errors.email)} />
                  {errors.email && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 2 }}>{errors.email}</div>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label>Telephone</label>
                    <input type="tel" placeholder="+212 600 000 000" value={form.telephone || ''} onChange={e => setField('telephone', e.target.value)} style={INPUT_STYLE(false)} />
                  </div>
                  <div className="form-group">
                    <label>Ville</label>
                    <input type="text" placeholder="Casablanca" value={form.ville || ''} onChange={e => setField('ville', e.target.value)} style={INPUT_STYLE(false)} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Secteur</label>
                  <input type="text" placeholder="Immobilier, Industrie..." value={form.secteur || ''} onChange={e => setField('secteur', e.target.value)} style={INPUT_STYLE(false)} />
                </div>
              </>)}

              {/* DEVIS FORM */}
              {modal === 'devis' && (<>
                <div className="form-group">
                  <label>Client</label>
                  <select value={form.client || ''} onChange={e => setField('client', e.target.value)} style={INPUT_STYLE(errors.client)}>
                    <option value="">Choisir un client...</option>
                    {clients.map((c, i) => <option key={i} value={c.nom || c.name}>{c.nom || c.name}</option>)}
                  </select>
                  {errors.client && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 2 }}>{errors.client}</div>}
                </div>
                <div className="form-group">
                  <label>Montant (MAD)</label>
                  <input type="number" placeholder="50000" min="0" value={form.montant || ''} onChange={e => setField('montant', e.target.value)} style={INPUT_STYLE(errors.montant)} />
                  {errors.montant && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 2 }}>{errors.montant}</div>}
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea rows={3} placeholder="Description des travaux..." value={form.description || ''} onChange={e => setField('description', e.target.value)} style={{ ...INPUT_STYLE(false), resize: 'vertical' }} />
                </div>
                <div className="form-group">
                  <label>Date d&apos;expiration</label>
                  <input type="date" value={form.dateExpiration || ''} onChange={e => setField('dateExpiration', e.target.value)} style={INPUT_STYLE(false)} />
                </div>
              </>)}

              {/* FACTURE FORM */}
              {modal === 'facture' && (<>
                <div className="form-group">
                  <label>Client</label>
                  <select value={form.client || ''} onChange={e => setField('client', e.target.value)} style={INPUT_STYLE(errors.client)}>
                    <option value="">Choisir un client...</option>
                    {clients.map((c, i) => <option key={i} value={c.nom || c.name}>{c.nom || c.name}</option>)}
                  </select>
                  {errors.client && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 2 }}>{errors.client}</div>}
                </div>
                <div className="form-group">
                  <label>Montant (MAD)</label>
                  <input type="number" placeholder="50000" min="0" value={form.montant || ''} onChange={e => setField('montant', e.target.value)} style={INPUT_STYLE(errors.montant)} />
                  {errors.montant && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 2 }}>{errors.montant}</div>}
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea rows={2} placeholder="Objet de la facture..." value={form.description || ''} onChange={e => setField('description', e.target.value)} style={{ ...INPUT_STYLE(false), resize: 'vertical' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label>Date d&apos;echeance</label>
                    <input type="date" value={form.dateEcheance || ''} onChange={e => setField('dateEcheance', e.target.value)} style={INPUT_STYLE(false)} />
                  </div>
                  <div className="form-group">
                    <label>Statut</label>
                    <select value={form.statut || 'En attente'} onChange={e => setField('statut', e.target.value)} style={INPUT_STYLE(false)}>
                      <option value="En attente">En attente</option>
                      <option value="Payee">Payee</option>
                      <option value="Retard">Retard</option>
                    </select>
                  </div>
                </div>
              </>)}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving
                    ? <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    : <><Plus size={14} /> Creer</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
