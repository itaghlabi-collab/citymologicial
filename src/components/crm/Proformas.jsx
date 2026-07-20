import { useState, useRef, useEffect } from 'react';
import {
  Plus, Search, Edit2, Copy, Trash2, FileText,
  CheckCircle, XCircle, AlertCircle, RefreshCw, ArrowUpDown,
  Ban, Send, X, ChevronLeft, ChevronRight, Eye,
} from 'lucide-react';
import { useCrmProformas } from '../../hooks/useCrmProformas';
import { listClients } from '../../services/crm/clients';
import { CRM_PROFORMA_STATUT_LABEL } from '../../services/crm/crmProformas';
import ProformaForm from './ProformaForm';
import CrmOverflowMenu from './CrmOverflowMenu';
import CrmDocTabs from './CrmDocTabs';

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
function fmtCommercial(v) {
  if (!v?.trim()) return '—';
  return String(v).trim().toUpperCase();
}

const STATUT_CFG = {
  brouillon: { label: 'Brouillon', cls: 'badge-grey', icon: FileText },
  envoyee:   { label: 'Envoyée', cls: 'badge-blue', icon: Send },
  acceptee:  { label: 'Acceptée', cls: 'badge-green', icon: CheckCircle },
  refusee:   { label: 'Refusée', cls: 'badge-red', icon: XCircle },
  expiree:   { label: 'Expirée', cls: 'badge-orange', icon: AlertCircle },
  convertie: { label: 'Convertie', cls: 'badge-green', icon: CheckCircle },
  annulee:   { label: 'Annulée', cls: 'badge-grey', icon: Ban },
};

function StatutBadge({ statut }) {
  const cfg = STATUT_CFG[statut] || { label: CRM_PROFORMA_STATUT_LABEL[statut] || statut, cls: 'badge-grey' };
  return <span className={'badge ' + cfg.cls}>{cfg.label}</span>;
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
      background: toast.type === 'error' ? '#D32F2F' : '#1B5E20',
      color: '#fff', borderRadius: 10, padding: '13px 20px',
      fontSize: '0.875rem', fontWeight: 600, boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
      display: 'flex', alignItems: 'center', gap: 10, maxWidth: 380,
    }}>
      {toast.type === 'error' ? <XCircle size={16} /> : <CheckCircle size={16} />}
      {toast.msg}
    </div>
  );
}

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

const PER_PAGE = 15;
const INTENT_KEY = 'crm_proforma_intent';

