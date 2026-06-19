/**
 * BonsMouvements.jsx — Bons de mouvements de stock ERP CITYMO (Supabase)
 */
import { useState, useCallback } from 'react';
import {
  ArrowUpDown, Plus, Edit2, Trash2, Eye, Search, Filter, Download,
  ChevronLeft, ArrowDown, ArrowUp, Repeat, RotateCcw, AlertTriangle, Loader2, RefreshCw, CheckCircle2,
} from 'lucide-react';
import { useStockMovements } from '../../hooks/useStockMovements';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE, EMPLACEMENTS_STOCK,
  TYPES_MOUVEMENT, STATUTS_MOUVEMENT, BADGE_MOUVEMENT, BADGE_STATUT_MV,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow, UploadField,
} from './shared.jsx';

const EMPTY_FORM = {
  type_mouvement: 'Entrée',
  emplacement_source: '',
  emplacement_destination: '',
  article_id: '',
  quantite: '',
  cree_par: '',
  livreur: '',
  receptionnaire: '',
  motif: '',
  note: '',
  statut: 'Brouillon',
};

const TYPE_ICONS = {
  Entrée: <ArrowDown size={13} />,
  Sortie: <ArrowUp size={13} />,
  Transfert: <Repeat size={13} />,
  Retour: <RotateCcw size={13} />,
  Rebut: <AlertTriangle size={13} />,
};

function emplacementOptions(current) {
  const v = (current || '').trim();
  if (v && !EMPLACEMENTS_STOCK.includes(v)) return [v, ...EMPLACEMENTS_STOCK];
  return EMPLACEMENTS_STOCK;
}

