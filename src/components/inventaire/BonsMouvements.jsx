/**
 * BonsMouvements.jsx — Bons de mouvements de stock ERP CITYMO
 */
import { useState, useCallback } from 'react';
import { ArrowUpDown, Plus, Edit2, Trash2, Eye, Search, Filter, Download, ChevronLeft, ArrowDown, ArrowUp, Repeat, RotateCcw, AlertTriangle } from 'lucide-react';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE,
  TYPES_MOUVEMENT, STATUTS_MOUVEMENT, BADGE_MOUVEMENT, BADGE_STATUT_MV,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow, UploadField,
  genRef, genId
} from './shared.jsx';

const EMPTY_FORM = {
  type_mouvement: 'Entrée',
  depot_source_id: '',
  depot_destination_id: '',
  article_id: '',
  quantite: '',
  projet_lie: '',
  cree_par: '',
  livreur: '',
  receptionnaire: '',
  motif: '',
  note: '',
  statut: 'Brouillon',
};

const TYPE_ICONS = {
  'Entrée':    <ArrowDown size={13} />,
  'Sortie':    <ArrowUp size={13} />,
  'Transfert': <Repeat size={13} />,
  'Retour':    <RotateCcw size={13} />,
  'Rebut':     <AlertTriangle size={13} />,
};

