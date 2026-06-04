import { useState, useRef } from 'react';
import {
  Plus, Search, Edit2, Copy, Trash2, Package,
  CheckCircle, Clock, XCircle, AlertCircle,
  ChevronLeft, ChevronRight, RefreshCw, ArrowUpDown,
  FileText, Ban, TruckIcon, History, X, Eye, Download
} from 'lucide-react';
import { useDeliveryNotes } from '../../hooks/useDeliveryNotes';
import { generateDeliveryNotePdf } from '../../services/crm/deliveryNotePdf';
import BonLivraisonForm from './BonLivraisonForm';

/* ── Helpers ── */
function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  catch { return d; }
}
function isOverdue(dateStr, statut) {
  if (!dateStr || statut === 'livre' || statut === 'annule' || statut === 'facture') return false;
  return new Date(dateStr) < new Date();
}
function isDueSoon(dateStr, statut) {
  if (!dateStr || statut === 'livre' || statut === 'annule' || statut === 'facture') return false;
  const diff = (new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 3;
}
/* ── Statut config ── */
const STATUT_CFG = {
  brouillon:           { label: 'Brouillon',       cls: 'badge-grey',   icon: FileText },
  preparation:         { label: 'Preparation',      cls: 'badge-blue',   icon: Package },
  en_attente:          { label: 'En attente',       cls: 'badge-orange', icon: Clock },
  livre:               { label: 'Livre',            cls: 'badge-green',  icon: CheckCircle },
  partiellement_livre: { label: 'Part. livre',      cls: 'badge-orange', icon: AlertCircle },
  facture:             { label: 'Facture',          cls: 'badge-green',  icon: FileText },
  annule:              { label: 'Annule',           cls: 'badge-grey',   icon: Ban },
};
function StatutBadge({ statut }) {
  const cfg = STATUT_CFG[statut] || { label: statut, cls: 'badge-grey' };
  return <span className={'badge ' + cfg.cls}>{cfg.label}</span>;
}

/* ── Toast ── */
function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
      background: toast.type === 'error' ? '#D32F2F' : '#1B5E20',
      color: '#fff', borderRadius: 10, padding: '13px 20px',
      fontSize: '0.875rem', fontWeight: 600, boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
      display: 'flex', alignItems: 'center', gap: 10, maxWidth: 380,
      animation: 'fadeIn 0.2s ease',
    }}>
      {toast.type === 'error' ? <XCircle size={16} /> : <CheckCircle size={16} />}
      {toast.msg}
    </div>
  );
}

/* ── KPI Card ── */
function KpiCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: color + '15', color }}>
        <Icon size={20} />
      </div>
      <div className="stat-body">
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