function MvtForm({ initial, articles, onSave, onCancel, saving }) {
  const [form, setForm] = useState(() => (initial ? { ...EMPTY_FORM, ...initial } : { ...EMPTY_FORM }));
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const needsSource = ['Sortie', 'Transfert', 'Retour', 'Rebut'].includes(form.type_mouvement);
  const needsDest = ['Entrée', 'Transfert', 'Retour'].includes(form.type_mouvement);

  function validate() {
    const e = {};
    if (!form.type_mouvement) e.type_mouvement = 'Requis';
    if (!form.article_id) e.article_id = 'Requis';
    if (!form.quantite || Number(form.quantite) <= 0) e.quantite = 'Quantité invalide';
    if (needsSource && !form.emplacement_source) e.emplacement_source = 'Requis';
    if (needsDest && !form.emplacement_destination) e.emplacement_destination = 'Requis';
    return e;
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave(form);
  }

  return (
    <form onSubmit={handleSubmit}>
      <SectionTitle icon={<ArrowUpDown size={12} />}>Type de mouvement</SectionTitle>
      <FRow>
        <FField label="Type mouvement" required>
          <select
            value={form.type_mouvement}
            onChange={(e) => set('type_mouvement', e.target.value)}
            style={{ ...SELECT_STYLE, borderColor: errors.type_mouvement ? 'var(--red)' : 'var(--border)' }}
          >
            {TYPES_MOUVEMENT.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </FField>
        <FField label="Statut">
          <select value={form.statut} onChange={(e) => set('statut', e.target.value)} style={SELECT_STYLE}>
            {STATUTS_MOUVEMENT.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </FField>
      </FRow>

      <SectionTitle icon={<ArrowUpDown size={12} />}>Emplacements</SectionTitle>
      <FRow>
        {needsSource && (
          <FField label="Emplacement source" required>
            <select
              value={form.emplacement_source}
              onChange={(e) => set('emplacement_source', e.target.value)}
              style={{ ...SELECT_STYLE, borderColor: errors.emplacement_source ? 'var(--red)' : 'var(--border)' }}
            >
              <option value="">— Sélectionner —</option>
              {emplacementOptions(form.emplacement_source).map((emp) => (
                <option key={`src-${emp}`} value={emp}>{emp}</option>
              ))}
            </select>
            {errors.emplacement_source && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.emplacement_source}</div>}
          </FField>
        )}
        {needsDest && (
          <FField label="Emplacement destination" required>
            <select
              value={form.emplacement_destination}
              onChange={(e) => set('emplacement_destination', e.target.value)}
              style={{ ...SELECT_STYLE, borderColor: errors.emplacement_destination ? 'var(--red)' : 'var(--border)' }}
            >
              <option value="">— Sélectionner —</option>
              {emplacementOptions(form.emplacement_destination).map((emp) => (
                <option key={`dst-${emp}`} value={emp}>{emp}</option>
              ))}
            </select>
            {errors.emplacement_destination && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.emplacement_destination}</div>}
          </FField>
        )}
        {!needsSource && !needsDest && (
          <div style={{ gridColumn: '1 / -1', color: 'var(--text-3)', fontSize: '0.83rem' }}>
            Aucun emplacement requis pour ce type de mouvement.
          </div>
        )}
      </FRow>

      <SectionTitle>Article & Quantité</SectionTitle>
      <FRow>
        <FField label="Article lié" required>
          <select
            value={form.article_id}
            onChange={(e) => set('article_id', e.target.value)}
            style={{ ...SELECT_STYLE, borderColor: errors.article_id ? 'var(--red)' : 'var(--border)' }}
          >
            <option value="">— Sélectionner un article —</option>
            {(articles || []).filter((a) => a.statut !== 'Archivé').map((a) => (
              <option key={a.id} value={a.id}>{a.code} — {a.designation}</option>
            ))}
          </select>
          {errors.article_id && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.article_id}</div>}
        </FField>
        <FField label="Quantité" required>
          <input
            type="number"
            min="0.001"
            step="0.001"
            value={form.quantite}
            onChange={(e) => set('quantite', e.target.value)}
            placeholder="0"
            style={{ ...INPUT_STYLE, borderColor: errors.quantite ? 'var(--red)' : 'var(--border)' }}
          />
          {errors.quantite && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.quantite}</div>}
        </FField>
      </FRow>

      <SectionTitle>Personnes</SectionTitle>
      <FRow>
        <FField label="Créé par">
          <input value={form.cree_par} onChange={(e) => set('cree_par', e.target.value)} placeholder="Nom de l'opérateur..." style={INPUT_STYLE} />
        </FField>
        <FField label="Livreur">
          <input value={form.livreur} onChange={(e) => set('livreur', e.target.value)} placeholder="Utilisateur livreur..." style={INPUT_STYLE} />
        </FField>
        <FField label="Réceptionnaire">
          <input value={form.receptionnaire} onChange={(e) => set('receptionnaire', e.target.value)} placeholder="Utilisateur réception..." style={INPUT_STYLE} />
        </FField>
      </FRow>

      <SectionTitle>Détails</SectionTitle>
      <div style={{ marginBottom: 14 }}>
        <FField label="Motif">
          <input value={form.motif} onChange={(e) => set('motif', e.target.value)} placeholder="Raison du mouvement..." style={INPUT_STYLE} />
        </FField>
      </div>
      <div style={{ marginBottom: 16 }}>
        <FField label="Note">
          <textarea value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Notes additionnelles..." style={{ ...TEXTAREA_STYLE, minHeight: 56 }} />
        </FField>
      </div>

      <SectionTitle>Documents</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 20 }}>
        <UploadField label="Justificatif" />
        <UploadField label="Photo" />
        <UploadField label="Document" />
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {saving ? <Loader2 size={14} className="cin-spin" /> : <Plus size={14} />}
          {initial?.id ? 'Enregistrer' : 'Créer bon mouvement'}
        </button>
      </div>
    </form>
  );
}