function MvtForm({ initial, depots, articles, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const needsSource = ['Sortie', 'Transfert', 'Retour', 'Rebut'].includes(form.type_mouvement);
  const needsDest   = ['Entrée', 'Transfert', 'Retour'].includes(form.type_mouvement);

  function validate() {
    const e = {};
    if (!form.type_mouvement) e.type_mouvement = 'Requis';
    if (!form.quantite || Number(form.quantite) <= 0) e.quantite = 'Quantité invalide';
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
          <select value={form.type_mouvement} onChange={e => set('type_mouvement', e.target.value)} style={{ ...SELECT_STYLE, borderColor: errors.type_mouvement ? 'var(--red)' : 'var(--border)' }}>
            {TYPES_MOUVEMENT.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </FField>
        <FField label="Statut">
          <select value={form.statut} onChange={e => set('statut', e.target.value)} style={SELECT_STYLE}>
            {STATUTS_MOUVEMENT.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </FField>
      </FRow>

      <SectionTitle icon={<ArrowUpDown size={12} />}>Dépôts</SectionTitle>
      <FRow>
        {needsSource && (
          <FField label="Dépôt source">
            <select value={form.depot_source_id} onChange={e => set('depot_source_id', e.target.value)} style={SELECT_STYLE}>
              <option value="">— Sélectionner —</option>
              {(depots || []).map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
            </select>
          </FField>
        )}
        {needsDest && (
          <FField label="Dépôt destination">
            <select value={form.depot_destination_id} onChange={e => set('depot_destination_id', e.target.value)} style={SELECT_STYLE}>
              <option value="">— Sélectionner —</option>
              {(depots || []).map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
            </select>
          </FField>
        )}
        {!needsSource && !needsDest && (
          <div style={{ gridColumn: '1 / -1', color: 'var(--text-3)', fontSize: '0.83rem' }}>
            Aucun dépôt requis pour ce type de mouvement.
          </div>
        )}
      </FRow>

      <SectionTitle>Article & Quantité</SectionTitle>
      <FRow>
        <FField label="Article lié">
          <select value={form.article_id} onChange={e => set('article_id', e.target.value)} style={SELECT_STYLE}>
            <option value="">— Sélectionner un article —</option>
            {(articles || []).map(a => <option key={a.id} value={a.id}>{a.code} — {a.designation}</option>)}
          </select>
        </FField>
        <FField label="Quantité" required>
          <input type="number" min="1" step="1" value={form.quantite} onChange={e => set('quantite', e.target.value)}
            placeholder="0"
            style={{ ...INPUT_STYLE, borderColor: errors.quantite ? 'var(--red)' : 'var(--border)' }} />
          {errors.quantite && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.quantite}</div>}
        </FField>
        <FField label="Projet lié">
          <input value={form.projet_lie} onChange={e => set('projet_lie', e.target.value)}
            placeholder="Nom du projet..." style={INPUT_STYLE} />
        </FField>
      </FRow>

      <SectionTitle>Personnes</SectionTitle>
      <FRow>
        <FField label="Créé par">
          <input value={form.cree_par} onChange={e => set('cree_par', e.target.value)}
            placeholder="Nom de l'opérateur..." style={INPUT_STYLE} />
        </FField>
        <FField label="Livreur">
          <input value={form.livreur} onChange={e => set('livreur', e.target.value)}
            placeholder="Utilisateur livreur..." style={INPUT_STYLE} />
        </FField>
        <FField label="Réceptionnaire">
          <input value={form.receptionnaire} onChange={e => set('receptionnaire', e.target.value)}
            placeholder="Utilisateur réception..." style={INPUT_STYLE} />
        </FField>
      </FRow>

      <SectionTitle>Détails</SectionTitle>
      <div style={{ marginBottom: 14 }}>
        <FField label="Motif">
          <input value={form.motif} onChange={e => set('motif', e.target.value)}
            placeholder="Raison du mouvement..." style={INPUT_STYLE} />
        </FField>
      </div>
      <div style={{ marginBottom: 16 }}>
        <FField label="Note">
          <textarea value={form.note} onChange={e => set('note', e.target.value)}
            placeholder="Notes additionnelles..." style={{ ...TEXTAREA_STYLE, minHeight: 56 }} />
        </FField>
      </div>

      <SectionTitle>Documents</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 20 }}>
        <UploadField label="Justificatif" />
        <UploadField label="Photo" />
        <UploadField label="Document" />
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> {initial ? 'Enregistrer' : 'Créer bon mouvement'}
        </button>
      </div>
    </form>
  );
}

function DetailMvt({ mvt, depots, articles, onBack, onEdit }) {
  const depotSrc  = (depots || []).find(d => String(d.id) === String(mvt.depot_source_id));
  const depotDest = (depots || []).find(d => String(d.id) === String(mvt.depot_destination_id));
  const article   = (articles || []).find(a => String(a.id) === String(mvt.article_id));

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={onBack}>
          <ChevronLeft size={15} /> Retour
        </button>
        <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', flex: 1 }}>
          {mvt.ref} — {mvt.type_mouvement}
        </h2>
        <span className={'badge ' + (BADGE_MOUVEMENT[mvt.type_mouvement] || 'badge-grey')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {TYPE_ICONS[mvt.type_mouvement]} {mvt.type_mouvement}
        </span>
        <span className={'badge ' + (BADGE_STATUT_MV[mvt.statut] || 'badge-grey')} style={{ fontSize: '0.72rem' }}>{mvt.statut}</span>
        <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={onEdit}>
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
                ['Article', article ? article.designation : mvt.article_id],
                ['Quantité', mvt.quantite ? mvt.quantite + (article ? ' ' + article.unite : '') : '—'],
                ['Dépôt source', depotSrc ? depotSrc.nom : mvt.depot_source_id || '—'],
                ['Dépôt destination', depotDest ? depotDest.nom : mvt.depot_destination_id || '—'],
                ['Projet lié', mvt.projet_lie],
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
            <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Date création</span><div>{mvt.date_creation}</div></div>
            <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Statut</span><span className={'badge ' + (BADGE_STATUT_MV[mvt.statut] || 'badge-grey')} style={{ fontSize: '0.72rem' }}>{mvt.statut}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BonsMouvements({ depots, articles }) {
  const [mvts, setMvts] = useState([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const today = new Date().toISOString().slice(0, 10);

  const handleSave = useCallback((data) => {
    if (editItem) {
      setMvts(prev => prev.map(x => x.id === editItem.id ? { ...x, ...data } : x));
    } else {
      setMvts(prev => [...prev, { ...data, id: genId(), ref: genRef('BM'), date_creation: today }]);
    }
    setShowModal(false); setEditItem(null);
  }, [editItem, today]);

  function handleDelete(id) {
    if (window.confirm('Supprimer ce bon de mouvement ?')) { setMvts(prev => prev.filter(x => x.id !== id)); setDetailId(null); }
  }

  const filtered = mvts.filter(x => {
    const q = search.toLowerCase();
    return (!q || x.ref.toLowerCase().includes(q) || (x.motif || '').toLowerCase().includes(q) || (x.projet_lie || '').toLowerCase().includes(q))
      && (!filterType || x.type_mouvement === filterType)
      && (!filterStatut || x.statut === filterStatut);
  });

  const today2 = new Date().toISOString().slice(0, 10);
  const mvtJour   = mvts.filter(x => x.date_creation === today2).length;
  const entrees   = mvts.filter(x => x.type_mouvement === 'Entrée').length;
  const sorties   = mvts.filter(x => x.type_mouvement === 'Sortie').length;
  const transferts = mvts.filter(x => x.type_mouvement === 'Transfert').length;
  const rebuts    = mvts.filter(x => x.type_mouvement === 'Rebut').length;

  if (detailId) {
    const mvt = mvts.find(x => x.id === detailId);
    if (!mvt) { setDetailId(null); return null; }
    return <DetailMvt mvt={mvt} depots={depots} articles={articles} onBack={() => setDetailId(null)} onEdit={() => { setEditItem(mvt); setShowModal(true); setDetailId(null); }} />;
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">BONS DE MOUVEMENTS</h1>
          <p className="page-subtitle">Gestion des entrées, sorties et transferts de stock.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowFilters(f => !f)}><Filter size={14} /> Filtres</button>
          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Download size={14} /> Export</button>
          <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { setEditItem(null); setShowModal(true); }}>
            <Plus size={15} /> Ajouter mouvement
          </button>
        </div>
      </div>

      <div className="stat-grid finance-kpi-grid" style={{ marginBottom: 20 }}>
        <KpiCard icon={<ArrowUpDown size={17} />} label="Mouvements auj." value={mvtJour}   color="grey"   />
        <KpiCard icon={<ArrowDown size={17} />}   label="Entrées"         value={entrees}   color="green"  />
        <KpiCard icon={<ArrowUp size={17} />}     label="Sorties"         value={sorties}   color="red"    />
        <KpiCard icon={<Repeat size={17} />}      label="Transferts"      value={transferts} color="blue"  />
        <KpiCard icon={<AlertTriangle size={17} />} label="Rebuts"        value={rebuts}    color="orange" />
      </div>

      {showFilters ? (
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Référence, motif, projet..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 140 }}>
              <option value="">Tous types</option>
              {TYPES_MOUVEMENT.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 140 }}>
              <option value="">Tous statuts</option>
              {STATUTS_MOUVEMENT.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterType(''); setFilterStatut(''); }}>Réinitialiser</button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un bon de mouvement..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <EmptyState icon={<ArrowUpDown size={24} />} title="Aucun mouvement" sub="Créez votre premier bon de mouvement" action="Ajouter mouvement" onAction={() => { setEditItem(null); setShowModal(true); }} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Type</th>
                  <th>Dépôt source</th>
                  <th>Dépôt destination</th>
                  <th>Projet</th>
                  <th>Date</th>
                  <th>Utilisateur</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(x => {
                  const depotSrc  = (depots || []).find(d => String(d.id) === String(x.depot_source_id));
                  const depotDest = (depots || []).find(d => String(d.id) === String(x.depot_destination_id));
                  return (
                    <tr key={x.id} style={{ cursor: 'pointer' }} onClick={() => setDetailId(x.id)}>
                      <td><span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--red)' }}>{x.ref}</span></td>
                      <td data-label="Type">
                        <span className={'badge ' + (BADGE_MOUVEMENT[x.type_mouvement] || 'badge-grey')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem' }}>
                          {TYPE_ICONS[x.type_mouvement]} {x.type_mouvement}
                        </span>
                      </td>
                      <td data-label="Source" style={{ fontSize: '0.83rem' }}>{depotSrc ? depotSrc.nom : '—'}</td>
                      <td data-label="Destination" style={{ fontSize: '0.83rem' }}>{depotDest ? depotDest.nom : '—'}</td>
                      <td data-label="Projet" style={{ fontSize: '0.83rem', color: 'var(--text-2)' }}>{x.projet_lie || '—'}</td>
                      <td data-label="Date">{x.date_creation}</td>
                      <td data-label="Utilisateur" style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>{x.cree_par || '—'}</td>
                      <td data-label="Statut">
                        <span className={'badge ' + (BADGE_STATUT_MV[x.statut] || 'badge-grey')} style={{ fontSize: '0.72rem' }}>{x.statut}</span>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 3 }}>
                          <button className="btn btn-secondary btn-sm" title="Voir" onClick={() => setDetailId(x.id)}><Eye size={13} /></button>
                          <button className="btn btn-ghost btn-sm" title="Modifier" onClick={() => { setEditItem(x); setShowModal(true); }}><Edit2 size={13} /></button>
                          <button className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => handleDelete(x.id)} style={{ color: 'var(--red)' }}><Trash2 size={13} /></button>
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

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditItem(null); }} title={editItem ? 'Modifier le bon de mouvement' : 'Nouveau bon de mouvement'} width={720}>
        <MvtForm initial={editItem} depots={depots} articles={articles} onSave={handleSave} onCancel={() => { setShowModal(false); setEditItem(null); }} />
      </Modal>
    </div>
  );
}
