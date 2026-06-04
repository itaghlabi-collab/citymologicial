import { useState, useRef } from 'react';
import {
  Plus, Search, Filter, Eye, Edit2, Copy, Trash2,
  FileText, Send, CheckCircle, TrendingUp, Clock,
  XCircle, AlertCircle, ChevronLeft, ChevronRight,
  RefreshCw, ArrowUpDown, MoreHorizontal, Download
} from 'lucide-react';
import { useCrmDevis } from '../../hooks/useCrmDevis';
import { listCategories } from '../../services/crm/categories';
import { generateDevisPdf } from '../../services/crm/devisPdf';
import DevisForm from './DevisForm';

/* ── Helpers ── */
function fmtMAD(v) {
  const n = Number(v);
  if (isNaN(n) || !v) return '0 MAD';
  return n.toLocaleString('fr-MA') + ' MAD';
}
function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return d; }
}
function isExpiringSoon(dateStr) {
  if (!dateStr) return false;
  const diff = (new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 7;
}

/* ── Status config ── */
const STATUT_CONFIG = {
  brouillon:  { label: 'Brouillon',   cls: 'badge-grey',   icon: FileText },
  envoye:     { label: 'Envoye',      cls: 'badge-blue',   icon: Send },
  valide:     { label: 'Valide',      cls: 'badge-green',  icon: CheckCircle },
  refuse:     { label: 'Refuse',      cls: 'badge-red',    icon: XCircle },
  expire:     { label: 'Expire',      cls: 'badge-orange', icon: AlertCircle },
  en_attente: { label: 'En attente',  cls: 'badge-orange', icon: Clock },
};

function StatutBadge({ statut }) {
  const cfg = STATUT_CONFIG[statut] || { label: statut, cls: 'badge-grey' };
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
        {filtered ? 'Aucun devis correspondant' : 'Aucun devis pour le moment'}
      </h3>
      <p style={{ color: 'var(--text-3)', fontSize: '0.875rem', marginBottom: 20 }}>
        {filtered ? 'Modifiez vos filtres pour voir plus de resultats.' : 'Commencez par creer votre premier devis.'}
      </p>
      {!filtered && (
        <button className="btn btn-primary" onClick={onAdd} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15} /> Nouveau devis
        </button>
      )}
    </div>
  );
}

const PER_PAGE = 15;

/* ════════════════════════════════════════════════
   DEVIS LIST — MAIN COMPONENT
   ════════════════════════════════════════════════ */
