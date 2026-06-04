import { useState, useEffect, useRef, useMemo } from 'react';
import { NotebookPen, Plus, Edit2, Trash2, XCircle, CheckSquare, Calendar, Loader2 } from 'lucide-react';
import { useComptesRendus } from '../../hooks/useComptesRendus';

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

const EMPTY = { rdv_id: '', prospect_id: '', resume: '', decision: '', prochaine_action: '', date: new Date().toISOString().slice(0, 10) };


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

export default function ComptesRendus() {
  const {
    records: crs,
    prospects,
    rdvs,
    loading,
    saving,
    error,
    configured,
    load,
    create,
    update,
    remove,
    filterComptesRendus,
    computeComptesRendusStats,
  } = useComptesRendus();

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [page, setPage] = useState(1);
  const PER_PAGE = 8;

  function prospectLabel(id) {
    const p = prospects.find(x => String(x.id) === String(id));
    if (!p) return '-';
    return p.label || (p.type === 'btob' ? p.nom : `${p.prenom} ${p.nom}`);
  }

  function rdvLabel(id) {
    const r = rdvs.find(x => String(x.id) === String(id));
    return r ? r.titre : '-';
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setErrors({});
    setShowModal(true);
  }

  function openEdit(cr) {
    setEditing(cr);
    setForm({ rdv_id: cr.rdv_id || '', prospect_id: cr.prospect_id || '', resume: cr.resume || '', decision: cr.decision || '', prochaine_action: cr.prochaine_action || '', date: cr.date || new Date().toISOString().slice(0, 10) });
    setErrors({});
    setShowModal(true);
  }

  function validate() {
    const e = {};
    if (!form.resume.trim()) e.resume = true;
    return e;
  }

  async function handleSave() {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    const payload = { ...form, rdv_id: form.rdv_id || null, prospect_id: form.prospect_id || null };
    const result = editing
      ? await update(editing.id, payload)
      : await create(payload);
    if (!result.success) {
      setToast(result.error || 'Erreur enregistrement.');
      return;
    }
    setToast(editing ? 'Compte rendu mis a jour.' : 'Compte rendu cree.');
    setShowModal(false);
  }

  async function handleDelete(cr) {
    if (!window.confirm('Supprimer ce compte rendu ?')) return;
    const result = await remove(cr.id);
    setToast(result.success ? 'Compte rendu supprime.' : (result.error || 'Erreur suppression.'));
  }

  const filtered = useMemo(
    () => filterComptesRendus(crs, { search }),
    [crs, search, filterComptesRendus],
  );

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const stats = useMemo(() => computeComptesRendusStats(crs), [crs, computeComptesRendusStats]);

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Comptes Rendus</h1>
          <p className="page-subtitle">Rapports de visites et suivi des rendez-vous commerciaux</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate} disabled={loading || saving || !configured}><Plus size={15} /> Nouveau CR</button>
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
          <Loader2 size={18} className="spin" /> Chargement des comptes rendus...
        </div>
      )}

      {!loading && (
      <>
      {/* Stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        <div className="stat-card"><div className="stat-icon"><NotebookPen size={18} /></div><div className="stat-body"><div className="stat-value">{stats.total}</div><div className="stat-label">Total comptes rendus</div></div></div>
        <div className="stat-card"><div className="stat-icon blue"><Calendar size={18} /></div><div className="stat-body"><div className="stat-value">{stats.ceMois}</div><div className="stat-label">Ce mois</div></div></div>
        <div className="stat-card"><div className="stat-icon green"><CheckSquare size={18} /></div><div className="stat-body"><div className="stat-value">{stats.avecActionSuivante}</div><div className="stat-label">Avec action suivante</div></div></div>
      </div>

      {/* Search */}
      <div className="card" style={{ marginBottom: 16 }}>
        <input placeholder="Rechercher dans les comptes rendus..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} style={{ ...IS(false), maxWidth: 360 }} />
      </div>

      {/* CR list - card style */}
      <div className="card">
        <div className="flex-between mb-4">
          <div className="card-title" style={{ marginBottom: 0 }}><NotebookPen size={16} /> Comptes rendus ({filtered.length})</div>
        </div>

        {paged.length === 0 && (
          <EmptyState
            icon={<NotebookPen size={22} style={{ color: 'var(--text-3)' }} />}
            title={crs.length === 0 ? "Aucun compte rendu" : "Aucun resultat pour cette recherche"}
            sub={crs.length === 0 ? "Les comptes rendus de vos visites et RDV apparaitront ici" : "Modifiez votre recherche"}
          />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {paged.map(cr => {
            const expanded = expandedId === cr.id;
            return (
              <div key={cr.id} style={{ background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer' }} onClick={() => setExpandedId(expanded ? null : cr.id)}>
                  <div style={{ width: 38, height: 38, borderRadius: 8, background: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <NotebookPen size={16} color="#fff" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(() => {
                        const t = cr.rdv_titre || rdvLabel(cr.rdv_id);
                        return t !== '-' ? t : `CR du ${cr.date}`;
                      })()}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', display: 'flex', gap: 14 }}>
                      <span><Calendar size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />{cr.date}</span>
                      {(cr.prospect_nom || prospectLabel(cr.prospect_id)) !== '-' && <span>{cr.prospect_nom || prospectLabel(cr.prospect_id)}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); openEdit(cr); }} title="Modifier"><Edit2 size={13} /></button>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={e => { e.stopPropagation(); handleDelete(cr); }} title="Supprimer"><Trash2 size={13} /></button>
                  </div>
                </div>
                {/* Expanded body */}
                {expanded && (
                  <div style={{ padding: '0 16px 14px 66px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ paddingTop: 12, display: 'grid', gap: 10 }}>
                      <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Resume</div>
                        <p style={{ fontSize: '0.875rem', lineHeight: 1.6, margin: 0, color: 'var(--text)' }}>{cr.resume}</p>
                      </div>
                      {cr.decision && (
                        <div>
                          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Decision prise</div>
                          <p style={{ fontSize: '0.875rem', lineHeight: 1.5, margin: 0, color: 'var(--text-2)' }}>{cr.decision}</p>
                        </div>
                      )}
                      {cr.prochaine_action && (
                        <div style={{ padding: '8px 12px', background: '#e3f2fd', borderRadius: 6, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <CheckSquare size={14} style={{ color: '#1565C0', marginTop: 1, flexShrink: 0 }} />
                          <div>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1565C0', textTransform: 'uppercase', marginBottom: 2 }}>Prochaine action</div>
                            <span style={{ fontSize: '0.875rem', color: '#1565C0' }}>{cr.prochaine_action}</span>
                          </div>
                        </div>
                      )}
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
      </div>
      </>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <div className="flex-between mb-4">
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1.2rem' }}>{editing ? 'Modifier le CR' : 'Nouveau compte rendu'}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}><XCircle size={18} /></button>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>RDV associe</label>
                  <select style={IS(false)} value={form.rdv_id} onChange={e => setForm(f => ({ ...f, rdv_id: e.target.value }))}>
                    <option value="">-- Aucun --</option>
                    {rdvs.map(r => <option key={r.id} value={r.id}>{r.titre} ({r.date})</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Prospect</label>
                  <select style={IS(false)} value={form.prospect_id} onChange={e => setForm(f => ({ ...f, prospect_id: e.target.value }))}>
                    <option value="">-- Selectionner --</option>
                    {prospects.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Date</label>
                <input type="date" style={IS(false)} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Resume *</label>
                <textarea style={{ ...IS(errors.resume), resize: 'vertical', minHeight: 100 }} value={form.resume} onChange={e => setForm(f => ({ ...f, resume: e.target.value }))} placeholder="Ce qui a ete discute, les points abordes..." />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Decision prise</label>
                <input style={IS(false)} value={form.decision} onChange={e => setForm(f => ({ ...f, decision: e.target.value }))} placeholder="Ex: Client interesse, devis demande" />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Prochaine action</label>
                <input style={IS(false)} value={form.prochaine_action} onChange={e => setForm(f => ({ ...f, prochaine_action: e.target.value }))} placeholder="Ex: Envoyer devis sous 48h" />
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
