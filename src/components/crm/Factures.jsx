import { useState, useRef, useEffect } from 'react';
import {
  Plus, Search, Edit2, Copy, Trash2, FileText,
  CheckCircle, Clock, XCircle, AlertCircle, TrendingUp,
  ChevronLeft, ChevronRight, RefreshCw, ArrowUpDown,
  CreditCard, Send, Ban, DollarSign, X, Download, Eye
} from 'lucide-react';
import { useCrmFactures } from '../../hooks/useCrmFactures';
import { listClients } from '../../services/crm/clients';
import { listCategories } from '../../services/crm/categories';
import { generateFacturePdf } from '../../services/crm/facturePdf';
import FactureForm from './FactureForm';
import FactureAcompte from './FactureAcompte';
import { listImportedCrmArchives, repairImportedArchivesInBackground } from '../../services/crm/crmArchives';
import {
  archiveToFactureRow,
  archiveMatchesFactureFilters,
  openArchivePdf,
  downloadArchivePdf,
  ARCHIVE_IMPORTED_BADGE,
  normalizeArchiveAmounts,
} from './crmArchiveDisplay';

/* ── Helpers ── */
function fmtMAD(v) {
  const n = Number(v);
  if (isNaN(n) || (!v && v !== 0)) return '0 MAD';
  return n.toLocaleString('fr-MA') + ' MAD';
}
function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  catch { return d; }
}
function isOverdue(dateStr, statut) {
  if (!dateStr || statut === 'payee' || statut === 'annulee') return false;
  return new Date(dateStr) < new Date();
}
function isDueSoon(dateStr, statut) {
  if (!dateStr || statut === 'payee' || statut === 'annulee') return false;
  const diff = (new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 7;
}

/* ── Statut config ── */
const STATUT_CFG = {
  brouillon:           { label: 'Brouillon',       cls: 'badge-grey',   icon: FileText },
  envoyee:             { label: 'Envoyee',          cls: 'badge-blue',   icon: Send },
  payee:               { label: 'Payee',            cls: 'badge-green',  icon: CheckCircle },
  partiellement_payee: { label: 'Part. payee',      cls: 'badge-orange', icon: DollarSign },
  impayee:             { label: 'Impayee',          cls: 'badge-red',    icon: XCircle },
  en_retard:           { label: 'En retard',        cls: 'badge-red',    icon: AlertCircle },
  annulee:             { label: 'Annulee',          cls: 'badge-grey',   icon: Ban },
  archive_importee:    { label: 'Archive importee', cls: 'badge-orange', icon: FileText },
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

/* ── Empty State ── */
function EmptyState({ filtered, onAdd }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <FileText size={48} style={{ color: 'var(--border)', marginBottom: 16 }} />
      <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-2)', marginBottom: 8 }}>
        {filtered ? 'Aucune facture correspondante' : 'Aucune facture pour le moment'}
      </h3>
      <p style={{ color: 'var(--text-3)', fontSize: '0.875rem', marginBottom: 20 }}>
        {filtered ? 'Modifiez vos filtres pour voir plus de resultats.' : 'Commencez par creer votre premiere facture.'}
      </p>
      {!filtered && (
        <button className="btn btn-primary" onClick={onAdd} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15} /> Nouvelle facture
        </button>
      )}
    </div>
  );
}

const PER_PAGE = 15;

/* ════════════════════════════════════════════════
   FACTURES LIST — MAIN COMPONENT
   ════════════════════════════════════════════════ */