export default function Devis() {
  const {
    records: devis,
    loading,
    saving,
    error,
    configured,
    load,
    create,
    update,
    remove,
    duplicate,
    fetchOne,
    filterCrmDevis,
    computeCrmDevisStats,
  } = useCrmDevis();

  const [view, setView] = useState('list');
  const [editingDevis, setEditingDevis] = useState(null);
  const [pdfLoadingId, setPdfLoadingId] = useState(null);

  /* Filters */
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterCommercial, setFilterCommercial] = useState('');
  const [sortField, setSortField] = useState('date_creation');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);

  /* Toast */
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  function showToast(msg, type = 'success') {
    clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  /* Load handled by hook */

  /* Derived lists */
  const commerciaux = [...new Set(devis.map(d => d.commercial).filter(Boolean))];

  /* Filter + sort */
  const filtered = filterCrmDevis(devis, { search, statut: filterStatut, commercial: filterCommercial }).sort((a, b) => {
    let va = a[sortField] ?? '';
    let vb = b[sortField] ?? '';
    if (sortField === 'total_ttc' || sortField === 'total_ht') { va = Number(va); vb = Number(vb); }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  function toggleSort(field) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
    setPage(1);
  }

  /* KPIs */
  const kpi = computeCrmDevisStats(devis);
  const totalMontant   = kpi.montantTotal;
  const nValides       = kpi.valides;
  const nEnAttente     = kpi.enAttente;
  const nRefuses       = kpi.refuses;
  const montantValides = kpi.montantValides;
  const montantAttente = kpi.montantAttente;

  /* Handlers */
  function openCreate() { setEditingDevis(null); setView('form'); }
  async function openEdit(d) {
    try {
      const full = await fetchOne(d.id);
      setEditingDevis(full);
      setView('form');
    } catch (err) {
      showToast(err.message || 'Impossible de charger le devis.', 'error');
    }
  }
  function backToList()  { setView('list'); setEditingDevis(null); }

  async function handleSaved(payload, isEdit) {
    const result = isEdit && payload.id
      ? await update(payload.id, payload)
      : await create(payload);
    if (!result.success) return result;
    showToast(isEdit ? 'Devis mis a jour avec succes.' : 'Devis cree avec succes.');
    backToList();
    return result;
  }

  async function handleDuplicate(d) {
    const result = await duplicate(d.id);
    showToast(result.success ? 'Devis duplique avec succes.' : (result.error || 'Erreur duplication.'), result.success ? 'success' : 'error');
  }

  async function handleDelete(id) {
    if (!window.confirm('Supprimer ce devis ? Cette action est irreversible.')) return;
    const result = await remove(id);
    showToast(result.success ? 'Devis supprime.' : (result.error || 'Erreur suppression.'), result.success ? 'success' : 'error');
  }

  async function handlePdf(d) {
    setPdfLoadingId(d.id);
    try {
      const full = await fetchOne(d.id);
      const cats = await listCategories();
      const catMap = Object.fromEntries(cats.map(c => [String(c.id), c.nom]));
      await generateDevisPdf(full, catMap);
    } catch (err) {
      showToast(err.message || 'Erreur generation PDF.', 'error');
    } finally {
      setPdfLoadingId(null);
    }
  }

  /* ── Form view ── */
  if (view === 'form') {
    return (
      <DevisForm
        devis={editingDevis}
        onBack={backToList}
        onSaved={handleSaved}
        saving={saving}
      />
    );
  }

  /* ── List view ── */
  const hasFilters = !!(search || filterStatut || filterCommercial);

  return (
    <div className="animate-fade-in crm-module crm-module--devis">
      <Toast toast={toast} />

      {/* Page header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Devis</h1>
          <p className="page-subtitle">
            {loading ? 'Chargement...' : `${devis.length} devis${devis.length !== 1 ? '' : ''} au total`}
          </p>
        </div>
        <div className="crm-page-header-actions" style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} />
          </button>
          <button className="btn btn-primary" onClick={openCreate} disabled={!configured || saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={15} /> Nouveau devis
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
        <KpiCard label="Total devis" value={loading ? '—' : devis.length} sub={fmtMAD(totalMontant)} icon={FileText} color="var(--red)" />
        <KpiCard label="Valides" value={loading ? '—' : nValides} sub={fmtMAD(montantValides)} icon={CheckCircle} color="#388E3C" />
        <KpiCard label="En cours / Envoyes" value={loading ? '—' : nEnAttente} sub={fmtMAD(montantAttente)} icon={Clock} color="#1976D2" />
        <KpiCard label="Refuses / Expires" value={loading ? '—' : nRefuses} sub="a relancer" icon={XCircle} color="#E65100" />
        <KpiCard label="Chiffre potentiel" value={loading ? '—' : fmtMAD(montantAttente)} sub="devis en cours" icon={TrendingUp} color="#7B1FA2" />
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
              placeholder="Rechercher reference, titre, client..."
            />
          </div>
          <select className="crm-filter-select crm-filter-select--sm" value={filterStatut} onChange={e => { setFilterStatut(e.target.value); setPage(1); }}>
            <option value="">Tous statuts</option>
            {Object.entries(STATUT_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <select className="crm-filter-select" value={filterCommercial} onChange={e => { setFilterCommercial(e.target.value); setPage(1); }}>
            <option value="">Tous commerciaux</option>
            {commerciaux.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {hasFilters && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterStatut(''); setFilterCommercial(''); setPage(1); }}
              style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--red)' }}>
              <XCircle size={13} /> Effacer
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
            <p style={{ color: 'var(--text-3)', marginTop: 12, fontSize: '0.85rem' }}>Chargement des devis...</p>
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
                    { label: 'Reference',      field: 'reference' },
                    { label: 'Titre',           field: 'titre' },
                    { label: 'Client',          field: 'client_nom' },
                    { label: 'Commercial',      field: 'commercial' },
                    { label: 'Total HT',        field: 'total_ht',  align: 'right' },
                    { label: 'TVA',             field: 'total_tva', align: 'right' },
                    { label: 'Total TTC',       field: 'total_ttc', align: 'right' },
                    { label: 'Statut',          field: 'statut' },
                    { label: 'Creation',        field: 'date_creation' },
                    { label: 'Expiration',      field: 'date_validite' },
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
                {paged.map((d, i) => {
                  const clientNom = d.client_nom || d.client?.nom || '—';
                  const expSoon = isExpiringSoon(d.date_validite);
                  return (
                    <tr key={d.id ?? i} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.12s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}>

                      {/* Reference */}
                      <td data-label="Ref" style={{ padding: '10px 12px', fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.88rem', color: 'var(--red)', whiteSpace: 'nowrap' }}>
                        {d.reference || '—'}
                      </td>

                      {/* Titre */}
                      <td data-label="Titre" style={{ padding: '10px 12px', maxWidth: 220 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.titre}>
                          {d.titre || '—'}
                        </div>
                        {d.type_projet && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 2 }}>{d.type_projet}</div>
                        )}
                      </td>

                      {/* Client */}
                      <td data-label="Client" style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 500 }}>{clientNom}</span>
                      </td>

                      {/* Commercial */}
                      <td data-label="Commercial" style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--text-2)' }}>
                        {d.commercial || '—'}
                      </td>

                      {/* Total HT */}
                      <td data-label="Total HT" style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 500 }}>
                        {fmtMAD(d.total_ht)}
                      </td>

                      {/* TVA */}
                      <td data-label="TVA" style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--text-3)' }}>
                        {fmtMAD(d.total_tva)}
                      </td>

                      {/* Total TTC */}
                      <td data-label="Total TTC" style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '0.92rem', color: 'var(--red)' }}>
                          {fmtMAD(d.total_ttc)}
                        </span>
                      </td>

                      {/* Statut */}
                      <td data-label="Statut" style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <StatutBadge statut={d.statut} />
                      </td>

                      {/* Date creation */}
                      <td data-label="Creation" style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--text-2)', fontSize: '0.82rem' }}>
                        {fmtDate(d.date_creation)}
                      </td>

                      {/* Date validite */}
                      <td data-label="Validite" style={{ padding: '10px 12px', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                        <span style={{ color: expSoon ? '#E65100' : 'var(--text-2)', fontWeight: expSoon ? 700 : 400 }}>
                          {fmtDate(d.date_validite)}
                          {expSoon && <span style={{ display: 'block', fontSize: '0.7rem', color: '#E65100' }}>Expire bientot</span>}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '10px 10px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                          <button title="PDF" onClick={() => handlePdf(d)} disabled={pdfLoadingId === d.id}
                            className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }}>
                            <Download size={13} />
                          </button>
                          <button title="Modifier" onClick={() => openEdit(d)}
                            className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }}>
                            <Edit2 size={13} />
                          </button>
                          <button title="Dupliquer" onClick={() => handleDuplicate(d)}
                            className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }}>
                            <Copy size={13} />
                          </button>
                          <button title="Supprimer" onClick={() => handleDelete(d.id)}
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
            {paged.map((d, i) => {
              const clientNom = d.client_nom || d.client?.nom || '—';
              const expSoon = isExpiringSoon(d.date_validite);
              return (
                <div key={d.id ?? i} className="crm-doc-card">
                  <div className="crm-doc-head">
                    <span className="crm-doc-ref">{d.reference || '—'}</span>
                    <StatutBadge statut={d.statut} />
                  </div>
                  <div className="crm-doc-title">{d.titre || '—'}</div>
                  <div className="crm-doc-meta">
                    <span>{clientNom}</span>
                    {d.commercial && <span>· {d.commercial}</span>}
                    <span>· {fmtDate(d.date_creation)}</span>
                    {expSoon && <span style={{ color: '#E65100', fontWeight: 700 }}>· Expire bientot</span>}
                  </div>
                  <div className="crm-doc-footer">
                    <div>
                      <span className="crm-doc-amount">{fmtMAD(d.total_ttc)}</span>
                      <span className="crm-doc-amount-sub">TTC · HT {fmtMAD(d.total_ht)}</span>
                    </div>
                    <div className="crm-doc-actions">
                      <button type="button" title="PDF" onClick={() => handlePdf(d)} disabled={pdfLoadingId === d.id}
                        className="btn btn-ghost btn-sm crm-icon-btn"><Download size={14} /></button>
                      <button type="button" title="Modifier" onClick={() => openEdit(d)}
                        className="btn btn-ghost btn-sm crm-icon-btn"><Edit2 size={14} /></button>
                      <button type="button" title="Dupliquer" onClick={() => handleDuplicate(d)}
                        className="btn btn-ghost btn-sm crm-icon-btn"><Copy size={14} /></button>
                      <button type="button" title="Supprimer" onClick={() => handleDelete(d.id)}
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
              Page {safePage} / {totalPages} — {filtered.length} devis
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
                    className="btn btn-sm"
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
