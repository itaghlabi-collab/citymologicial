/**
 * BonsMouvements.jsx — Liste et formulaire bons de mouvement (style devis)
 */
import { useState } from 'react';
import {
  ArrowUpDown, Plus, Edit2, Trash2, Eye, Search, Filter, Download,
  ChevronLeft, ArrowDown, ArrowUp, Repeat, RotateCcw, AlertTriangle,
  Loader2, RefreshCw, CheckCircle2,
} from 'lucide-react';
import { useStockMovements } from '../../hooks/useStockMovements';
import { generateMouvementPdf } from '../../services/inventaire/mouvementPdf';
import BonMouvementForm from './BonMouvementForm.jsx';
import {
  INPUT_STYLE, SELECT_STYLE, EMPLACEMENTS_STOCK,
  TYPES_MOUVEMENT, STATUTS_MOUVEMENT, BADGE_MOUVEMENT, BADGE_STATUT_MV,
  KpiCard, EmptyState, SectionTitle,
} from './shared.jsx';

const TYPE_ICONS = {
  Entrée: <ArrowDown size={13} />,
  Sortie: <ArrowUp size={13} />,
  Transfert: <Repeat size={13} />,
  Retour: <RotateCcw size={13} />,
  Rebut: <AlertTriangle size={13} />,
};