export default function Factures() {
  const {
    records: factures,
    loading,
    saving,
    error,
    configured,
    load,
    create,
    createAcompte,
    update,
    remove,
    duplicate,
    fetchOne,
    fetchDevisAcompteSummary,
    filterCrmFactures,
    computeCrmFactureStats,
  } = useCrmFactures();

  const [view, setView]               = useState('list');
  const [editingFacture, setEditing]  = useState(null);
  const [pdfLoadingId, setPdfLoadingId] = useState(null);
  const [clientsList, setClientsList] = useState([]);
  const [importedArchives, setImportedArchives] = useState([]);

  /* Filters */
  const [search, setSearch]           = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterCommercial, setFilterCommercial] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterDate, setFilterDate]   = useState('');
  const [filterMontantMin, setFilterMontantMin] = useState('');
  const [sortField, setSortField]     = useState('date_emission');
  const [sortDir, setSortDir]         = useState('desc');
  const [page, setPage]               = useState(1);

  /* Toast */
  const [toast, setToast]             = useState(null);
  const toastTimer                    = useRef(null);
  function showToast(msg, type = 'success') {
    clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => {
    listClients().then(setClientsList).catch(() => {});
  }, []);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    let stopRepair = () => {};

    listImportedCrmArchives('facture', { autoRepair: false })
      .then((rows) => {
        if (!cancelled) setImportedArchives(rows);
        stopRepair = repairImportedArchivesInBackground('facture', (updated) => {
          if (!cancelled) setImportedArchives(updated);
        });
      })
      .catch(() => { if (!cancelled) setImportedArchives([]); });

    return () => {
      cancelled = true;
      stopRepair();
    };
  }, [configured, factures.length]);

  /* Derived */
  const commerciaux = [...new Set(factures.map(f => f.commercial).filter(Boolean))];

  /* Filter + sort */
  const archiveRows = importedArchives
    .filter((a) => archiveMatchesFactureFilters(a, {
      search,
      statut: filterStatut,
      commercial: filterCommercial,
      client_id: filterClient,
      date: filterDate,
      montant_min: filterMontantMin,
    }))
    .map(archiveToFactureRow);

  const filtered = [
    ...filterCrmFactures(factures, {
      search,
      statut: filterStatut,
      commercial: filterCommercial,
      client_id: filterClient,
      date: filterDate,
      montant_min: filterMontantMin,
    }),
    ...(filterStatut && filterStatut !== 'archive_importee' ? [] : archiveRows),
  ].sort((a, b) => {
    let va = a[sortField] ?? '';
    let vb = b[sortField] ?? '';
    const numFields = ['total_ttc', 'total_ht', 'total_paye', 'reste_a_payer'];
    if (numFields.includes(sortField)) { va = Number(va); vb = Number(vb); }
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
  const kpi = computeCrmFactureStats(factures);
  const archiveMontantTotal = importedArchives.reduce(
    (s, a) => s + (normalizeArchiveAmounts(a).total_ttc || 0),
    0,
  );
  const totalFactureCount = factures.length + importedArchives.length;
  const totalFacture   = kpi.totalFacture + archiveMontantTotal;
  const totalEncaisse  = kpi.totalEncaisse;
  const totalReste     = kpi.totalReste;
  const nImpayees      = kpi.nImpayees;
  const nEnRetard      = kpi.nEnRetard;
  const totalAcomptes  = kpi.totalAcomptes;

  /* Handlers */
  function openCreate()   { setEditing(null); setView('form'); }
  function openAcompte()  { setEditing(null); setView('acompte'); }
  async function openEdit(f) {
    try {
      const full = await fetchOne(f.id);
      setEditing(full);
      setView('form');
    } catch (err) {
      showToast(err.message || 'Impossible de charger la facture.', 'error');
    }
  }
  function backToList()   { setView('list');  setEditing(null); }

  async function handleSaved(payload, isEdit) {
    const result = isEdit && payload.id
      ? await update(payload.id, payload)
      : await create(payload);
    if (!result.success) return result;
    showToast(isEdit ? 'Facture mise a jour avec succes.' : 'Facture creee avec succes.');
    backToList();
    return result;
  }

  async function handleDuplicate(f) {
    const result = await duplicate(f.id);
    showToast(result.success ? 'Facture dupliquee avec succes.' : (result.error || 'Erreur duplication.'), result.success ? 'success' : 'error');
  }

  async function handleDelete(id) {
    if (!window.confirm('Supprimer cette facture ? Cette action est irreversible.')) return;
    const result = await remove(id);
    showToast(result.success ? 'Facture supprimee.' : (result.error || 'Erreur suppression.'), result.success ? 'success' : 'error');
  }

  async function handlePdf(f) {
    setPdfLoadingId(f.id);
    try {
      const full = await fetchOne(f.id);
      const cats = await listCategories();
      const catMap = Object.fromEntries(cats.map(c => [String(c.id), c.nom]));
      await generateFacturePdf(full, catMap);
    } catch (err) {
      showToast(err.message || 'Erreur generation PDF.', 'error');
    } finally {
      setPdfLoadingId(null);
    }
  }

  /* ── Sub-views ── */
  if (view === 'form') {
    return <FactureForm facture={editingFacture} onBack={backToList} onSaved={handleSaved} saving={saving} />;
  }
  if (view === 'acompte') {
    return (
      <FactureAcompte
        onBack={backToList}
        onCreated={(ok, msg) => showToast(msg, ok ? 'success' : 'error')}
        createAcompte={createAcompte}
        fetchDevisSummary={fetchDevisAcompteSummary}
        configured={configured}
        saving={saving}
      />
    );
  }

  const hasFilters = !!(search || filterStatut || filterCommercial || filterClient || filterDate || filterMontantMin);

  return (
    <div className="animate-fade-in crm-module crm-module--factures">
      <Toast toast={toast} />

      {/* Page header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Factures</h1>
          <p className="page-subtitle">Gestion des factures, paiements et suivi des reglements.</p>
        </div>
        <div className="crm-page-header-actions" style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} />
          </button>
          <button className="btn btn-ghost" onClick={openAcompte} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={15} /> Facture acompte
          </button>
          <button className="btn btn-primary" onClick={openCreate} disabled={!configured || saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={15} /> Ajouter une facture
          </button>
        </div>
      </div>

      {!configured && (
        <div style={{ background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#E65100' }}>
          Supabase non configuré — ajoutez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env
        </div>
      )}

      {error && !loading && (
        <div style={{ background: '#FFEBEE', color: 'var(--red)', border: '1px solid rgba(211,47,47,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={15} /> {error}
          <button className="btn btn-ghost btn-sm" onClick={load} style={{ marginLeft: 'auto' }}>Reessayer</button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <KpiCard label="Total facture" value={loading ? '—' : fmtMAD(totalFacture)} sub={totalFactureCount + ' facture(s)'} icon={FileText} color="var(--red)" />
        <KpiCard label="Total encaisse" value={loading ? '—' : fmtMAD(totalEncaisse)} sub="paiements recus" icon={CheckCircle} color="#388E3C" />
        <KpiCard label="Reste a payer" value={loading ? '—' : fmtMAD(totalReste)} sub="en attente" icon={DollarSign} color="#1976D2" />
        <KpiCard label="Factures impayees" value={loading ? '—' : nImpayees} sub="a relancer" icon={XCircle} color="#E65100" />
        <KpiCard label="En retard" value={loading ? '—' : nEnRetard} sub="echeance depassee" icon={AlertCircle} color="var(--red)" />
        <KpiCard label="Acomptes recus" value={loading ? '—' : fmtMAD(totalAcomptes)} sub="total acomptes" icon={CreditCard} color="#7B1FA2" />
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
              placeholder="Rechercher numero, titre, client..."
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
          <select className="crm-filter-select crm-filter-select--md" value={filterClient} onChange={e => { setFilterClient(e.target.value); setPage(1); }}>
            <option value="">Tous clients</option>
            {clientsList.map(c => {
              const nom = [c.prenom, c.nom].filter(Boolean).join(' ') || c.nom || '';
              return <option key={c.id} value={c.id}>{nom}</option>;
            })}
          </select>
          <input
            type="date"
            className="crm-filter-select"
            value={filterDate}
            onChange={e => { setFilterDate(e.target.value); setPage(1); }}
            title="Filtrer par date d'emission"
          />
          <input
            type="number"
            min="0"
            className="crm-filter-select crm-filter-select--sm"
            value={filterMontantMin}
            onChange={e => { setFilterMontantMin(e.target.value); setPage(1); }}
            placeholder="Montant min."
          />
          {hasFilters && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterStatut(''); setFilterCommercial(''); setFilterClient(''); setFilterDate(''); setFilterMontantMin(''); setPage(1); }}
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
            <p style={{ color: 'var(--text-3)', marginTop: 12, fontSize: '0.85rem' }}>Chargement des factures...</p>
          </div>
        ) : paged.length === 0 ? (
          <EmptyState filtered={hasFilters} onAdd={openCreate} />
        ) : (
          <>
          <div className="crm-table-desktop">
            <div className="table-wrap">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid var(--border)', background: 'var(--bg)' }}>
                  {[
                    { label: 'N° Facture',     field: 'numero' },
                    { label: 'Titre',           field: 'titre' },
                    { label: 'Devis lie',       field: 'devis_id' },
                    { label: 'Client',          field: 'client_nom' },
                    { label: 'Commercial',      field: 'commercial' },
                    { label: 'Total HT',        field: 'total_ht',        align: 'right' },
                    { label: 'TVA',             field: 'total_tva',       align: 'right' },
                    { label: 'Total TTC',       field: 'total_ttc',       align: 'right' },
                    { label: 'Paye',            field: 'total_paye',      align: 'right' },
                    { label: 'Reste',           field: 'reste_a_payer',   align: 'right' },
                    { label: 'Emission',        field: 'date_emission' },
                    { label: 'Echeance',        field: 'date_echeance' },
                    { label: 'Statut',          field: 'statut' },
                    { label: '',                field: null },
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
                {paged.map((f, i) => {
                  const clientNom = f.client_nom || f.client?.nom || '—';
                  const overdue   = isOverdue(f.date_echeance, f.statut);
                  const dueSoon   = !overdue && isDueSoon(f.date_echeance, f.statut);
                  const restePct  = f.total_ttc > 0 ? Math.round((Number(f.reste_a_payer || 0) / Number(f.total_ttc)) * 100) : 0;
                  return (
                    <tr key={f.id ?? i}
                      style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.12s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}>

                      {/* N° Facture */}
                      <td data-label="N° Facture" style={{ padding: '10px 12px', fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.88rem', color: 'var(--red)', whiteSpace: 'nowrap' }}>
                        {f.numero || '—'}
                      </td>

                      {/* Titre */}
                      <td data-label="Titre" style={{ padding: '10px 12px', maxWidth: 180 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.titre}>
                          {f.titre || '—'}
                        </div>
                      </td>

                      {/* Devis lie */}
                      <td data-label="Devis" style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        {f.devis_reference || f.devis_id ? (
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-3)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px' }}>
                            {f.devis_reference || 'DV-' + String(f.devis_id).slice(0, 8)}
                          </span>
                        ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
                      </td>

                      {/* Client */}
                      <td data-label="Client" style={{ padding: '10px 12px', whiteSpace: 'nowrap', fontWeight: 500 }}>
                        {clientNom}
                      </td>

                      {/* Commercial */}
                      <td data-label="Commercial" style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--text-2)' }}>
                        {f.commercial || '—'}
                      </td>

                      {/* Total HT */}
                      <td data-label="Total HT" style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 500 }}>
                        {fmtMAD(f.total_ht)}
                      </td>

                      {/* TVA */}
                      <td data-label="TVA" style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--text-3)' }}>
                        {fmtMAD(f.total_tva)}
                      </td>

                      {/* Total TTC */}
                      <td data-label="Total TTC" style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '0.92rem', color: 'var(--red)' }}>
                          {fmtMAD(f.total_ttc)}
                        </span>
                      </td>

                      {/* Paye */}
                      <td data-label="Paye" style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 600, color: '#388E3C' }}>
                          {fmtMAD(f.total_paye || 0)}
                        </span>
                      </td>

                      {/* Reste */}
                      <td data-label="Reste" style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {Number(f.reste_a_payer || 0) <= 0 ? (
                          <span style={{ color: '#388E3C', fontWeight: 700, fontSize: '0.82rem' }}>Solde</span>
                        ) : (
                          <div>
                            <span style={{ fontWeight: 700, color: overdue ? 'var(--red)' : 'var(--text)' }}>
                              {fmtMAD(f.reste_a_payer)}
                            </span>
                            <div style={{ marginTop: 2, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', width: 60 }}>
                              <div style={{ height: '100%', width: restePct + '%', background: overdue ? 'var(--red)' : '#1976D2', borderRadius: 2 }} />
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Date emission */}
                      <td data-label="Emission" style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--text-2)', fontSize: '0.82rem' }}>
                        {fmtDate(f.date_emission)}
                      </td>

                      {/* Date echeance */}
                      <td data-label="Echeance" style={{ padding: '10px 12px', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                        <span style={{ color: overdue ? 'var(--red)' : dueSoon ? '#E65100' : 'var(--text-2)', fontWeight: (overdue || dueSoon) ? 700 : 400 }}>
                          {fmtDate(f.date_echeance)}
                          {overdue && <span style={{ display: 'block', fontSize: '0.7rem' }}>En retard</span>}
                          {dueSoon && !overdue && <span style={{ display: 'block', fontSize: '0.7rem' }}>Bientot</span>}
                        </span>
                      </td>

                      {/* Statut */}
                      <td data-label="Statut" style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <StatutBadge statut={f.statut} />
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '10px 10px', whiteSpace: 'nowrap' }}>
                        {f.__isImportedArchive ? (
                          <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                            <button title="Voir PDF archive" onClick={() => openArchivePdf(f.__archive).catch((e) => showToast(e.message, 'error'))}
                              className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }}>
                              <Eye size={13} />
                            </button>
                            <button title="Telecharger PDF" onClick={() => downloadArchivePdf(f.__archive).catch((e) => showToast(e.message, 'error'))}
                              className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }}>
                              <Download size={13} />
                            </button>
                          </div>
                        ) : (
                        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                          <button title="PDF" onClick={() => handlePdf(f)} disabled={pdfLoadingId === f.id}
                            className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }}>
                            <Download size={13} />
                          </button>
                          <button title="Modifier" onClick={() => openEdit(f)}
                            className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }}>
                            <Edit2 size={13} />
                          </button>
                          <button title="Dupliquer" onClick={() => handleDuplicate(f)}
                            className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }}>
                            <Copy size={13} />
                          </button>
                          <button title="Supprimer" onClick={() => handleDelete(f.id)}
                            className="btn btn-ghost btn-sm" style={{ padding: '4px 7px', color: 'var(--red)' }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              </table>
            </div>
          </div>

          <div className="crm-doc-list crm-mobile-only">
            {paged.map((f, i) => {
              const clientNom = f.client_nom || f.client?.nom || '—';
              const overdue = isOverdue(f.date_echeance, f.statut);
              const dueSoon = !overdue && isDueSoon(f.date_echeance, f.statut);
              return (
                <div key={f.id ?? i} className="crm-doc-card">
                  <div className="crm-doc-head">
                    <span className="crm-doc-ref">{f.numero || '—'}</span>
                    <StatutBadge statut={f.statut} />
                  </div>
                  <div className="crm-doc-title">{f.titre || clientNom}</div>
                  <div className="crm-doc-meta">
                    <span>{clientNom}</span>
                    {f.commercial && <span>· {f.commercial}</span>}
                    <span>· {fmtDate(f.date_emission)}</span>
                    {overdue && <span style={{ color: 'var(--red)', fontWeight: 700 }}>· En retard</span>}
                    {dueSoon && <span style={{ color: '#E65100', fontWeight: 700 }}>· Echeance proche</span>}
                  </div>
                  <div className="crm-doc-footer">
                    <div>
                      <span className="crm-doc-amount">{fmtMAD(f.total_ttc)}</span>
                      <span className="crm-doc-amount-sub">
                        Reste {Number(f.reste_a_payer || 0) <= 0 ? 'soldé' : fmtMAD(f.reste_a_payer)}
                      </span>
                    </div>
                    <div className="crm-doc-actions">
                      {f.__isImportedArchive ? (
                        <>
                          <button type="button" title="Voir PDF" onClick={() => openArchivePdf(f.__archive).catch((e) => showToast(e.message, 'error'))}
                            className="btn btn-ghost btn-sm crm-icon-btn"><Eye size={14} /></button>
                          <button type="button" title="Telecharger" onClick={() => downloadArchivePdf(f.__archive).catch((e) => showToast(e.message, 'error'))}
                            className="btn btn-ghost btn-sm crm-icon-btn"><Download size={14} /></button>
                        </>
                      ) : (
                        <>
                      <button type="button" title="PDF" onClick={() => handlePdf(f)} disabled={pdfLoadingId === f.id}
                        className="btn btn-ghost btn-sm crm-icon-btn"><Download size={14} /></button>
                      <button type="button" title="Modifier" onClick={() => openEdit(f)}
                        className="btn btn-ghost btn-sm crm-icon-btn"><Edit2 size={14} /></button>
                      <button type="button" title="Dupliquer" onClick={() => handleDuplicate(f)}
                        className="btn btn-ghost btn-sm crm-icon-btn"><Copy size={14} /></button>
                      <button type="button" title="Supprimer" onClick={() => handleDelete(f.id)}
                        className="btn btn-ghost btn-sm crm-icon-btn"><Trash2 size={14} style={{ color: 'var(--red)' }} /></button>
                        </>
                      )}
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
              Page {safePage} / {totalPages} — {filtered.length} factures
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