export default function Proformas({ onSwitchDoc }) {
  const {
    records: proformas,
    loading,
    saving,
    error,
    configured,
    load,
    create,
    update,
    remove,
    duplicate,
    cancel,
    getById,
  } = useCrmProformas();

  const [view, setView] = useState('list');
  const [editing, setEditing] = useState(null);
  const [initialClientId, setInitialClientId] = useState('');
  const [clientsList, setClientsList] = useState([]);

  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterCommercial, setFilterCommercial] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [sortField, setSortField] = useState('date_emission');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);

  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  function showToast(msg, type = 'success') {
    clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => {
    listClients().then(setClientsList).catch(() => {});
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(INTENT_KEY);
      if (!raw) return;
      const intent = JSON.parse(raw);
      sessionStorage.removeItem(INTENT_KEY);
      if (intent?.openCreate) {
        setInitialClientId(intent.clientId ? String(intent.clientId) : '');
        setEditing(null);
        setView('form');
      }
      // openList : rester sur la liste (déjà l’onglet Proformas)
    } catch { /* ignore */ }
  }, []);

  const commerciaux = [...new Set(proformas.map(p => p.commercial).filter(Boolean))];

  const filtered = proformas.filter((p) => {
    if (filterStatut && p.statut !== filterStatut) return false;
    if (filterCommercial && p.commercial !== filterCommercial) return false;
    if (filterClient && String(p.client_id) !== String(filterClient)) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = [p.numero, p.titre, p.client_nom, p.devis_reference, p.commercial].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    let va = a[sortField] ?? '';
    let vb = b[sortField] ?? '';
    if (['total_ttc', 'total_ht', 'total_tva'].includes(sortField)) { va = Number(va); vb = Number(vb); }
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

  const totalTtc = proformas.reduce((s, p) => s + Number(p.total_ttc || 0), 0);
  const nBrouillon = proformas.filter(p => p.statut === 'brouillon').length;
  const nEnvoyee = proformas.filter(p => p.statut === 'envoyee').length;
  const nConvertie = proformas.filter(p => p.statut === 'convertie').length;

  function openCreate() {
    setEditing(null);
    setInitialClientId('');
    setView('form');
  }
  async function openEdit(p) {
    try {
      const full = await getById(p.id);
      setEditing(full);
      setInitialClientId('');
      setView('form');
    } catch (err) {
      showToast(err.message || 'Impossible de charger la proforma.', 'error');
    }
  }
  function backToList() {
    setView('list');
    setEditing(null);
    setInitialClientId('');
  }

  async function handleSaved(payload, isEdit) {
    const result = isEdit && payload.id
      ? await update(payload.id, payload)
      : await create(payload);
    if (!result.success) return result;
    showToast(isEdit ? 'Proforma mise à jour.' : 'Proforma créée.');
    backToList();
    return result;
  }

  async function handleDuplicate(p) {
    const result = await duplicate(p.id);
    showToast(result.success ? 'Proforma dupliquée.' : (result.error || 'Erreur duplication.'), result.success ? 'success' : 'error');
  }

  async function handleCancel(p) {
    if (!window.confirm(`Annuler la proforma ${p.numero} ?`)) return;
    const result = await cancel(p.id);
    showToast(result.success ? 'Proforma annulée.' : (result.error || 'Erreur annulation.'), result.success ? 'success' : 'error');
  }

  async function handleDelete(id) {
    if (!window.confirm('Supprimer cette proforma ? Cette action est irréversible.')) return;
    const result = await remove(id);
    showToast(result.success ? 'Proforma supprimée.' : (result.error || 'Erreur suppression.'), result.success ? 'success' : 'error');
  }

  if (view === 'form') {
    return (
      <ProformaForm
        proforma={editing}
        initialClientId={initialClientId}
        onBack={backToList}
        onSaved={handleSaved}
        saving={saving}
      />
    );
  }

  const hasFilters = !!(search || filterStatut || filterCommercial || filterClient);

  return (
    <div className="animate-fade-in crm-module crm-module--proformas">
      <Toast toast={toast} />

      <div className="page-header" style={{ marginBottom: 12 }}>
        <div>
          <h1 className="page-title">Factures Proforma</h1>
          <p className="page-subtitle">Documents commerciaux PF — hors comptabilité, paiements et caisse.</p>
        </div>
        <div className="crm-page-header-actions" style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} />
          </button>
          <button type="button" className="btn btn-primary" onClick={openCreate} disabled={!configured || saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={15} /> Nouvelle proforma
          </button>
        </div>
      </div>

      <CrmDocTabs active="proformas" onChange={onSwitchDoc} />

      {!configured && (
        <div style={{ background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#E65100' }}>
          Supabase non configuré — ajoutez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env
        </div>
      )}

      {error && !loading && (
        <div style={{ background: '#FFEBEE', color: 'var(--red)', border: '1px solid rgba(211,47,47,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={15} /> {error}
          <button type="button" className="btn btn-ghost btn-sm" onClick={load} style={{ marginLeft: 'auto' }}>Réessayer</button>
        </div>
      )}

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <KpiCard label="Total proformas" value={loading ? '—' : fmtMAD(totalTtc)} sub={proformas.length + ' document(s)'} icon={FileText} color="var(--red)" />
        <KpiCard label="Brouillons" value={loading ? '—' : nBrouillon} sub="en cours" icon={FileText} color="#757575" />
        <KpiCard label="Envoyées" value={loading ? '—' : nEnvoyee} sub="chez le client" icon={Send} color="#1976D2" />
        <KpiCard label="Converties" value={loading ? '—' : nConvertie} sub="en facture FAC" icon={CheckCircle} color="#388E3C" />
      </div>

      <div className="card crm-filter-bar" style={{ marginBottom: 16 }}>
        <div className="crm-filter-row">
          <div className="crm-filter-search">
            <Search size={14} className="crm-filter-search-icon" />
            <input
              className="crm-filter-input"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Rechercher numéro PF, titre, client…"
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
          {hasFilters && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterStatut(''); setFilterCommercial(''); setFilterClient(''); setPage(1); }}
              style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--red)' }}>
              <X size={13} /> Effacer
            </button>
          )}
          <span className="crm-filter-count">
            {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '50px 20px' }}>
            <div style={{ display: 'inline-block', width: 28, height: 28, border: '3px solid var(--border)', borderTopColor: 'var(--red)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ color: 'var(--text-3)', marginTop: 12, fontSize: '0.85rem' }}>Chargement des proformas…</p>
          </div>
        ) : paged.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <FileText size={48} style={{ color: 'var(--border)', marginBottom: 16 }} />
            <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-2)', marginBottom: 8 }}>
              {hasFilters ? 'Aucune proforma correspondante' : 'Aucune proforma pour le moment'}
            </h3>
            <p style={{ color: 'var(--text-3)', fontSize: '0.875rem', marginBottom: 20 }}>
              {hasFilters ? 'Modifiez vos filtres.' : 'Créez une proforma PF (hors facturation comptable).'}
            </p>
            {!hasFilters && (
              <button type="button" className="btn btn-primary" onClick={openCreate} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Plus size={15} /> Nouvelle proforma
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="crm-table-desktop">
              <div className="table-wrap">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1.5px solid var(--border)', background: 'var(--bg)' }}>
                      {[
                        { label: 'N° Proforma', field: 'numero' },
                        { label: 'Titre', field: 'titre' },
                        { label: 'Devis lié', field: 'devis_reference' },
                        { label: 'Client', field: 'client_nom' },
                        { label: 'Commercial', field: 'commercial' },
                        { label: 'Total HT', field: 'total_ht', align: 'right' },
                        { label: 'TVA', field: 'total_tva', align: 'right' },
                        { label: 'Total TTC', field: 'total_ttc', align: 'right' },
                        { label: 'Émission', field: 'date_emission' },
                        { label: 'Validité', field: 'date_validite' },
                        { label: 'Statut', field: 'statut' },
                        { label: '', field: null },
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
                    {paged.map((p, i) => (
                      <tr key={p.id ?? i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px', fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)', whiteSpace: 'nowrap' }}>{p.numero || '—'}</td>
                        <td style={{ padding: '10px 12px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{p.titre || '—'}</td>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                          {p.devis_reference ? (
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-3)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px' }}>{p.devis_reference}</span>
                          ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', fontWeight: 500 }}>{p.client_nom || '—'}</td>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--text-2)' }}>{fmtCommercial(p.commercial)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMAD(p.total_ht)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--text-3)' }}>{fmtMAD(p.total_tva)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, color: 'var(--red)' }}>{fmtMAD(p.total_ttc)}</span>
                        </td>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>{fmtDate(p.date_emission)}</td>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>{fmtDate(p.date_validite)}</td>
                        <td style={{ padding: '10px 12px' }}><StatutBadge statut={p.statut} /></td>
                        <td style={{ padding: '10px 10px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                            <button type="button" title="Modifier" onClick={() => openEdit(p)} className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }}><Edit2 size={13} /></button>
                            <button type="button" title="Dupliquer" onClick={() => handleDuplicate(p)} className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }}><Copy size={13} /></button>
                            {p.statut !== 'convertie' && p.statut !== 'annulee' && (
                              <button type="button" title="Annuler" onClick={() => handleCancel(p)} className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }}><Ban size={13} /></button>
                            )}
                            {p.statut !== 'convertie' && (
                              <button type="button" title="Supprimer" onClick={() => handleDelete(p.id)} className="btn btn-ghost btn-sm" style={{ padding: '4px 7px', color: 'var(--red)' }}><Trash2 size={13} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="crm-doc-list crm-mobile-only">
              {paged.map((p, i) => (
                <div key={p.id ?? i} className="crm-doc-card">
                  <div className="crm-doc-head">
                    <span className="crm-doc-ref">{p.numero || '—'}</span>
                    <StatutBadge statut={p.statut} />
                  </div>
                  <div className="crm-doc-title">{p.titre || p.client_nom || '—'}</div>
                  <div className="crm-doc-meta">
                    <span className="crm-doc-meta-line">{p.client_nom || '—'}</span>
                    <span className="crm-doc-meta-line">{fmtDate(p.date_emission)}</span>
                    {p.devis_reference && <span className="crm-doc-meta-line">{p.devis_reference}</span>}
                  </div>
                  <div className="crm-doc-footer">
                    <div>
                      <span className="crm-doc-amount">{fmtMAD(p.total_ttc)}</span>
                      <span className="crm-doc-amount-sub">Proforma · hors caisse</span>
                    </div>
                    <div className="crm-doc-actions">
                      <button type="button" title="Voir" aria-label="Voir" onClick={() => openEdit(p)} className="btn btn-ghost btn-sm crm-icon-btn"><Eye size={14} /></button>
                      <CrmOverflowMenu
                        items={[
                          { icon: Edit2, label: 'Modifier', onClick: () => openEdit(p) },
                          { icon: Copy, label: 'Dupliquer', onClick: () => handleDuplicate(p) },
                          ...(p.statut !== 'convertie' && p.statut !== 'annulee'
                            ? [{ icon: Ban, label: 'Annuler', onClick: () => handleCancel(p) }]
                            : []),
                          ...(p.statut !== 'convertie'
                            ? [{ divider: true }, { icon: Trash2, label: 'Supprimer', danger: true, onClick: () => handleDelete(p.id) }]
                            : []),
                        ]}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!loading && totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-3)' }}>
              Page {safePage} / {totalPages} — {filtered.length} proformas
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1}
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <ChevronLeft size={14} /> Précédent
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
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
