import { useState, useEffect, useRef, useMemo } from 'react';
import { Megaphone, Plus, Edit2, Trash2, XCircle, TrendingUp, DollarSign, CheckCircle, Clock, Loader2 } from 'lucide-react';

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
import { useActionsMarketing } from '../../hooks/useActionsMarketing';

const TYPES = ['Publicite', 'SEA', 'SEO', 'Evenementiel', 'Email', 'Print', 'Reseaux sociaux', 'Autre'];
const PRIORITES = ['haute', 'normale', 'basse'];
const CANAUX = ['meta', 'google', 'tiktok', 'offline', 'email', 'autre'];
const STATUTS = ['en_attente', 'en_cours', 'valide', 'termine', 'annule'];

const STATUT_BADGE = { en_attente: 'badge-orange', en_cours: 'badge-blue', valide: 'badge-green', termine: 'badge-grey', annule: 'badge-red' };
const STATUT_LABEL = { en_attente: 'En attente', en_cours: 'En cours', valide: 'Valide', termine: 'Termine', annule: 'Annule' };
const PRIORITE_BADGE = { haute: 'badge-red', normale: 'badge-blue', basse: 'badge-grey' };
const CANAL_LABEL = { meta: 'Meta/Facebook', google: 'Google Ads', tiktok: 'TikTok', offline: 'Hors-ligne', email: 'Email/Newsletter', autre: 'Autre' };

const EMPTY = { titre: '', type: 'Publicite', budget: '', priorite: 'normale', statut: 'en_attente', canal: 'meta', date_debut: '', date_fin: '', description: '' };


function Toast({ msg, onClose }) {
  const t = useRef();
  useEffect(() => { t.current = setTimeout(onClose, 3000); return () => clearTimeout(t.current); }, [onClose]);
  if (!msg) return null;
  return (
    <div style={{ position: 'fixed', bottom: 28, right: 28, background: 'var(--text)', color: '#fff', borderRadius: 8, padding: '12px 20px', fontSize: '0.875rem', fontWeight: 600, zIndex: 9999, boxShadow: '0 4px 16px rgba(0,0,0,0.18)', maxWidth: 340 }}>{msg}</div>
  );
}

