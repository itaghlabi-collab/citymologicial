import { useState, useRef } from 'react';
import {
  Upload, Search, RefreshCw, FileText, Eye, Download, Trash2,
  CheckCircle, XCircle, AlertCircle, ChevronLeft, ChevronRight,
  Archive, UserCog, RotateCcw,
} from 'lucide-react';
import { useCrmArchives } from '../../hooks/useCrmArchives';
import {
  ARCHIVE_STATUT_LABEL,
  ARCHIVE_STATUT_BADGE,
} from '../../services/crm/crmArchives';
import { clientDisplayName } from '../../services/crm/clients';
import { openArchivePdf, downloadArchivePdf } from './crmArchiveDisplay';

function fmtMAD(v) {
  const n = Number(v);
  if (isNaN(n) || (!v && v !== 0)) return '—';
  return n.toLocaleString('fr-MA') + ' MAD';
}

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return d; }
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
      background: toast.type === 'error' ? '#D32F2F' : '#1B5E20',
      color: '#fff', borderRadius: 10, padding: '13px 20px',
      fontSize: '0.875rem', fontWeight: 600, boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
      display: 'flex', alignItems: 'center', gap: 10, maxWidth: 420,
    }}>
      {toast.type === 'error' ? <XCircle size={16} /> : <CheckCircle size={16} />}
      {toast.msg}
    </div>
  );
}

const PER_PAGE = 15;
const DOC_TYPES = [
  { value: 'devis', label: 'Devis' },
  { value: 'facture', label: 'Facture' },
];

