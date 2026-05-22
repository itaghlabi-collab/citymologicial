import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Search, Edit2, Copy, Trash2, FileText,
  CheckCircle, Clock, XCircle, AlertCircle, TrendingUp,
  ChevronLeft, ChevronRight, RefreshCw, ArrowUpDown,
  CreditCard, Send, Ban, DollarSign, X
} from 'lucide-react';
import { getFactures, createFacture, updateFacture, deleteFacture } from '../../services/api';
import FactureForm from './FactureForm';
import FactureAcompte from './FactureAcompte';

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
  const [view, setView]               = useState('list'); // 'list' | 'form' | 'acompte'
  const [editingFacture, setEditing]  = useState(null);

  const [factures, setFactures]       = useState([]);
  const [loading, setLoading]         = useState(false);
  const [loadError, setLoadError]     = useState('');

  /* Filters */
  const [search, setSearch]           = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterCommercial, setFilterCommercial] = useState('');
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

  /* Load */
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await getFactures();
      setFactures(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (err) {
      setLoadError(err.message || 'Impossible de charger les factures.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* Derived */
  const commerciaux = [...new Set(factures.map(f => f.commercial).filter(Boolean))];

  /* Filter + sort */
  const filtered = factures.filter(f => {
    const clientNom = f.client_nom || f.client?.nom || '';
    const q = search.toLowerCase();
    const matchSearch = !q
      || (f.numero || '').toLowerCase().includes(q)
      || (f.titre || '').toLowerCase().includes(q)
      || clientNom.toLowerCase().includes(q)
      || (f.commercial || '').toLowerCase().includes(q);
    const matchStatut = !filterStatut || f.statut === filterStatut;
    const matchCom    = !filterCommercial || f.commercial === filterCommercial;
    return matchSearch && matchStatut && matchCom;
  }).sort((a, b) => {
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
  const totalFacture   = factures.reduce((s, f) => s + Number(f.total_ttc || 0), 0);
  const totalEncaisse  = factures.reduce((s, f) => s + Number(f.total_paye || 0), 0);
  const totalReste     = factures.reduce((s, f) => s + Number(f.reste_a_payer || 0), 0);
  const nImpayees      = factures.filter(f => f.statut === 'impayee' || f.statut === 'envoyee').length;
  const nEnRetard      = factures.filter(f => f.statut === 'en_retard' || (f.statut !== 'payee' && f.statut !== 'annulee' && f.date_echeance && new Date(f.date_echeance) < new Date())).length;
  const totalAcomptes  = factures.reduce((s, f) => s + Number(f.acompte_montant || 0), 0);

  /* Handlers */
  function openCreate()   { setEditing(null); setView('form'); }
  function openAcompte()  { setEditing(null); setView('acompte'); }
  function openEdit(f)    { setEditing(f);    setView('form'); }
  function backToList()   { setView('list');  setEditing(null); }

  async function handleSaved(payload, isEdit) {
    try {
      if (isEdit && payload.id) {
        await updateFacture(payload.id, payload);
        setFactures(prev => prev.map(f => String(f.id) === String(payload.id) ? { ...f, ...payload } : f));
      } else {
        const created = await createFacture(payload);
        setFactures(prev => [created?.data ?? { ...payload, id: Date.now() }, ...prev]);
      }
      showToast(isEdit ? 'Facture mise a jour avec succes.' : 'Facture creee avec succes.');
    } catch {
      setFactures(prev => isEdit
        ? prev.map(f => String(f.id) === String(payload.id) ? { ...f, ...payload } : f)
        : [{ ...payload, id: Date.now() }, ...prev]
      );
      showToast(isEdit ? 'Facture mise a jour (hors-ligne).' : 'Facture creee (hors-ligne).');
    }
    backToList();
  }

  async function handleDuplicate(f) {
    const copy = {
      ...f, id: undefined,
      numero: 'FA-' + new Date().getFullYear() + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(Math.floor(Math.random() * 9000) + 1000),
      statut: 'brouillon',
      date_emission: new Date().toISOString().slice(0, 10),
      titre: (f.titre || '') + ' (copie)',
      paiements: [],
      total_paye: 0,
      reste_a_payer: f.total_ttc || 0,
    };
    try {
      const created = await createFacture(copy);
      setFactures(prev => [created?.data ?? { ...copy, id: Date.now() }, ...prev]);
      showToast('Facture dupliquee avec succes.');
    } catch {
      setFactures(prev => [{ ...copy, id: Date.now() }, ...prev]);
      showToast('Facture dupliquee (hors-ligne).');
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Supprimer cette facture ? Cette action est irreversible.')) return;
    try { await deleteFacture(id); } catch (_) {}
    setFactures(prev => prev.filter(f => String(f.id) !== String(id)));
    showToast('Facture supprimee.');
  }

  /* ── Sub-views ── */
  if (view === 'form') {
    return <FactureForm facture={editingFacture} onBack={backToList} onSaved={handleSaved} />;
  }
  if (view === 'acompte') {
    return <FactureAcompte onBack={backToList} onSaved={handleSaved} />;
  }

  const hasFilters = !!(search || filterStatut || filterCommercial);

  return (
    <div className="animate-fade-in">
      <Toast toast={toast} />

      {/* Page header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Factures</h1>
          <p className="page-subtitle">Gestion des factures, paiements et suivi des reglements.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} />
          </button>
          <button className="btn btn-ghost" onClick={openAcompte} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={15} /> Facture acompte
          </button>
          <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={15} /> Ajouter une facture
          </button>
        </div>
      </div>

      {/* Error banner */}
      {loadError && (
        <div style={{ background: '#FFEBEE', color: 'var(--red)', border: '1px solid rgba(211,47,47,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={15} /> {loadError}
          <button className="btn btn-ghost btn-sm" onClick={load} style={{ marginLeft: 'auto' }}>Reessayer</button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <KpiCard label="Total facture" value={loading ? '—' : fmtMAD(totalFacture)} sub={factures.length + ' facture(s)'} icon={FileText} color="var(--red)" />
        <KpiCard label="Total encaisse" value={loading ? '—' : fmtMAD(totalEncaisse)} sub="paiements recus" icon={CheckCircle} color="#388E3C" />
        <KpiCard label="Reste a payer" value={loading ? '—' : fmtMAD(totalReste)} sub="en attente" icon={DollarSign} color="#1976D2" />
        <KpiCard label="Factures impayees" value={loading ? '—' : nImpayees} sub="a relancer" icon={XCircle} color="#E65100" />
        <KpiCard label="En retard" value={loading ? '—' : nEnRetard} sub="echeance depassee" icon={AlertCircle} color="var(--red)" />
        <KpiCard label="Acomptes recus" value={loading ? '—' : fmtMAD(totalAcomptes)} sub="total acomptes" icon={CreditCard} color="#7B1FA2" />
      </div>

      {/* Filter bar */}
      <div className="card" style={{ padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Rechercher numero, titre, client..."
              style={{ padding: '8px 10px 8px 32px', border: '1.5px solid var(--border)', borderRadius: 6, fontSize: '0.85rem', width: '100%', outline: 'none', background: '#fff' }}
            />
          </div>

          <select value={filterStatut} onChange={e => { setFilterStatut(e.target.value); setPage(1); }}
            style={{ padding: '8px 10px', border: '1.5px solid var(--border)', borderRadius: 6, fontSize: '0.85rem', color: filterStatut ? 'var(--text)' : 'var(--text-3)', background: '#fff', cursor: 'pointer' }}>
            <option value="">Tous statuts</option>
            {Object.entries(STATUT_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          <select value={filterCommercial} onChange={e => { setFilterCommercial(e.target.value); setPage(1); }}
            style={{ padding: '8px 10px', border: '1.5px solid var(--border)', borderRadius: 6, fontSize: '0.85rem', color: filterCommercial ? 'var(--text)' : 'var(--text-3)', background: '#fff', cursor: 'pointer' }}>
            <option value="">Tous commerciaux</option>
            {commerciaux.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterStatut(''); setFilterCommercial(''); setPage(1); }}
              style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--red)' }}>
              <X size={13} /> Effacer
            </button>
          )}

          <div style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-3)', flexShrink: 0 }}>
            {filtered.length} resultat{filtered.length > 1 ? 's' : ''}
          </div>
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
                        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderTop: '1px solid var(--border)' }}>
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
