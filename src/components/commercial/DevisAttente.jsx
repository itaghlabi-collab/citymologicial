import { useState, useRef, useMemo } from 'react';
import { FileEdit, Plus, Edit2, Trash2, X, Search, Paperclip, Clock, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { useDevisAttente } from '../../hooks/useDevisAttente';
import { TYPE_PROJET_VALUES, TYPE_PROJET_LABEL, SOURCE_VALUES, SOURCE_LABEL } from '../../constants/commercial';

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

const IS = (e) => ({
  padding: '7px 10px',
  border: `1.5px solid ${e ? 'var(--red)' : 'var(--border)'}`,
  borderRadius: 'var(--radius)',
  fontSize: '0.84rem',
  fontFamily: 'var(--font-body)',
  outline: 'none',
  width: '100%',
  background: '#fff',
  minHeight: 36,
  boxSizing: 'border-box',
});

function Toast({ t }) {
  if (!t) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      background: t.type === 'success' ? '#2E7D32' : '#D32F2F',
      color: '#fff', padding: '12px 20px', borderRadius: 10,
      boxShadow: '0 4px 20px rgba(0,0,0,0.22)', fontSize: '0.88rem', fontWeight: 600, maxWidth: 340,
    }}
    >
      {t.msg}
    </div>
  );
}

const EMPTY_FORM = {
  titre: '', prospect_id: '', prospect_nom: '', type_projet: '', source: '', statut: 'en_attente',
  commentaire: '', assigne_id: '', montant_estime: '', date_relance: '',
};