function DetailMvt({ mvt, articles, onBack, onEdit }) {
  const article = (articles || []).find((a) => String(a.id) === String(mvt.article_id));

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={onBack}>
          <ChevronLeft size={15} /> Retour
        </button>
        <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', flex: 1 }}>
          {mvt.ref} — {mvt.type_mouvement}
        </h2>
        <span className={`badge ${BADGE_MOUVEMENT[mvt.type_mouvement] || 'badge-grey'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {TYPE_ICONS[mvt.type_mouvement]} {mvt.type_mouvement}
        </span>
        <span className={`badge ${BADGE_STATUT_MV[mvt.statut] || 'badge-grey'}`} style={{ fontSize: '0.72rem' }}>{mvt.statut}</span>
        <button type="button" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={onEdit}>
          <Edit2 size={13} /> Modifier
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <SectionTitle>Détails du mouvement</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, fontSize: '0.84rem' }}>
              {[
                ['Type', mvt.type_mouvement],
                ['Article', article ? `${article.code} — ${article.designation}` : mvt.article_designation || mvt.article_id],
                ['Quantité', mvt.quantite ? `${mvt.quantite}${article ? ` ${article.unite}` : ''}` : '—'],
                ['Emplacement source', mvt.emplacement_source],
                ['Emplacement destination', mvt.emplacement_destination],
                ['Créé par', mvt.cree_par],
                ['Livreur', mvt.livreur],
                ['Réceptionnaire', mvt.receptionnaire],
                ['Motif', mvt.motif],
              ].map(([l, v]) => (
                <div key={l}>
                  <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>{l}</span>
                  <div style={{ fontWeight: 500 }}>{v || '—'}</div>
                </div>
              ))}
            </div>
          </div>
          {mvt.note && (
            <div className="card">
              <SectionTitle>Note</SectionTitle>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-2)', margin: 0 }}>{mvt.note}</p>
            </div>
          )}
        </div>
        <div className="card">
          <SectionTitle>Informations</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.84rem' }}>
            <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Référence</span><div style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}>{mvt.ref}</div></div>
            <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Date</span><div>{mvt.date_creation}</div></div>
            <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Statut</span><span className={`badge ${BADGE_STATUT_MV[mvt.statut] || 'badge-grey'}`} style={{ fontSize: '0.72rem' }}>{mvt.statut}</span></div>
            {mvt.applied && <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Stock</span><span className="badge badge-green" style={{ fontSize: '0.72rem' }}>Appliqué</span></div>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BonsMouvements({ articles, onArticlesChange }) {
  const {
    records: mvts, loading, saving, error, success, configured,
    reload, save, remove,
  } = useStockMovements({ onArticlesChange });

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterEmplacement, setFilterEmplacement] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [detailId, setDetailId] = useState(null);

  const handleSave = useCallback(async (data) => {
    const res = await save(data, editItem?.id);
    if (res.success) {
      setShowModal(false);
      setEditItem(null);
    }
  }, [editItem, save]);

  async function handleDelete(id) {
    if (!window.confirm('Supprimer ce bon de mouvement ?')) return;
    const res = await remove(id);
    if (res.success) setDetailId(null);
  }

  const filtered = mvts.filter((x) => {
    const q = search.toLowerCase();
    const art = (articles || []).find((a) => String(a.id) === String(x.article_id));
    const artLabel = `${art?.code || ''} ${art?.designation || x.article_designation || ''}`.toLowerCase();
    const matchEmp = !filterEmplacement
      || x.emplacement_source === filterEmplacement
      || x.emplacement_destination === filterEmplacement;
    return (!q || x.ref.toLowerCase().includes(q) || (x.motif || '').toLowerCase().includes(q) || artLabel.includes(q))
      && (!filterType || x.type_mouvement === filterType)
      && (!filterStatut || x.statut === filterStatut)
      && matchEmp;
  });

  const today = new Date().toISOString().slice(0, 10);
  const mvtJour = mvts.filter((x) => x.date_creation === today).length;
  const entrees = mvts.filter((x) => x.type_mouvement === 'Entrée').length;
  const sorties = mvts.filter((x) => x.type_mouvement === 'Sortie').length;
  const transferts = mvts.filter((x) => x.type_mouvement === 'Transfert').length;
  const rebuts = mvts.filter((x) => x.type_mouvement === 'Rebut').length;

  if (detailId) {
    const mvt = mvts.find((x) => x.id === detailId);
    if (!mvt) { setDetailId(null); return null; }
    return (
      <DetailMvt
        mvt={mvt}
        articles={articles}
        onBack={() => setDetailId(null)}
        onEdit={() => { setEditItem(mvt); setShowModal(true); setDetailId(null); }}
      />
    );
  }

  if (loading && !mvts.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, gap: 10, color: 'var(--text-3)' }}>
        <Loader2 size={22} className="cin-spin" /> Chargement des bons de mouvement…
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {!configured && (
        <div className="card" style={{ marginBottom: 12, padding: 12, color: 'var(--red)', fontSize: '0.85rem' }}>
          Supabase non configuré — connectez-vous pour enregistrer les mouvements.
        </div>
      )}
      {error && (
        <div className="card" style={{ marginBottom: 12, padding: 12, color: 'var(--red)', fontSize: '0.85rem' }}>{error}</div>
      )}
      {success && (
        <div className="card" style={{ marginBottom: 12, padding: 12, color: '#2E7D32', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle2 size={16} /> {success}
        </div>
      )}

      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">BONS DE MOUVEMENTS</h1>
          <p className="page-subtitle">Entrées, sorties et transferts entre emplacements.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={reload} disabled={loading}>
            <RefreshCw size={14} /> Actualiser
          </button>
          <button type="button" className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowFilters((f) => !f)}>
            <Filter size={14} /> Filtres
          </button>
          <button type="button" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} /> Export
          </button>
          <button type="button" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { setEditItem(null); setShowModal(true); }}>
            <Plus size={15} /> Ajouter mouvement
          </button>
        </div>
      </div>

      <div className="stat-grid finance-kpi-grid" style={{ marginBottom: 20 }}>
        <KpiCard icon={<ArrowUpDown size={17} />} label="Mouvements auj." value={mvtJour} color="grey" />
        <KpiCard icon={<ArrowDown size={17} />} label="Entrées" value={entrees} color="green" />
        <KpiCard icon={<ArrowUp size={17} />} label="Sorties" value={sorties} color="red" />
        <KpiCard icon={<Repeat size={17} />} label="Transferts" value={transferts} color="blue" />
        <KpiCard icon={<AlertTriangle size={17} />} label="Rebuts" value={rebuts} color="orange" />
      </div>

      {showFilters ? (
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Référence, article, motif..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 140 }}>
              <option value="">Tous types</option>
              {TYPES_MOUVEMENT.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 140 }}>
              <option value="">Tous statuts</option>
              {STATUTS_MOUVEMENT.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterEmplacement} onChange={(e) => setFilterEmplacement(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 220 }}>
              <option value="">Tous emplacements</option>
              {EMPLACEMENTS_STOCK.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterType(''); setFilterStatut(''); setFilterEmplacement(''); }}>
              Réinitialiser
            </button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un bon de mouvement..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<ArrowUpDown size={24} />}
            title="Aucun mouvement"
            sub={configured ? 'Créez votre premier bon de mouvement entre emplacements.' : 'Connectez Supabase pour enregistrer les mouvements.'}
            action="Ajouter mouvement"
            onAction={() => { setEditItem(null); setShowModal(true); }}
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Type</th>
                  <th>Article</th>
                  <th>Qté</th>
                  <th>Source</th>
                  <th>Destination</th>
                  <th>Date</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((x) => {
                  const art = (articles || []).find((a) => String(a.id) === String(x.article_id));
                  return (
                    <tr key={x.id} style={{ cursor: 'pointer' }} onClick={() => setDetailId(x.id)}>
                      <td><span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--red)' }}>{x.ref}</span></td>
                      <td data-label="Type">
                        <span className={`badge ${BADGE_MOUVEMENT[x.type_mouvement] || 'badge-grey'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem' }}>
                          {TYPE_ICONS[x.type_mouvement]} {x.type_mouvement}
                        </span>
                      </td>
                      <td data-label="Article" style={{ fontSize: '0.83rem', fontWeight: 600 }}>
                        {art ? `${art.code} — ${art.designation}` : x.article_designation || '—'}
                      </td>
                      <td data-label="Qté" style={{ fontWeight: 700 }}>{x.quantite}</td>
                      <td data-label="Source" style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>{x.emplacement_source || '—'}</td>
                      <td data-label="Destination" style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>{x.emplacement_destination || '—'}</td>
                      <td data-label="Date">{x.date_creation}</td>
                      <td data-label="Statut">
                        <span className={`badge ${BADGE_STATUT_MV[x.statut] || 'badge-grey'}`} style={{ fontSize: '0.72rem' }}>{x.statut}</span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 3 }}>
                          <button type="button" className="btn btn-secondary btn-sm" title="Voir" onClick={() => setDetailId(x.id)}><Eye size={13} /></button>
                          <button type="button" className="btn btn-ghost btn-sm" title="Modifier" onClick={() => { setEditItem(x); setShowModal(true); }}><Edit2 size={13} /></button>
                          <button type="button" className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => handleDelete(x.id)} style={{ color: 'var(--red)' }} disabled={saving}><Trash2 size={13} /></button>
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

      <Modal open={showModal} onClose={() => { if (!saving) { setShowModal(false); setEditItem(null); } }} title={editItem ? 'Modifier le bon de mouvement' : 'Nouveau bon de mouvement'} width={720}>
        <MvtForm
          initial={editItem}
          articles={articles}
          onSave={handleSave}
          onCancel={() => { if (!saving) { setShowModal(false); setEditItem(null); } }}
          saving={saving}
        />
      </Modal>
    </div>
  );
}
