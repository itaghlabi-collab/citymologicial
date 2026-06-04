import { useState, useEffect, useRef, useMemo } from 'react';
import { Lightbulb, Plus, Edit2, Trash2, XCircle, Send, CheckCircle, AlertCircle, FileText, ChevronRight, Loader2 } from 'lucide-react';
import { usePropositionsMarketing } from '../../hooks/usePropositionsMarketing';

const STATUTS = ['brouillon', 'envoye', 'valide', 'refuse', 'en_revision'];
const STATUT_BADGE = { brouillon: 'badge-grey', envoye: 'badge-blue', valide: 'badge-green', refuse: 'badge-red', en_revision: 'badge-orange' };
const STATUT_LABEL = { brouillon: 'Brouillon', envoye: 'Envoye', valide: 'Valide', refuse: 'Refuse', en_revision: 'En revision' };

const EMPTY = {
  titre: '',
  marque_compte: '',
  type_proposition: '',
  objectif: '',
  description: '',
  budget_estime: '',
  statut: 'brouillon',
  responsable: '',
};


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

export default function PropositionsMarketing() {
  const {
    records: props,
    loading,
    saving,
    error,
    configured,
    load,
    create,
    update,
    remove,
    advanceStatut,
    filterPropositions,
    computePropositionsStats,
    PROPOSITION_STATUT_NEXT,
    TYPE_PROPOSITION_VALUES,
    TYPE_PROPOSITION_LABEL,
    typePropositionLabel,
  } = usePropositionsMarketing();

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [page, setPage] = useState(1);
  const PER_PAGE = 6;

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setErrors({});
    setShowModal(true);
  }

  function openEdit(prop) {
    setEditing(prop);
    setForm({
      titre: prop.titre,
      marque_compte: prop.marque_compte || '',
      type_proposition: prop.type_proposition || '',
      objectif: prop.objectif || '',
      description: prop.description || '',
      budget_estime: String(prop.budget_estime || ''),
      statut: prop.statut,
      responsable: prop.responsable || '',
    });
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
    const payload = { ...form, budget_estime: Number(form.budget_estime) || 0 };
    const result = editing
      ? await update(editing.id, payload)
      : await create(payload);
    if (!result.success) {
      setToast(result.error || 'Erreur enregistrement.');
      return;
    }
    setToast(editing ? 'Proposition mise a jour.' : 'Proposition creee.');
    setShowModal(false);
  }

  async function handleDelete(prop) {
    if (!window.confirm('Supprimer cette proposition ?')) return;
    const result = await remove(prop.id);
    setToast(result.success ? 'Proposition supprimee.' : (result.error || 'Erreur suppression.'));
  }

  async function handleAdvanceStatut(prop) {
    const next = PROPOSITION_STATUT_NEXT[prop.statut];
    if (!next) return;
    const result = await advanceStatut(prop);
    setToast(result.success ? `Statut mis a jour: ${STATUT_LABEL[next]}` : (result.error || 'Erreur.'));
  }

  const filtered = useMemo(
    () => filterPropositions(props, { search, statut: filterStatut }),
    [props, search, filterStatut, filterPropositions],
  );

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const stats = useMemo(() => computePropositionsStats(props), [props, computePropositionsStats]);

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Propositions Marketing</h1>
          <p className="page-subtitle">Gestion des propositions commerciales et marketing clients</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate} disabled={loading || saving || !configured}><Plus size={15} /> Nouvelle proposition</button>
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
          <Loader2 size={18} className="spin" /> Chargement des propositions...
        </div>
      )}

      {!loading && (
      <>
      {/* Stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))' }}>
        <div className="stat-card"><div className="stat-icon"><Lightbulb size={18} /></div><div className="stat-body"><div className="stat-value">{stats.total}</div><div className="stat-label">Total propositions</div></div></div>
        <div className="stat-card"><div className="stat-icon blue"><Send size={18} /></div><div className="stat-body"><div className="stat-value">{stats.envoye}</div><div className="stat-label">Envoyees</div></div></div>
        <div className="stat-card"><div className="stat-icon green"><CheckCircle size={18} /></div><div className="stat-body"><div className="stat-value">{stats.valide}</div><div className="stat-label">Validees</div></div></div>
        <div className="stat-card"><div className="stat-icon"><FileText size={18} /></div><div className="stat-body"><div className="stat-value">{stats.brouillon}</div><div className="stat-label">Brouillons</div></div></div>
        {stats.refuse > 0 && <div className="stat-card"><div className="stat-icon orange"><AlertCircle size={18} /></div><div className="stat-body"><div className="stat-value" style={{ color: 'var(--red)' }}>{stats.refuse}</div><div className="stat-label">Refusees</div></div></div>}
      </div>

      {/* Workflow legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '10px 16px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Workflow:</span>
        {['brouillon', 'envoye', 'valide'].map((s, i) => (
          <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={'badge ' + STATUT_BADGE[s]}>{STATUT_LABEL[s]}</span>
            {i < 2 && <ChevronRight size={12} style={{ color: 'var(--text-3)' }} />}
          </span>
        ))}
        <span style={{ marginLeft: 8, fontSize: '0.75rem', color: 'var(--text-3)' }}>Cliquez sur "Avancer" pour passer a l'etape suivante</span>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input placeholder="Rechercher (titre, marque, campagne...)" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} style={{ ...IS(false), width: 240 }} />
          <select value={filterStatut} onChange={e => { setFilterStatut(e.target.value); setPage(1); }} style={{ ...IS(false), width: 160 }}>
            <option value="">Tous les statuts</option>
            {STATUTS.map(s => <option key={s} value={s}>{STATUT_LABEL[s]}</option>)}
          </select>
          {(filterStatut || search) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setFilterStatut(''); setSearch(''); setPage(1); }}>Reinitialiser</button>
          )}
        </div>
      </div>

      {/* Proposition cards */}
      <div style={{ display: 'grid', gap: 12 }}>
        {paged.length === 0 && (
          <div className="card" style={{ textAlign: 'center', color: 'var(--text-3)', padding: '32px 0', fontSize: '0.875rem' }}>Aucune proposition</div>
        )}
        {paged.map(prop => {
          const expanded = expandedId === prop.id;
          const canAdvance = !!PROPOSITION_STATUT_NEXT[prop.statut];
          return (
            <div key={prop.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', cursor: 'pointer' }} onClick={() => setExpandedId(expanded ? null : prop.id)}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: prop.statut === 'valide' ? '#e8f5e9' : prop.statut === 'refuse' ? '#fce4e4' : 'rgba(211,47,47,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Lightbulb size={18} style={{ color: prop.statut === 'valide' ? '#2E7D32' : prop.statut === 'refuse' ? 'var(--red)' : 'var(--red)' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>{prop.titre}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    {prop.marque_compte && <span>{prop.marque_compte}</span>}
                    {prop.budget_estime > 0 && <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--text-2)' }}>{fmtBudget(prop.budget_estime)}</span>}
                    {prop.created_at && <span>Cree: {String(prop.created_at).slice(0, 10)}</span>}
                    {prop.date_envoi && <span>Envoi: {prop.date_envoi}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span className={'badge ' + STATUT_BADGE[prop.statut]}>{STATUT_LABEL[prop.statut]}</span>
                  {canAdvance && (
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.75rem', padding: '3px 10px' }} onClick={e => { e.stopPropagation(); handleAdvanceStatut(prop); }} title="Avancer le statut">
                      Avancer <ChevronRight size={12} />
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); openEdit(prop); }} title="Modifier"><Edit2 size={13} /></button>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={e => { e.stopPropagation(); handleDelete(prop); }} title="Supprimer"><Trash2 size={13} /></button>
                </div>
              </div>

              {/* Expanded */}
              {expanded && (
                <div style={{ padding: '0 18px 16px', borderTop: '1px solid var(--border)' }}>
                  <div style={{ paddingTop: 14, display: 'grid', gap: 12 }}>
                    {prop.objectif && (
                      <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Objectif</div>
                        <p style={{ fontSize: '0.875rem', margin: 0, color: 'var(--text-2)', lineHeight: 1.5 }}>{prop.objectif}</p>
                      </div>
                    )}
                    {prop.description && (
                      <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Description</div>
                        <p style={{ fontSize: '0.875rem', margin: 0, color: 'var(--text)', lineHeight: 1.6 }}>{prop.description}</p>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {prop.type_proposition && (
                        <span className="badge badge-blue">{typePropositionLabel(prop.type_proposition)}</span>
                      )}
                      {prop.responsable && (
                        <span className="badge badge-grey">{prop.responsable}</span>
                      )}
                      {prop.budget_estime > 0 && (
                        <div style={{ display: 'inline-flex', padding: '6px 14px', background: 'var(--bg)', borderRadius: 6, gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-3)' }}>Budget estime:</span>
                          <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', color: 'var(--red)' }}>{fmtBudget(prop.budget_estime)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
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
      </>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <div className="flex-between mb-4">
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1.2rem' }}>{editing ? 'Modifier la proposition' : 'Nouvelle proposition'}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}><XCircle size={18} /></button>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Titre *</label>
                <input style={IS(errors.titre)} value={form.titre} onChange={e => setForm(f => ({ ...f, titre: e.target.value }))} placeholder="Titre de la proposition" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Marque / Compte / Projet marketing</label>
                  <input style={IS(false)} value={form.marque_compte} onChange={e => setForm(f => ({ ...f, marque_compte: e.target.value }))} placeholder="Ex: Campagne ete 2026, Client X..." />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Type de proposition marketing</label>
                  <select style={IS(false)} value={form.type_proposition} onChange={e => setForm(f => ({ ...f, type_proposition: e.target.value }))}>
                    <option value="">-- Selectionner --</option>
                    {TYPE_PROPOSITION_VALUES.map(v => <option key={v} value={v}>{TYPE_PROPOSITION_LABEL[v]}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Statut</label>
                  <select style={IS(false)} value={form.statut} onChange={e => setForm(f => ({ ...f, statut: e.target.value }))}>
                    {STATUTS.map(s => <option key={s} value={s}>{STATUT_LABEL[s]}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Responsable</label>
                  <input style={IS(false)} value={form.responsable} onChange={e => setForm(f => ({ ...f, responsable: e.target.value }))} placeholder="Nom du responsable marketing" />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Objectif</label>
                <input style={IS(false)} value={form.objectif} onChange={e => setForm(f => ({ ...f, objectif: e.target.value }))} placeholder="Objectif principal de cette proposition" />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Description</label>
                <textarea style={{ ...IS(false), resize: 'vertical', minHeight: 100 }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Contenu detaille de la proposition marketing..." />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Budget estime (MAD)</label>
                <input type="number" min="0" step="1000" style={IS(false)} value={form.budget_estime} onChange={e => setForm(f => ({ ...f, budget_estime: e.target.value }))} placeholder="0" />
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