function IS(err) {
  return { padding: '9px 12px', border: '1.5px solid ' + (err ? 'var(--red)' : 'var(--border)'), borderRadius: 6, fontSize: '0.875rem', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' };
}

function fmtBudget(v) {
  if (!v && v !== 0) return '-';
  return Number(v).toLocaleString('fr-MA') + ' MAD';
}

export default function ActionsMarketing() {
  const {
    records: actions,
    loading,
    saving,
    error,
    configured,
    load,
    create,
    update,
    remove,
    filterActionsMarketing,
    computeActionsMarketingStats,
  } = useActionsMarketing();

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterType, setFilterType] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PER_PAGE = 8;

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setErrors({});
    setShowModal(true);
  }

  function openEdit(a) {
    setEditing(a);
    setForm({ titre: a.titre, type: a.type, budget: String(a.budget || ''), priorite: a.priorite, statut: a.statut, canal: a.canal, date_debut: a.date_debut || '', date_fin: a.date_fin || '', description: a.description || '' });
    setErrors({});
    setShowModal(true);
  }

  function validate() {
    const e = {};
    if (!form.titre.trim()) e.titre = true;
    return e;
  }

  async function handleSave() {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    const payload = { ...form, budget: Number(form.budget) || 0 };
    const result = editing
      ? await update(editing.id, payload)
      : await create(payload);
    if (!result.success) {
      setToast(result.error || 'Erreur enregistrement.');
      return;
    }
    setToast(editing ? 'Action mise a jour.' : 'Action creee avec succes.');
    setShowModal(false);
  }

  async function handleDelete(a) {
    if (!window.confirm('Supprimer cette action marketing ?')) return;
    const result = await remove(a.id);
    setToast(result.success ? 'Action supprimee.' : (result.error || 'Erreur suppression.'));
  }

  const filtered = useMemo(
    () => filterActionsMarketing(actions, {
      search,
      statut: filterStatut,
      type: filterType,
    }),
    [actions, search, filterStatut, filterType, filterActionsMarketing],
  );

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const stats = useMemo(() => computeActionsMarketingStats(actions), [actions, computeActionsMarketingStats]);

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Actions Marketing</h1>
          <p className="page-subtitle">Campagnes, budget et suivi des actions marketing</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate} disabled={loading || saving || !configured}><Plus size={15} /> Nouvelle action</button>
      </div>

      {!configured && (
        <div style={{ background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#E65100' }}>
          Supabase non configuré — ajoutez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env
        </div>
      )}

      {error && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#FFEBEE', border: '1px solid #EF9A9A', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#C62828' }}>
          <span>{error}</span>
          <button className="btn btn-ghost btn-sm" onClick={load}>Réessayer</button>
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '24px 0', color: 'var(--text-3)', fontSize: '0.875rem' }}>
          <Loader2 size={18} className="spin" /> Chargement des actions marketing...
        </div>
      )}

      {!loading && (
      <>
      {/* Stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        <div className="stat-card"><div className="stat-icon"><Megaphone size={18} /></div><div className="stat-body"><div className="stat-value">{stats.total}</div><div className="stat-label">Total actions</div></div></div>
        <div className="stat-card"><div className="stat-icon blue"><Clock size={18} /></div><div className="stat-body"><div className="stat-value">{stats.enCours}</div><div className="stat-label">En cours</div></div></div>
        <div className="stat-card"><div className="stat-icon green"><CheckCircle size={18} /></div><div className="stat-body"><div className="stat-value">{stats.validesTermines}</div><div className="stat-label">Valides / Termines</div></div></div>
        <div className="stat-card"><div className="stat-icon orange"><DollarSign size={18} /></div><div className="stat-body"><div className="stat-value">{(stats.totalBudget / 1000).toFixed(0)}K</div><div className="stat-label">Budget total (MAD)</div></div></div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input placeholder="Rechercher..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} style={{ ...IS(false), width: 220 }} />
          <select value={filterStatut} onChange={e => { setFilterStatut(e.target.value); setPage(1); }} style={{ ...IS(false), width: 160 }}>
            <option value="">Tous les statuts</option>
            {STATUTS.map(s => <option key={s} value={s}>{STATUT_LABEL[s]}</option>)}
          </select>
          <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }} style={{ ...IS(false), width: 160 }}>
            <option value="">Tous les types</option>
            {TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
          {(filterStatut || filterType || search) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setFilterStatut(''); setFilterType(''); setSearch(''); setPage(1); }}>Reinitialiser</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="flex-between mb-4">
          <div className="card-title" style={{ marginBottom: 0 }}><Megaphone size={16} /> Actions marketing ({filtered.length})</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Titre</th><th>Type</th><th>Canal</th><th>Budget</th><th>Debut</th><th>Fin</th><th>Priorite</th><th>Statut</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {paged.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <EmptyState
                      icon={<Megaphone size={22} style={{ color: 'var(--text-3)' }} />}
                      title={actions.length === 0 ? "Aucune action marketing" : "Aucun resultat pour ces filtres"}
                      sub={actions.length === 0 ? "Lancez votre premiere campagne en cliquant sur Nouvelle action" : "Modifiez vos criteres de recherche"}
                    />
                  </td>
                </tr>
              )}
              {paged.map(a => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600, maxWidth: 200 }}>{a.titre}</td>
                  <td><span className="badge badge-blue">{a.type}</span></td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{CANAL_LABEL[a.canal] || a.canal}</td>
                  <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}>{fmtBudget(a.budget)}</td>
                  <td>{a.date_debut || '-'}</td>
                  <td>{a.date_fin || '-'}</td>
                  <td><span className={'badge ' + PRIORITE_BADGE[a.priorite]}>{a.priorite}</span></td>
                  <td><span className={'badge ' + STATUT_BADGE[a.statut]}>{STATUT_LABEL[a.statut]}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(a)} title="Modifier"><Edit2 size={13} /></button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => handleDelete(a)} title="Supprimer"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 14 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prec.</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} className={'btn btn-sm ' + (p === page ? 'btn-primary' : 'btn-ghost')} onClick={() => setPage(p)}>{p}</button>
            ))}
            <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Suiv.</button>
          </div>
        )}
      </div>
      </>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <div className="flex-between mb-4">
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1.2rem' }}>{editing ? "Modifier l'action" : 'Nouvelle action marketing'}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}><XCircle size={18} /></button>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Titre *</label>
                <input style={IS(errors.titre)} value={form.titre} onChange={e => setForm(f => ({ ...f, titre: e.target.value }))} placeholder="Titre de la campagne" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Type</label>
                  <select style={IS(false)} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                    {TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Canal</label>
                  <select style={IS(false)} value={form.canal} onChange={e => setForm(f => ({ ...f, canal: e.target.value }))}>
                    {CANAUX.map(c => <option key={c} value={c}>{CANAL_LABEL[c] || c}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Budget (MAD)</label>
                  <input type="number" min="0" style={IS(false)} value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} placeholder="0" />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Priorite</label>
                  <select style={IS(false)} value={form.priorite} onChange={e => setForm(f => ({ ...f, priorite: e.target.value }))}>
                    {PRIORITES.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Statut</label>
                  <select style={IS(false)} value={form.statut} onChange={e => setForm(f => ({ ...f, statut: e.target.value }))}>
                    {STATUTS.map(s => <option key={s} value={s}>{STATUT_LABEL[s]}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Date debut</label>
                  <input type="date" style={IS(false)} value={form.date_debut} onChange={e => setForm(f => ({ ...f, date_debut: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Date fin</label>
                  <input type="date" style={IS(false)} value={form.date_fin} onChange={e => setForm(f => ({ ...f, date_fin: e.target.value }))} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Description</label>
                <textarea style={{ ...IS(false), resize: 'vertical', minHeight: 70 }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Objectifs, cible, description..." />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Sauvegarde...' : editing ? 'Mettre a jour' : 'Creer'}</button>
            </div>
          </div>
        </div>
      )}

      <Toast msg={toast} onClose={() => setToast('')} />
    </div>
  );
}