export default function Archives() {
  const {
    records,
    clients,
    loading,
    saving,
    error,
    configured,
    load,
    upload,
    assignClient,
    changeDocType,
    validateImport,
    remove,
    reanalyze,
    filterCrmArchives,
    sortCrmArchives,
  } = useCrmArchives();

  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [sortField, setSortField] = useState('date_document');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const filtered = sortCrmArchives(
    filterCrmArchives(records, {
      search,
      statut: filterStatut,
      doc_type: filterType,
      client_id: filterClient,
    }),
    sortField,
    sortDir,
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);
  const hasFilters = !!(search || filterStatut || filterType || filterClient);

  const stats = {
    total: records.length,
    pret: records.filter((r) => r.statut === 'pret_import').length,
    verify: records.filter((r) => r.statut === 'client_a_verifier').length,
    imported: records.filter((r) => r.statut === 'importe').length,
    doublon: records.filter((r) => r.statut === 'doublon').length,
    erreur: records.filter((r) => r.statut === 'erreur_lecture').length,
  };

  async function handleFiles(files) {
    if (!files?.length) return;
    const results = await upload(files);
    const ok = results.filter((r) => r.success).length;
    const ko = results.filter((r) => !r.success);
    if (ok) showToast(`${ok} PDF analysé(s) avec succès.`);
    if (ko.length) showToast(ko.map((k) => `${k.fileName}: ${k.error}`).join(' | '), 'error');
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  async function handleValidate(row) {
    const result = await validateImport(row.id);
    showToast(result.success ? `Archive ${row.reference || ''} importée.` : result.error, result.success ? 'success' : 'error');
  }

  async function handleDelete(row) {
    if (!window.confirm(`Supprimer l'archive « ${row.file_name} » ?`)) return;
    const result = await remove(row.id);
    showToast(result.success ? 'Archive supprimée.' : result.error, result.success ? 'success' : 'error');
  }

  async function handleView(row) {
    try {
      await openArchivePdf(row);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleDownload(row) {
    try {
      await downloadArchivePdf(row);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleClientChange(row, clientId) {
    const result = await assignClient(row.id, clientId || null);
    showToast(result.success ? 'Client mis à jour.' : result.error, result.success ? 'success' : 'error');
  }

  async function handleTypeChange(row, docType) {
    const result = await changeDocType(row.id, docType);
    showToast(result.success ? 'Type mis à jour.' : result.error, result.success ? 'success' : 'error');
  }

  async function handleReanalyze(row) {
    const result = await reanalyze(row.id);
    showToast(result.success ? 'PDF réanalysé.' : result.error, result.success ? 'success' : 'error');
  }

  return (
    <div className="animate-fade-in crm-module crm-module--archives">
      <Toast toast={toast} />

      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Archives CRM</h1>
          <p className="page-subtitle">
            Importez les PDF de l&apos;ancien logiciel, vérifiez les métadonnées puis dispatchez vers Devis ou Factures.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={load} disabled={loading}>
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => fileRef.current?.click()}
            disabled={!configured || saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Upload size={15} /> Importer des PDF
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
          />
        </div>
      </div>

      {!configured && (
        <div style={{ background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#E65100' }}>
          Supabase non configuré — ajoutez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env
        </div>
      )}

      {error && !loading && (
        <div style={{ background: '#FFEBEE', color: 'var(--red)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem' }}>
          <AlertCircle size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          {error}
        </div>
      )}

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Total archives', value: stats.total, icon: Archive, color: 'var(--red)' },
          { label: 'Prêts à importer', value: stats.pret, icon: CheckCircle, color: '#388E3C' },
          { label: 'Client à vérifier', value: stats.verify, icon: UserCog, color: '#F57C00' },
          { label: 'Importés', value: stats.imported, icon: FileText, color: '#1976D2' },
          { label: 'Doublons', value: stats.doublon, icon: XCircle, color: '#E65100' },
          { label: 'Erreurs PDF', value: stats.erreur, icon: AlertCircle, color: 'var(--red)' },
        ].map((k) => (
          <div key={k.label} className="stat-card">
            <div className="stat-icon" style={{ background: k.color + '15', color: k.color }}>
              <k.icon size={20} />
            </div>
            <div className="stat-body">
              <div className="stat-value">{loading ? '—' : k.value}</div>
              <div className="stat-label">{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div
        className="card"
        style={{
          marginBottom: 16,
          padding: 24,
          border: dragOver ? '2px dashed var(--red)' : '2px dashed var(--border)',
          background: dragOver ? 'rgba(211,47,47,0.04)' : 'var(--bg)',
          textAlign: 'center',
          cursor: configured && !saving ? 'pointer' : 'default',
        }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => configured && !saving && fileRef.current?.click()}
      >
        <Upload size={32} style={{ color: 'var(--red)', marginBottom: 8 }} />
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Glissez-déposez vos PDF ici</div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-3)' }}>
          Un ou plusieurs fichiers — détection automatique Devis / Facture, référence, client, montants
        </div>
      </div>

      <div className="card crm-filter-bar" style={{ marginBottom: 16 }}>
        <div className="crm-filter-row">
          <div className="crm-filter-search">
            <Search size={14} className="crm-filter-search-icon" />
            <input
              className="crm-filter-input"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Fichier, référence, client, ICE..."
            />
          </div>
          <select className="crm-filter-select crm-filter-select--sm" value={filterStatut} onChange={(e) => { setFilterStatut(e.target.value); setPage(1); }}>
            <option value="">Tous statuts</option>
            {Object.entries(ARCHIVE_STATUT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select className="crm-filter-select crm-filter-select--sm" value={filterType} onChange={(e) => { setFilterType(e.target.value); setPage(1); }}>
            <option value="">Tous types</option>
            {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select className="crm-filter-select" value={filterClient} onChange={(e) => { setFilterClient(e.target.value); setPage(1); }}>
            <option value="">Tous clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{clientDisplayName(c)}</option>
            ))}
          </select>
          {hasFilters && (
            <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }}
              onClick={() => { setSearch(''); setFilterStatut(''); setFilterType(''); setFilterClient(''); setPage(1); }}>
              Effacer
            </button>
          )}
          <span className="crm-filter-count">{filtered.length} résultat{filtered.length > 1 ? 's' : ''}</span>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-3)' }}>Chargement...</div>
        ) : paged.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Archive size={40} style={{ color: 'var(--border)', marginBottom: 12 }} />
            <p style={{ color: 'var(--text-3)' }}>Aucune archive — importez vos premiers PDF.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid var(--border)', background: 'var(--bg)' }}>
                  {['Fichier', 'Type', 'Référence', 'Client détecté', 'Date', 'Montant TTC', 'Statut', 'Actions'].map((h) => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-3)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((row) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', maxWidth: 160 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.file_name}>{row.file_name}</div>
                      {row.detection_errors && (
                        <div style={{ fontSize: '0.72rem', color: '#E65100', marginTop: 2 }}>{row.detection_errors}</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <select
                        className="crm-filter-select crm-filter-select--sm"
                        value={row.doc_type}
                        disabled={row.statut === 'importe' || saving}
                        onChange={(e) => handleTypeChange(row, e.target.value)}
                      >
                        {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>
                      {row.reference || '—'}
                      {row.duplicate_ref && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--red)' }}>Doublon: {row.duplicate_ref}</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', minWidth: 180 }}>
                      <select
                        className="crm-filter-select"
                        value={row.client_id || ''}
                        disabled={row.statut === 'importe' || saving}
                        onChange={(e) => handleClientChange(row, e.target.value)}
                      >
                        <option value="">{row.client_detected_name || 'Client à associer manuellement'}</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>{clientDisplayName(c)}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{fmtDate(row.date_document)}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{fmtMAD(row.total_ttc)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span className={`badge ${ARCHIVE_STATUT_BADGE[row.statut] || 'badge-grey'}`}>
                        {ARCHIVE_STATUT_LABEL[row.statut] || row.statut}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-ghost btn-sm" title="Voir PDF" onClick={() => handleView(row)}><Eye size={14} /></button>
                        <button type="button" className="btn btn-ghost btn-sm" title="Télécharger" onClick={() => handleDownload(row)}><Download size={14} /></button>
                        {row.statut !== 'importe' && (
                          <>
                            <button type="button" className="btn btn-ghost btn-sm" title="Réanalyser" onClick={() => handleReanalyze(row)} disabled={saving}><RotateCcw size={14} /></button>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              title="Valider import"
                              disabled={saving || !['pret_import', 'client_a_verifier'].includes(row.statut) || row.statut === 'doublon'}
                              onClick={() => handleValidate(row)}
                            >
                              <CheckCircle size={14} />
                            </button>
                          </>
                        )}
                        {row.statut !== 'importe' && (
                          <button type="button" className="btn btn-ghost btn-sm" title="Supprimer" style={{ color: 'var(--red)' }} onClick={() => handleDelete(row)}><Trash2 size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <button type="button" className="btn btn-ghost btn-sm" disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Page {safePage} / {totalPages}</span>
          <button type="button" className="btn btn-ghost btn-sm" disabled={safePage >= totalPages} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