export default function DevisAttente() {
  const {
    records,
    prospectOptions,
    loading,
    saving,
    error,
    clearError,
    configured,
    load,
    create,
    update,
    remove,
    filterDevisRecords,
    computeDevisStats,
    isDevisStale,
    DEVIS_STATUTS,
    DEVIS_STATUT_LABEL,
    DEVIS_STATUT_BADGE,
  } = useDevisAttente();

  const [modal, setModal] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState(null);
  const [filterStatut, setFilterStatut] = useState('');
  const [filterProspect, setFilterProspect] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterMontantMin, setFilterMontantMin] = useState('');
  const [search, setSearch] = useState('');
  const toastRef = useRef(null);

  function showToast(type, msg) {
    setToast({ type, msg });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }

  function openAdd() {
    clearError?.();
    setEditRow(null);
    setForm({ ...EMPTY_FORM });
    setErrors({});
    setModal(true);
  }

  function openEdit(row) {
    clearError?.();
    setEditRow(row);
    setForm({
      titre: row.titre || '',
      prospect_id: row.prospect_id || '',
      prospect_nom: row.prospect_id ? '' : (row.prospect_nom || ''),
      type_projet: row.type_projet || '',
      source: row.source || '',
      statut: row.statut || 'en_attente',
      commentaire: row.commentaire || '',
      assigne_id: row.assigne_id || '',
      montant_estime: row.montant_estime != null ? String(row.montant_estime) : '',
      date_relance: row.date_relance || '',
    });
    setErrors({});
    setModal(true);
  }

  function setField(k, v) { setForm((p) => ({ ...p, [k]: v })); }

  function validate() {
    const e = {};
    if (!form.type_projet) e.type_projet = 'Requis';
    if (!form.source) e.source = 'Requis';
    return e;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const result = editRow ? await update(editRow.id, form) : await create(form);
    if (!result.success) {
      showToast('error', result.error || 'Erreur enregistrement.');
      return;
    }

    showToast('success', editRow ? 'Devis mis à jour.' : 'Devis créé.');
    setModal(false);
  }

  async function handleDelete(row) {
    if (!window.confirm('Supprimer ce devis ?')) return;
    const result = await remove(row.id);
    showToast(result.success ? 'success' : 'error', result.success ? 'Devis supprimé.' : (result.error || 'Erreur.'));
  }

  const filtered = useMemo(
    () => filterDevisRecords(records, {
      search,
      statut: filterStatut,
      prospectId: filterProspect,
      date: filterDate,
      montantMin: filterMontantMin,
    }),
    [records, search, filterStatut, filterProspect, filterDate, filterMontantMin, filterDevisRecords],
  );

  const stats = useMemo(() => computeDevisStats(records), [records, computeDevisStats]);
  const hasFilters = filterStatut || filterProspect || filterDate || filterMontantMin || search;

  return (
    <div className="animate-fade-in devis-attente-page">
      <Toast t={toast} />

      <div className="page-header flex-between devis-attente-header">
        <div>
          <h1 className="page-title">Devis en attente</h1>
          <p className="page-subtitle">Suivi et gestion des devis commerciaux</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd} disabled={loading || saving || !configured}>
          <Plus size={15} /> Nouveau devis
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

      <div className="stat-grid devis-attente-stats" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-icon blue"><FileEdit size={18} /></div>
          <div className="stat-body"><div className="stat-value">{loading ? '—' : stats.total}</div><div className="stat-label">Total devis</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><Clock size={18} /></div>
          <div className="stat-body"><div className="stat-value">{loading ? '—' : stats.enAttente}</div><div className="stat-label">En attente</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><CheckCircle size={18} /></div>
          <div className="stat-body"><div className="stat-value">{loading ? '—' : stats.acceptes}</div><div className="stat-label">Acceptés</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#ECEFF1' }}><CheckCircle size={18} style={{ color: '#546E7A' }} /></div>
          <div className="stat-body"><div className="stat-value">{loading ? '—' : stats.finalises}</div><div className="stat-label">Finalisés</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#FFEBEE' }}><X size={18} style={{ color: 'var(--red)' }} /></div>
          <div className="stat-body"><div className="stat-value">{loading ? '—' : stats.refuses}</div><div className="stat-label">Refusés</div></div>
        </div>
        {stats.stagnants > 0 && (
          <div className="stat-card" style={{ border: '1.5px solid #FF6F00' }}>
            <div className="stat-icon" style={{ background: '#FFF3E0' }}><AlertTriangle size={18} style={{ color: '#FF6F00' }} /></div>
            <div className="stat-body"><div className="stat-value" style={{ color: '#FF6F00' }}>{stats.stagnants}</div><div className="stat-label">Stagnants +48h</div></div>
          </div>
        )}
      </div>

      {/* Filtres compacts */}
      <div className="card devis-attente-filters">
        <div className="devis-attente-filter-row">
          <div className="devis-attente-search">
            <Search size={13} className="devis-attente-search-icon" />
            <input
              placeholder="Rechercher…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...IS(false), paddingLeft: 28 }}
            />
          </div>
          <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} style={IS(false)} className="devis-attente-filter-ctrl">
            <option value="">Tous les statuts</option>
            {DEVIS_STATUTS.map((s) => <option key={s} value={s}>{DEVIS_STATUT_LABEL[s]}</option>)}
          </select>
          <select value={filterProspect} onChange={(e) => setFilterProspect(e.target.value)} style={IS(false)} className="devis-attente-filter-ctrl">
            <option value="">Tous les prospects</option>
            {prospectOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} style={IS(false)} className="devis-attente-filter-ctrl" />
          <input
            type="number"
            min="0"
            placeholder="Montant min"
            value={filterMontantMin}
            onChange={(e) => setFilterMontantMin(e.target.value)}
            style={IS(false)}
            className="devis-attente-filter-ctrl devis-attente-filter-montant"
          />
          {hasFilters && (
            <button
              type="button"
              className="devis-attente-clear"
              onClick={() => {
                setSearch('');
                setFilterStatut('');
                setFilterProspect('');
                setFilterDate('');
                setFilterMontantMin('');
              }}
            >
              Effacer
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="flex-between mb-4">
          <div className="card-title" style={{ marginBottom: 0 }}><FileEdit size={16} /> Devis ({filtered.length})</div>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>
            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ fontSize: '0.88rem' }}>Chargement...</div>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FileEdit size={22} style={{ color: 'var(--text-3)' }} />}
            title={records.length === 0 ? 'Aucun devis enregistré' : 'Aucun résultat pour ces filtres'}
            sub={records.length === 0 ? 'Créez votre premier devis en cliquant sur Nouveau devis' : 'Modifiez vos critères de recherche'}
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Numéro</th>
                  <th>Titre</th>
                  <th>Prospect</th>
                  <th>Type projet</th>
                  <th>Source</th>
                  <th>Statut</th>
                  <th>Mise à jour</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} style={isDevisStale(r) ? { background: '#FFF8E1' } : {}}>
                    <td data-label="Numéro" style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>
                      {r.numero || (`DV-${String(r.id).slice(0, 8)}`)}
                      {isDevisStale(r) && <span style={{ marginLeft: 6 }} title="Non mis à jour depuis +48h"><AlertTriangle size={12} style={{ color: '#FF6F00', verticalAlign: 'middle' }} /></span>}
                    </td>
                    <td data-label="Titre" style={{ fontWeight: 600, maxWidth: 220 }}>{r.titre || '—'}</td>
                    <td data-label="Prospect" style={{ fontWeight: 600 }}>{r.prospect_nom || '—'}</td>
                    <td data-label="Type projet"><span className="badge badge-blue">{TYPE_PROJET_LABEL[r.type_projet] || r.type_projet || '—'}</span></td>
                    <td data-label="Source" style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{SOURCE_LABEL[r.source] || r.source || '—'}</td>
                    <td data-label="Statut"><span className={`badge ${DEVIS_STATUT_BADGE[r.statut] || 'badge-grey'}`}>{DEVIS_STATUT_LABEL[r.statut] || r.statut}</span></td>
                    <td data-label="Mise à jour" style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>{r.updated_at ? String(r.updated_at).slice(0, 10) : '—'}</td>
                    <td data-label="Actions">
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }} onClick={() => openEdit(r)}><Edit2 size={13} /></button>
                        <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }} onClick={() => handleDelete(r)}><Trash2 size={13} style={{ color: 'var(--red)' }} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="devis-attente-modal-backdrop">
          <div className="devis-attente-modal">
            <div className="flex-between" style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.3rem', textTransform: 'uppercase' }}>
                {editRow ? 'Modifier devis' : 'Nouveau devis'}
              </h2>
              <button type="button" onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              <div className="form-group">
                <label>Titre de devis</label>
                <input
                  style={IS(false)}
                  value={form.titre}
                  onChange={(e) => setField('titre', e.target.value)}
                  placeholder="ex. Aménagement local, Construction..."
                />
              </div>
              <div className="form-group">
                <label>Prospect</label>
                <select
                  style={IS(false)}
                  value={form.prospect_id}
                  onChange={(e) => setForm((p) => ({
                    ...p,
                    prospect_id: e.target.value,
                    prospect_nom: e.target.value ? '' : p.prospect_nom,
                  }))}
                >
                  <option value="">Choisir un prospect...</option>
                  {prospectOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                <div style={{ margin: '8px 0 4px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  ou saisir un nom
                </div>
                <input
                  style={IS(false)}
                  value={form.prospect_nom}
                  onChange={(e) => setForm((p) => ({
                    ...p,
                    prospect_nom: e.target.value,
                    prospect_id: e.target.value.trim() ? '' : p.prospect_id,
                  }))}
                  placeholder="Nom du prospect (saisie libre)"
                  disabled={!!form.prospect_id}
                />
              </div>
              <div className="devis-attente-form-grid">
                <div className="form-group">
                  <label>Type de projet *</label>
                  <select style={IS(errors.type_projet)} value={form.type_projet} onChange={(e) => setField('type_projet', e.target.value)}>
                    <option value="">Choisir...</option>
                    {TYPE_PROJET_VALUES.map((v) => <option key={v} value={v}>{TYPE_PROJET_LABEL[v]}</option>)}
                  </select>
                  {errors.type_projet && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.type_projet}</span>}
                </div>
                <div className="form-group">
                  <label>Source *</label>
                  <select style={IS(errors.source)} value={form.source} onChange={(e) => setField('source', e.target.value)}>
                    <option value="">Choisir...</option>
                    {SOURCE_VALUES.map((v) => <option key={v} value={v}>{SOURCE_LABEL[v]}</option>)}
                  </select>
                  {errors.source && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.source}</span>}
                </div>
              </div>
              <div className="devis-attente-form-grid">
                <div className="form-group">
                  <label>Montant estimé (MAD)</label>
                  <input type="number" min="0" style={IS(false)} value={form.montant_estime || ''} onChange={(e) => setField('montant_estime', e.target.value)} placeholder="150000" />
                </div>
                <div className="form-group">
                  <label>Date relance</label>
                  <input type="date" style={IS(false)} value={form.date_relance || ''} onChange={(e) => setField('date_relance', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label>Statut</label>
                <select style={IS(false)} value={form.statut} onChange={(e) => setField('statut', e.target.value)}>
                  {DEVIS_STATUTS.map((s) => <option key={s} value={s}>{DEVIS_STATUT_LABEL[s]}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Commentaire</label>
                <textarea rows={3} style={{ ...IS(false), resize: 'vertical', minHeight: 72 }} value={form.commentaire} onChange={(e) => setField('commentaire', e.target.value)} placeholder="Notes, observations..." />
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Paperclip size={13} /> Document (PDF/image)</label>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ fontSize: '0.85rem', color: 'var(--text-2)' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> : <><Plus size={14} /> {editRow ? 'Enregistrer' : 'Créer'}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