function DetailBon({ bon, articles, onBack, onEdit, onPdf, onDelete, pdfLoading }) {
  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={onBack}>
          <ChevronLeft size={15} /> Retour
        </button>
        <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', flex: 1 }}>
          {bon.ref} — {bon.type_mouvement}
        </h2>
        <span className={`badge ${BADGE_MOUVEMENT[bon.type_mouvement] || 'badge-grey'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {TYPE_ICONS[bon.type_mouvement]} {bon.type_mouvement}
        </span>
        <span className={`badge ${BADGE_STATUT_MV[bon.statut] || 'badge-grey'}`} style={{ fontSize: '0.72rem' }}>{bon.statut}</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onPdf} disabled={pdfLoading}>
          {pdfLoading ? <Loader2 size={13} className="cin-spin" /> : <Download size={13} />} PDF
        </button>
        {!bon.applied && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}><Edit2 size={13} /> Modifier</button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDelete} style={{ color: 'var(--red)' }}><Trash2 size={13} /> Supprimer</button>
      </div>

      <div className="card" style={{ marginBottom: 14, padding: '18px 20px' }}>
        <SectionTitle>Détails du bon</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, fontSize: '0.84rem' }}>
          {[
            ['Type', bon.type_mouvement],
            ['Source', bon.emplacement_source],
            ['Destination', bon.emplacement_destination],
            ['Créé par', bon.cree_par],
            ['Livreur', bon.livreur],
            ['Réceptionnaire', bon.receptionnaire],
            ['Date', bon.date_creation],
            ['Motif', bon.motif],
          ].map(([l, v]) => (
            <div key={l}>
              <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>{l}</span>
              <div style={{ fontWeight: 500 }}>{v || '—'}</div>
            </div>
          ))}
        </div>
        {bon.note && <p style={{ marginTop: 12, fontSize: '0.84rem', color: 'var(--text-2)' }}>{bon.note}</p>}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Article</th>
                <th>Qté</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {(bon.lignes || []).map((l, idx) => {
                const art = (articles || []).find((a) => String(a.id) === String(l.article_id));
                return (
                  <tr key={l.id || idx}>
                    <td>{idx + 1}</td>
                    <td style={{ fontWeight: 600 }}>{art ? `${art.code} — ${art.designation}` : l.article_designation || '—'}</td>
                    <td style={{ fontWeight: 700 }}>{l.quantite}</td>
                    <td style={{ color: 'var(--text-2)', fontSize: '0.83rem' }}>{l.notes || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '12px 16px', fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-2)', borderTop: '1px solid var(--border)' }}>
          Lignes : {bon.lignes?.length || 0} — Quantité totale : {bon.quantite_totale || 0}
        </div>
      </div>
    </div>
  );
}

export default function BonsMouvements({ articles, onArticlesChange }) {
  const {
    records: bons, loading, saving, error, success, configured,
    reload, save, remove,
  } = useStockMovements({ onArticlesChange });

  const [view, setView] = useState('list');
  const [editingBon, setEditingBon] = useState(null);
  const [detailRef, setDetailRef] = useState(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterEmplacement, setFilterEmplacement] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const filtered = bons.filter((x) => {
    const q = search.toLowerCase();
    const matchEmp = !filterEmplacement
      || x.emplacement_source === filterEmplacement
      || x.emplacement_destination === filterEmplacement;
    return (!q || x.ref.toLowerCase().includes(q) || (x.motif || '').toLowerCase().includes(q) || (x.cree_par || '').toLowerCase().includes(q))
      && (!filterType || x.type_mouvement === filterType)
      && (!filterStatut || x.statut === filterStatut)
      && matchEmp;
  });

  const today = new Date().toISOString().slice(0, 10);
  const mvtJour = bons.filter((x) => x.date_creation === today).length;
  const entrees = bons.filter((x) => x.type_mouvement === 'Entrée').length;
  const sorties = bons.filter((x) => x.type_mouvement === 'Sortie').length;
  const transferts = bons.filter((x) => x.type_mouvement === 'Transfert').length;
  const rebuts = bons.filter((x) => x.type_mouvement === 'Rebut').length;

  async function handlePdf(bon) {
    setPdfLoading(true);
    try {
      await generateMouvementPdf(bon, articles);
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleDelete(ref) {
    if (!window.confirm('Supprimer ce bon de mouvement ?')) return;
    const res = await remove(ref);
    if (res.success) {
      setDetailRef(null);
      setView('list');
    }
  }

  async function handleSave(bon) {
    const res = await save(bon);
    if (res.success) {
      setView('list');
      setEditingBon(null);
    }
    return res;
  }

  if (view === 'form') {
    return (
      <BonMouvementForm
        bon={editingBon}
        articles={articles}
        onBack={() => { setView('list'); setEditingBon(null); }}
        onSave={handleSave}
        saving={saving}
      />
    );
  }

  if (detailRef) {
    const bon = bons.find((x) => x.ref === detailRef);
    if (!bon) { setDetailRef(null); return null; }
    return (
      <DetailBon
        bon={bon}
        articles={articles}
        onBack={() => setDetailRef(null)}
        onEdit={() => { setEditingBon(bon); setView('form'); setDetailRef(null); }}
        onPdf={() => handlePdf(bon)}
        onDelete={() => handleDelete(bon.ref)}
        pdfLoading={pdfLoading}
      />
    );
  }

  if (loading && !bons.length) {
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
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowFilters((f) => !f)}>
            <Filter size={14} /> Filtres
          </button>
          <button type="button" className="btn btn-primary" onClick={() => { setEditingBon(null); setView('form'); }}>
            <Plus size={15} /> Nouveau bon
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
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Référence, motif, opérateur..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
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
            sub="Créez votre premier bon de mouvement."
            action="Nouveau bon"
            onAction={() => { setEditingBon(null); setView('form'); }}
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Type</th>
                  <th>Lignes</th>
                  <th>Qté totale</th>
                  <th>Source</th>
                  <th>Destination</th>
                  <th>Date</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((x) => (
                  <tr key={x.ref} style={{ cursor: 'pointer' }} onClick={() => setDetailRef(x.ref)}>
                    <td><span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--red)' }}>{x.ref}</span></td>
                    <td data-label="Type">
                      <span className={`badge ${BADGE_MOUVEMENT[x.type_mouvement] || 'badge-grey'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem' }}>
                        {TYPE_ICONS[x.type_mouvement]} {x.type_mouvement}
                      </span>
                    </td>
                    <td data-label="Lignes" style={{ fontWeight: 700 }}>{x.lignes?.length || 0}</td>
                    <td data-label="Qté" style={{ fontWeight: 700 }}>{x.quantite_totale || 0}</td>
                    <td data-label="Source" style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>{x.emplacement_source || '—'}</td>
                    <td data-label="Destination" style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>{x.emplacement_destination || '—'}</td>
                    <td data-label="Date">{x.date_creation}</td>
                    <td data-label="Statut">
                      <span className={`badge ${BADGE_STATUT_MV[x.statut] || 'badge-grey'}`} style={{ fontSize: '0.72rem' }}>{x.statut}</span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 3 }}>
                        <button type="button" className="btn btn-secondary btn-sm" title="Voir" onClick={() => setDetailRef(x.ref)}><Eye size={13} /></button>
                        <button type="button" className="btn btn-ghost btn-sm" title="PDF" onClick={() => handlePdf(x)} disabled={pdfLoading}><Download size={13} /></button>
                        {!x.applied && (
                          <button type="button" className="btn btn-ghost btn-sm" title="Modifier" onClick={() => { setEditingBon(x); setView('form'); }}><Edit2 size={13} /></button>
                        )}
                        <button type="button" className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => handleDelete(x.ref)} style={{ color: 'var(--red)' }} disabled={saving}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