/* ── Tab ── */
function Tab({ label, active, onClick, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 16px', border: 'none', cursor: 'pointer',
        background: 'none', fontFamily: 'var(--font-body)',
        fontSize: '0.875rem', fontWeight: active ? 700 : 500,
        color: active ? 'var(--red)' : 'var(--text-2)',
        borderBottom: active ? '2px solid var(--red)' : '2px solid transparent',
        transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 6,
      }}
    >
      {label}
      {count !== undefined && (
        <span style={{
          fontSize: '0.7rem', fontWeight: 700, minWidth: 18, height: 18,
          borderRadius: 9, background: active ? 'var(--red)' : 'var(--border)',
          color: active ? '#fff' : 'var(--text-3)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

/* ── Empty State ── */
function EmptyState({ filtered, onAdd }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <Package size={48} style={{ color: 'var(--border)', marginBottom: 16 }} />
      <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-2)', marginBottom: 8 }}>
        {filtered ? 'Aucun bon correspondant' : 'Aucun bon de livraison'}
      </h3>
      <p style={{ color: 'var(--text-3)', fontSize: '0.875rem', marginBottom: 20 }}>
        {filtered ? 'Modifiez vos filtres pour voir plus de resultats.' : 'Creez votre premier bon de livraison.'}
      </p>
      {!filtered && (
        <button className="btn btn-primary" onClick={onAdd} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15} /> Nouveau bon de livraison
        </button>
      )}
    </div>
  );
}

const PER_PAGE = 15;

function BonLivraisonDetail({ bl, onBack, onEdit, onPdf, pdfLoading }) {
  const clientNom = bl.client_nom || bl.client?.nom || '—';
  const lignes = bl.lignes || [];
  return (
    <div className="animate-fade-in crm-module crm-module--bl">
      <button type="button" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', fontSize: '0.875rem', fontWeight: 600, marginBottom: 16, padding: 0 }}>
        <ChevronLeft size={16} /> Retour aux bons de livraison
      </button>
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">{bl.numero || 'Bon de livraison'}</h1>
          <p className="page-subtitle">{clientNom} — {fmtDate(bl.date_livraison)}</p>
        </div>
        <div className="crm-page-header-actions" style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={() => onPdf(bl)} disabled={pdfLoading} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} /> {pdfLoading ? 'PDF...' : 'PDF'}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onEdit(bl)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Edit2 size={14} /> Modifier
          </button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 12 }}>Informations</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.85rem' }}>
            {[['Statut', <StatutBadge key="s" statut={bl.statut} />], ['Client', clientNom], ['Adresse', bl.adresse_livraison || '—'], ['Commercial', bl.commercial || '—'], ['Préparé par', bl.prepare_par || '—'], ['Projet', bl.projet || '—'], ['Devis', bl.devis_reference || '—'], ['Facture', bl.facture_reference || '—']].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>{k}</span>
                <span style={{ fontWeight: 500, textAlign: 'right' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 12 }}>Livraison</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.85rem' }}>
            {[['Date livraison', fmtDate(bl.date_livraison)], ['Échéance', fmtDate(bl.date_echeance)], ['Avancement', `${bl.pct_livre || 0}%`], ['Contact', bl.contact_reception || '—'], ['Tél', bl.tel_reception || '—'], ['Signature', bl.signature_client || '—']].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>{k}</span>
                <span style={{ fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>
          {bl.remarques && (
            <div style={{ marginTop: 12, fontSize: '0.82rem', color: 'var(--text-2)' }}>
              <strong>Observations :</strong> {bl.remarques}
            </div>
          )}
        </div>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid var(--border)', background: 'var(--bg)' }}>
                {['Désignation', 'Unité', 'Qté cmd.', 'Qté livrée', 'Remarque'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-3)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.length ? lignes.map((l, i) => (
                <tr key={l.id || i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px' }}>{l.designation || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>{l.unite || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>{l.quantite_commandee}</td>
                  <td style={{ padding: '10px 12px' }}>{l.quantite_livree}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-3)' }}>{l.observation || l.remarque || '—'}</td>
                </tr>
              )) : (
                <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>Aucune ligne</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const TABS = [
  { id: 'all',         label: 'Tous les bons' },
  { id: 'en_attente',  label: 'En attente' },
  { id: 'livre',       label: 'Livres' },
  { id: 'historique',  label: 'Historique' },
];

/* ════════════════════════════════════════════════
   BON LIVRAISON LIST — MAIN
   ════════════════════════════════════════════════ */
export default function BonLivraison() {
  const {
    records: bls,
    loading,
    saving,
    error: loadError,
    configured,
    load,
    create,
    update,
    remove,
    duplicate,
    fetchOne,
    filterDeliveryNotes,
    computeDeliveryNoteStats,
  } = useDeliveryNotes();

  const [view, setView]           = useState('list');
  const [editingBL, setEditingBL] = useState(null);
  const [viewingBL, setViewingBL] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [pdfLoadingId, setPdfLoadingId] = useState(null);

  /* Filters */
  const [search, setSearch]               = useState('');
  const [filterStatut, setFilterStatut]   = useState('');
  const [filterCommercial, setFilterCommercial] = useState('');
  const [filterClient, setFilterClient]   = useState('');
  const [filterDate, setFilterDate]       = useState('');
  const [sortField, setSortField]         = useState('date_livraison');
  const [sortDir, setSortDir]             = useState('desc');
  const [page, setPage]                   = useState(1);

  /* Toast */
  const [toast, setToast]   = useState(null);
  const toastTimer          = useRef(null);
  function showToast(msg, type = 'success') {
    clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  /* Derived */
  const commerciaux = [...new Set(bls.map(b => b.commercial).filter(Boolean))];
  const clientOptions = [...new Map(
    bls.filter(b => b.client_id).map(b => [String(b.client_id), b.client_nom || b.client?.nom || 'Client'])
  ).entries()];

  /* Tab filter */
  function applyTabFilter(list) {
    if (activeTab === 'all')        return list;
    if (activeTab === 'en_attente') return list.filter(b => b.statut === 'en_attente' || b.statut === 'preparation' || b.statut === 'brouillon');
    if (activeTab === 'livre')      return list.filter(b => b.statut === 'livre' || b.statut === 'facture');
    if (activeTab === 'historique') return list.filter(b => b.statut === 'livre' || b.statut === 'facture' || b.statut === 'annule');
    return list;
  }

  /* Filter + sort */
  const baseFiltered = filterDeliveryNotes(bls, {
    search,
    statut: filterStatut,
    commercial: filterCommercial,
    client_id: filterClient,
    date: filterDate,
  });

  const filtered = applyTabFilter(baseFiltered).sort((a, b) => {
    let va = a[sortField] ?? '';
    let vb = b[sortField] ?? '';
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage   = Math.min(page, totalPages);
  const paged      = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  function toggleSort(field) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
    setPage(1);
  }

  /* KPIs */
  const kpi = computeDeliveryNoteStats(bls);
  const nTotal = kpi.total;
  const nEnAttente = kpi.enAttente;
  const nLivres = kpi.livres;
  const nLiesDevis = kpi.liesDevis;
  const nFactures = kpi.factures;
  const nEnRetard = kpi.enRetard;

  /* Tab counts */
  const tabCounts = {
    all:        baseFiltered.length,
    en_attente: baseFiltered.filter(b => b.statut === 'en_attente' || b.statut === 'preparation' || b.statut === 'brouillon').length,
    livre:      baseFiltered.filter(b => b.statut === 'livre' || b.statut === 'facture').length,
    historique: baseFiltered.filter(b => b.statut === 'livre' || b.statut === 'facture' || b.statut === 'annule').length,
  };

  /* Handlers */
  function openCreate()  { setEditingBL(null); setViewingBL(null); setView('form'); }
  async function openEdit(b) {
    try {
      const full = await fetchOne(b.id);
      setEditingBL(full);
      setViewingBL(null);
      setView('form');
    } catch (err) {
      showToast(err.message || 'Impossible de charger le bon.', 'error');
    }
  }
  async function openDetail(b) {
    try {
      const full = await fetchOne(b.id);
      setViewingBL(full);
      setView('detail');
    } catch (err) {
      showToast(err.message || 'Impossible de charger le bon.', 'error');
    }
  }
  function backToList()  { setView('list'); setEditingBL(null); setViewingBL(null); }

  async function handleSaved(payload, isEdit) {
    const result = isEdit && payload.id
      ? await update(payload.id, payload)
      : await create(payload);
    if (!result.success) {
      showToast(result.error || 'Erreur enregistrement.', 'error');
      return result;
    }
    showToast(isEdit ? 'Bon de livraison mis a jour.' : 'Bon de livraison cree avec succes.');
    backToList();
    return result;
  }

  async function handleMarquerLivre(b) {
    const full = await fetchOne(b.id).catch(() => b);
    const updated = {
      ...full,
      statut: 'livre',
      date_validation: new Date().toISOString().slice(0, 10),
    };
    const result = await update(b.id, updated);
    showToast(result.success ? 'Bon marque comme livre.' : (result.error || 'Erreur.'), result.success ? 'success' : 'error');
  }

  async function handleDuplicate(b) {
    const result = await duplicate(b.id);
    showToast(result.success ? 'Bon de livraison duplique.' : (result.error || 'Erreur duplication.'), result.success ? 'success' : 'error');
  }

  async function handleDelete(id) {
    if (!window.confirm('Supprimer ce bon de livraison ? Cette action est irreversible.')) return;
    const result = await remove(id);
    showToast(result.success ? 'Bon de livraison supprime.' : (result.error || 'Erreur suppression.'), result.success ? 'success' : 'error');
  }

  async function handlePdf(b) {
    setPdfLoadingId(b.id);
    try {
      const full = await fetchOne(b.id);
      await generateDeliveryNotePdf(full);
    } catch (err) {
      showToast(err.message || 'Erreur generation PDF.', 'error');
    } finally {
      setPdfLoadingId(null);
    }
  }

  /* ── Sub-views ── */
  if (view === 'form') {
    return <BonLivraisonForm bl={editingBL} onBack={backToList} onSaved={handleSaved} saving={saving} configured={configured} />;
  }
  if (view === 'detail' && viewingBL) {
    return (
      <BonLivraisonDetail
        bl={viewingBL}
        onBack={backToList}
        onEdit={openEdit}
        onPdf={handlePdf}
        pdfLoading={pdfLoadingId === viewingBL.id}
      />
    );
  }

  const hasFilters = !!(search || filterStatut || filterCommercial || filterClient || filterDate);

  return (
    <div className="animate-fade-in crm-module crm-module--bl">
      <Toast toast={toast} />

      {/* Page header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Bons de livraison</h1>
          <p className="page-subtitle">Gestion des livraisons clients et suivi des commandes.</p>
        </div>
        <div className="crm-page-header-actions" style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} />
          </button>
          <button className="btn btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <History size={14} /> Historique
          </button>
          <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={15} /> Nouveau bon de livraison
          </button>
        </div>
      </div>

      {!configured && (
        <div style={{ background: '#FFF8E1', color: '#E65100', border: '1px solid rgba(230,81,0,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', marginBottom: 16 }}>
          Supabase non configuré — configurez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env
        </div>
      )}
      {loadError && (
        <div style={{ background: '#FFEBEE', color: 'var(--red)', border: '1px solid rgba(211,47,47,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={15} /> {loadError}
          <button className="btn btn-ghost btn-sm" onClick={load} style={{ marginLeft: 'auto' }}>Reessayer</button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <KpiCard label="Bons crees"         value={loading ? '—' : nTotal}     sub="total"            icon={Package}       color="var(--red)" />
        <KpiCard label="En attente"          value={loading ? '—' : nEnAttente} sub="a preparer"       icon={Clock}         color="#1976D2" />
        <KpiCard label="Livres"              value={loading ? '—' : nLivres}    sub="confirmes"        icon={CheckCircle}   color="#388E3C" />
        <KpiCard label="Lies a un devis"     value={loading ? '—' : nLiesDevis} sub="devis source"     icon={FileText}      color="#7B1FA2" />
        <KpiCard label="Factures"            value={loading ? '—' : nFactures}  sub="factures generes" icon={TruckIcon}     color="#E65100" />
        <KpiCard label="En retard"           value={loading ? '—' : nEnRetard}  sub="echeance depassee" icon={AlertCircle}  color="var(--red)" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1.5px solid var(--border)', marginBottom: 16 }}>
        {TABS.map(t => (
          <Tab key={t.id} label={t.label} active={activeTab === t.id} onClick={() => { setActiveTab(t.id); setPage(1); }} count={tabCounts[t.id]} />
        ))}
      </div>

      {/* Filter bar */}
      <div className="card crm-filter-bar" style={{ marginBottom: 16 }}>
        <div className="crm-filter-row">
          <div className="crm-filter-search">
            <Search size={14} className="crm-filter-search-icon" />
            <input
              className="crm-filter-input"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Rechercher numero, client, projet..."
            />
          </div>
          <select className="crm-filter-select crm-filter-select--sm" value={filterStatut} onChange={e => { setFilterStatut(e.target.value); setPage(1); }}>
            <option value="">Tous statuts</option>
            {Object.entries(STATUT_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="crm-filter-select" value={filterCommercial} onChange={e => { setFilterCommercial(e.target.value); setPage(1); }}>
            <option value="">Tous commerciaux</option>
            {commerciaux.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="crm-filter-select" value={filterClient} onChange={e => { setFilterClient(e.target.value); setPage(1); }}>
            <option value="">Tous clients</option>
            {clientOptions.map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
          </select>
          <input type="date" className="crm-filter-select crm-filter-select--sm" value={filterDate} onChange={e => { setFilterDate(e.target.value); setPage(1); }} title="Date livraison" />
          {hasFilters && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterStatut(''); setFilterCommercial(''); setFilterClient(''); setFilterDate(''); setPage(1); }}
              style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--red)' }}>
              <X size={13} /> Effacer
            </button>
          )}
          <span className="crm-filter-count">
            {filtered.length} resultat{filtered.length > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '50px 20px' }}>
            <div style={{ display: 'inline-block', width: 28, height: 28, border: '3px solid var(--border)', borderTopColor: 'var(--red)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ color: 'var(--text-3)', marginTop: 12, fontSize: '0.85rem' }}>Chargement des bons de livraison...</p>
          </div>
        ) : paged.length === 0 ? (
          <EmptyState filtered={hasFilters} onAdd={openCreate} />
        ) : (
          <>
          <div className="crm-table-desktop crm-table-scroll">
            <div className="table-wrap">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid var(--border)', background: 'var(--bg)' }}>
                  {[
                    { label: 'N° BL',           field: 'numero' },
                    { label: 'Ref. devis',       field: 'devis_id' },
                    { label: 'Client',           field: 'client_nom' },
                    { label: 'Projet',           field: 'projet' },
                    { label: 'Date livraison',   field: 'date_livraison' },
                    { label: 'Adresse',          field: 'adresse_livraison' },
                    { label: 'Commercial',       field: 'commercial' },
                    { label: 'Avancement',       field: 'pct_livre',     align: 'center' },
                    { label: 'Statut',           field: 'statut' },
                    { label: 'Facturation',      field: 'est_facture' },
                    { label: 'Signature',        field: 'signature_client' },
                    { label: '',                 field: null },
                  ].map(col => (
                    <th key={col.label} onClick={col.field ? () => toggleSort(col.field) : undefined}
                      style={{ padding: '10px 12px', textAlign: col.align || 'left', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-3)', letterSpacing: '0.06em', whiteSpace: 'nowrap', cursor: col.field ? 'pointer' : 'default', userSelect: 'none' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {col.label}
                        {col.field && <ArrowUpDown size={11} style={{ opacity: sortField === col.field ? 1 : 0.35 }} />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((b, i) => {
                  const clientNom = b.client_nom || b.client?.nom || '—';
                  const overdue   = isOverdue(b.date_echeance, b.statut);
                  const dueSoon   = !overdue && isDueSoon(b.date_echeance, b.statut);
                  const pct       = Number(b.pct_livre || 0);
                  return (
                    <tr key={b.id ?? i}
                      style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.12s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}>

                      {/* N° BL */}
                      <td data-label="N° BL" style={{ padding: '10px 12px', fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.88rem', color: 'var(--red)', whiteSpace: 'nowrap' }}>
                        {b.numero || '—'}
                      </td>

                      {/* Devis */}
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        {b.devis_reference || b.devis_id ? (
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-3)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px' }}>
                            {b.devis_reference || 'DV-' + String(b.devis_id).slice(0, 8)}
                          </span>
                        ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
                      </td>

                      {/* Client */}
                      <td data-label="Client" style={{ padding: '10px 12px', fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {clientNom}
                      </td>

                      {/* Projet */}
                      <td data-label="Projet" style={{ padding: '10px 12px', color: 'var(--text-2)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {b.projet || '—'}
                      </td>

                      {/* Date livraison */}
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                        <span style={{ color: overdue ? 'var(--red)' : dueSoon ? '#E65100' : 'var(--text-2)', fontWeight: (overdue || dueSoon) ? 700 : 400 }}>
                          {fmtDate(b.date_livraison)}
                          {overdue  && <span style={{ display: 'block', fontSize: '0.7rem' }}>En retard</span>}
                          {dueSoon && !overdue && <span style={{ display: 'block', fontSize: '0.7rem' }}>Bientot</span>}
                        </span>
                      </td>

                      {/* Adresse */}
                      <td style={{ padding: '10px 12px', color: 'var(--text-3)', fontSize: '0.78rem', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {b.adresse_livraison || '—'}
                      </td>

                      {/* Commercial */}
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--text-2)' }}>
                        {b.commercial || '—'}
                      </td>

                      {/* Avancement */}
                      <td style={{ padding: '10px 12px', textAlign: 'center', width: 90 }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: pct >= 100 ? '#388E3C' : 'var(--text-2)', marginBottom: 3 }}>
                          {pct}%
                        </div>
                        <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', width: 60, margin: '0 auto' }}>
                          <div style={{ height: '100%', width: pct + '%', background: pct >= 100 ? '#388E3C' : 'var(--red)', borderRadius: 2 }} />
                        </div>
                      </td>

                      {/* Statut */}
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <StatutBadge statut={b.statut} />
                      </td>

                      {/* Facturation */}
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        {b.est_facture || b.statut === 'facture' ? (
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#388E3C', display: 'flex', alignItems: 'center', gap: 3 }}>
                            <CheckCircle size={12} /> Facture
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>Non facture</span>
                        )}
                      </td>

                      {/* Signature */}
                      <td style={{ padding: '10px 12px', color: 'var(--text-3)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                        {b.signature_client ? (
                          <span style={{ color: '#388E3C', display: 'flex', alignItems: 'center', gap: 3 }}>
                            <CheckCircle size={12} /> {b.signature_client}
                          </span>
                        ) : '—'}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '10px 10px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                          <button title="Voir" onClick={() => openDetail(b)}
                            className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }}>
                            <Eye size={13} />
                          </button>
                          <button title="PDF" onClick={() => handlePdf(b)} disabled={pdfLoadingId === b.id}
                            className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }}>
                            <Download size={13} />
                          </button>
                          <button title="Modifier" onClick={() => openEdit(b)}
                            className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }}>
                            <Edit2 size={13} />
                          </button>
                          {b.statut !== 'livre' && b.statut !== 'facture' && b.statut !== 'annule' && (
                            <button title="Marquer livre" onClick={() => handleMarquerLivre(b)}
                              className="btn btn-ghost btn-sm" style={{ padding: '4px 7px', color: '#388E3C' }}>
                              <CheckCircle size={13} />
                            </button>
                          )}
                          <button title="Dupliquer" onClick={() => handleDuplicate(b)}
                            className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }}>
                            <Copy size={13} />
                          </button>
                          <button title="Supprimer" onClick={() => handleDelete(b.id)}
                            className="btn btn-ghost btn-sm" style={{ padding: '4px 7px', color: 'var(--red)' }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              </table>
            </div>
          </div>

          <div className="crm-doc-list crm-mobile-only">
            {paged.map((b, i) => {
              const clientNom = b.client_nom || b.client?.nom || '—';
              const overdue = isOverdue(b.date_echeance, b.statut);
              const dueSoon = !overdue && isDueSoon(b.date_echeance, b.statut);
              const pct = Number(b.pct_livre || 0);
              return (
                <div key={b.id ?? i} className="crm-doc-card">
                  <div className="crm-doc-head">
                    <span className="crm-doc-ref">{b.numero || '—'}</span>
                    <StatutBadge statut={b.statut} />
                  </div>
                  <div className="crm-doc-title">{clientNom}{b.projet ? ` — ${b.projet}` : ''}</div>
                  <div className="crm-doc-meta">
                    <span>Livraison {fmtDate(b.date_livraison)}</span>
                    {b.commercial && <span>· {b.commercial}</span>}
                    <span>· Avancement {pct}%</span>
                    {overdue && <span style={{ color: 'var(--red)', fontWeight: 700 }}>· Retard</span>}
                    {dueSoon && <span style={{ color: '#E65100', fontWeight: 700 }}>· Bientot</span>}
                  </div>
                  <div className="crm-doc-footer">
                    <div>
                      <span className="crm-doc-amount" style={{ fontSize: '0.88rem', color: 'var(--text)' }}>
                        {b.est_facture || b.statut === 'facture' ? 'Facturé' : 'Non facturé'}
                      </span>
                      <span className="crm-doc-amount-sub">{b.adresse_livraison || '—'}</span>
                    </div>
                    <div className="crm-doc-actions">
                      <button type="button" title="Voir" onClick={() => openDetail(b)}
                        className="btn btn-ghost btn-sm crm-icon-btn"><Eye size={14} /></button>
                      <button type="button" title="PDF" onClick={() => handlePdf(b)} disabled={pdfLoadingId === b.id}
                        className="btn btn-ghost btn-sm crm-icon-btn"><Download size={14} /></button>
                      <button type="button" title="Modifier" onClick={() => openEdit(b)}
                        className="btn btn-ghost btn-sm crm-icon-btn"><Edit2 size={14} /></button>
                      {b.statut !== 'livre' && b.statut !== 'facture' && b.statut !== 'annule' && (
                        <button type="button" title="Marquer livre" onClick={() => handleMarquerLivre(b)}
                          className="btn btn-ghost btn-sm crm-icon-btn" style={{ color: '#388E3C' }}><CheckCircle size={14} /></button>
                      )}
                      <button type="button" title="Dupliquer" onClick={() => handleDuplicate(b)}
                        className="btn btn-ghost btn-sm crm-icon-btn"><Copy size={14} /></button>
                      <button type="button" title="Supprimer" onClick={() => handleDelete(b.id)}
                        className="btn btn-ghost btn-sm crm-icon-btn"><Trash2 size={14} style={{ color: 'var(--red)' }} /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          </>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-3)' }}>
              Page {safePage} / {totalPages} — {filtered.length} bons
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1}
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <ChevronLeft size={14} /> Precedent
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(safePage - 2, totalPages - 4));
                const pg = start + i;
                return (
                  <button key={pg} onClick={() => setPage(pg)}
                    style={{
                      minWidth: 32, padding: '4px 8px',
                      background: pg === safePage ? 'var(--red)' : 'transparent',
                      color: pg === safePage ? '#fff' : 'var(--text-2)',
                      border: '1.5px solid ' + (pg === safePage ? 'var(--red)' : 'var(--border)'),
                      borderRadius: 6, cursor: 'pointer', fontWeight: pg === safePage ? 700 : 400,
                      fontSize: '0.82rem',
                    }}>
                    {pg}
                  </button>
                );
              })}
              <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                Suivant <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
