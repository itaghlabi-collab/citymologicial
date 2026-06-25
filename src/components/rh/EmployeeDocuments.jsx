/**
 * EmployeeDocuments.jsx — Dossier documentaire employé (drawer latéral)
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  X, Upload, Eye, Download, Pencil, Trash2, Plus, FileText, AlertCircle, FolderOpen,
} from 'lucide-react';
import { employeeFullName } from '../../services/rh/employees';
import {
  EMP_DOC_SECTIONS,
  listEmployeeDocuments,
  addEmployeeDocument,
  renameEmployeeDocument,
  deleteEmployeeDocument,
  computeEmployeeDocStats,
  groupDocumentsBySection,
  formatFileSize,
  formatFileType,
} from '../../services/rh/employeeDocuments';
import { isAllowedEmployeeFile, MAX_EMPLOYEE_FILE_BYTES } from '../../services/rh/employeeStorage';

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.docx,.xlsx';

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function fmtDateTime(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

const selectStyle = {
  width: '100%',
  padding: '8px 11px',
  border: '1.5px solid var(--border)',
  borderRadius: 6,
  fontSize: '0.86rem',
  background: '#fff',
  boxSizing: 'border-box',
};

export default function EmployeeDocuments({ employee, onClose, mode = 'manage' }) {
  const readOnly = mode === 'view';
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('admin');
  const [docType, setDocType] = useState('contrat_travail');
  const [showUpload, setShowUpload] = useState(false);
  const inputRef = useRef(null);

  const section = useMemo(
    () => EMP_DOC_SECTIONS.find((s) => s.id === category) || EMP_DOC_SECTIONS[0],
    [category],
  );

  const stats = useMemo(() => computeEmployeeDocStats(docs), [docs]);
  const grouped = useMemo(() => groupDocumentsBySection(docs), [docs]);

  const load = useCallback(async () => {
    if (!employee?.id) return;
    setLoading(true);
    setError('');
    try {
      const rows = await listEmployeeDocuments(employee.id);
      setDocs(rows);
    } catch (err) {
      setError(err.message || 'Impossible de charger le dossier documentaire.');
    } finally {
      setLoading(false);
    }
  }, [employee?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!section?.types?.length) return;
    if (!section.types.some((t) => t.value === docType)) {
      setDocType(section.types[0].value);
    }
  }, [section, docType]);

  async function handleFiles(fileList) {
    if (!employee?.id || !fileList?.length) return;
    setUploading(true);
    setError('');
    try {
      for (const file of Array.from(fileList)) {
        if (!isAllowedEmployeeFile(file)) {
          throw new Error(`« ${file.name} » : type non autorisé ou > ${MAX_EMPLOYEE_FILE_BYTES / (1024 * 1024)} Mo.`);
        }
        await addEmployeeDocument(employee.id, file, { category, doc_type: docType });
      }
      await load();
      setShowUpload(false);
    } catch (err) {
      setError(err.message || 'Erreur lors de l\'upload.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleDelete(doc) {
    if (!window.confirm(`Supprimer « ${doc.file_name} » ?`)) return;
    try {
      await deleteEmployeeDocument(doc.id);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      setError(err.message || 'Erreur suppression.');
    }
  }

  async function handleRename(doc) {
    const next = window.prompt('Nouveau nom du document :', doc.file_name);
    if (!next || next.trim() === doc.file_name) return;
    try {
      const updated = await renameEmployeeDocument(doc.id, next.trim());
      setDocs((prev) => prev.map((d) => (d.id === doc.id ? updated : d)));
    } catch (err) {
      setError(err.message || 'Erreur renommage.');
    }
  }

  function handleView(doc) {
    if (!doc.url) {
      setError('URL du document indisponible.');
      return;
    }
    window.open(doc.url, '_blank', 'noopener,noreferrer');
  }

  function handleDownload(doc) {
    if (!doc.url) {
      setError('URL du document indisponible.');
      return;
    }
    const a = document.createElement('a');
    a.href = doc.url;
    a.download = doc.file_name || 'document';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  if (!employee) return null;

  const fullName = employeeFullName(employee).toUpperCase() || '—';

  return (
    <>
      <div className="rh-emp-docs-drawer-overlay" onClick={onClose} aria-hidden="true" />
      <aside
        className="rh-emp-docs-drawer"
        role="dialog"
        aria-label={`${readOnly ? 'Dossier administratif' : 'Dossier documentaire'} — ${fullName}`}
      >
        <header className="rh-emp-docs-drawer-header">
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {readOnly ? 'Dossier administratif' : 'Dossier documentaire'}
            </div>
            <h2 className="rh-emp-docs-drawer-title">
              {readOnly ? 'DOSSIER ADMINISTRATIF' : 'DOSSIER DOCUMENTAIRE'} — {fullName}
            </h2>
          </div>
          <button type="button" className="rh-emp-modal-close" onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </header>

        <div className="rh-emp-docs-drawer-body">
          <div className="rh-emp-docs-info-grid">
            <div>
              <div className="rh-emp-docs-info-label">Nom</div>
              <div className="rh-emp-docs-info-value">{fullName}</div>
            </div>
            <div>
              <div className="rh-emp-docs-info-label">Poste</div>
              <div className="rh-emp-docs-info-value">{employee.poste || '—'}</div>
            </div>
            <div>
              <div className="rh-emp-docs-info-label">Département</div>
              <div className="rh-emp-docs-info-value">{employee.department || '—'}</div>
            </div>
            <div>
              <div className="rh-emp-docs-info-label">Date d&apos;embauche</div>
              <div className="rh-emp-docs-info-value">{fmtDate(employee.date_embauche)}</div>
            </div>
          </div>

          <div className="rh-emp-docs-stats">
            <div className="rh-emp-docs-stat">
              <span className="rh-emp-docs-stat-num">{stats.count}</span>
              <span className="rh-emp-docs-stat-lbl">document{stats.count > 1 ? 's' : ''}</span>
            </div>
            <div className="rh-emp-docs-stat">
              <span className="rh-emp-docs-stat-num">{formatFileSize(stats.totalSize)}</span>
              <span className="rh-emp-docs-stat-lbl">espace occupé</span>
            </div>
            <div className="rh-emp-docs-stat">
              <span className="rh-emp-docs-stat-num" style={{ fontSize: '0.95rem' }}>{fmtDateTime(stats.lastUpdate)}</span>
              <span className="rh-emp-docs-stat-lbl">dernière mise à jour</span>
            </div>
          </div>

          {!readOnly && (
            <div className="flex-between" style={{ marginBottom: 12 }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowUpload((v) => !v)}
              >
                <Plus size={14} /> Ajouter un document
              </button>
            </div>
          )}

          {!readOnly && showUpload && (
            <div className="rh-emp-docs-upload-panel">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Catégorie</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    style={{ ...selectStyle, marginTop: 4, cursor: 'pointer' }}
                  >
                    {EMP_DOC_SECTIONS.map((s) => (
                      <option key={s.id} value={s.id}>{s.icon} {s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Type de document</label>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    style={{ ...selectStyle, marginTop: 4, cursor: 'pointer' }}
                  >
                    {section.types.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={() => !uploading && inputRef.current?.click()}
                onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('rh-emp-docs-drop-active'); }}
                onDragLeave={(e) => { e.currentTarget.classList.remove('rh-emp-docs-drop-active'); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('rh-emp-docs-drop-active');
                  handleFiles(e.dataTransfer.files);
                }}
                className="rh-emp-docs-dropzone"
              >
                <Upload size={22} style={{ color: 'var(--text-3)', margin: '0 auto 8px', display: 'block' }} />
                <div style={{ fontSize: '0.84rem', color: 'var(--text-2)', fontWeight: 600 }}>
                  {uploading ? 'Envoi en cours…' : 'Glissez-déposez ou cliquez pour sélectionner'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 4 }}>
                  PDF, JPG, PNG, DOCX, XLSX — max {MAX_EMPLOYEE_FILE_BYTES / (1024 * 1024)} Mo — plusieurs fichiers acceptés
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept={ACCEPT}
                  style={{ display: 'none' }}
                  onChange={(e) => handleFiles(e.target.files)}
                />
              </div>
            </div>
          )}

          {error && (
            <div style={{
              background: '#FFEBEE', color: 'var(--red)', borderRadius: 8, padding: '8px 12px',
              fontSize: '0.82rem', marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center',
            }}
            >
              <AlertCircle size={14} /> {error}
            </div>
          )}

          {loading ? (
            <div style={{ fontSize: '0.84rem', color: 'var(--text-3)', padding: '16px 0' }}>Chargement du dossier…</div>
          ) : (
            EMP_DOC_SECTIONS.map((sectionItem) => {
              const sectionDocs = grouped[sectionItem.id] || [];
              return (
                <section key={sectionItem.id} className="rh-emp-docs-section">
                  <h3 className="rh-emp-docs-section-title">
                    <span>{sectionItem.icon}</span> {sectionItem.label}
                    <span className="rh-emp-docs-section-count">{sectionDocs.length}</span>
                  </h3>

                  {sectionDocs.length === 0 ? (
                    <div className="rh-emp-docs-empty">Aucun document dans cette catégorie.</div>
                  ) : (
                    <ul className="rh-emp-docs-list">
                      {sectionDocs.map((doc) => (
                        <li key={doc.id} className="rh-emp-docs-item">
                          <span className="rh-emp-docs-item-icon"><FileText size={16} /></span>
                          <div className="rh-emp-docs-item-main">
                            <div className="rh-emp-docs-item-name">{doc.file_name}</div>
                            <div className="rh-emp-docs-item-meta">
                              <span>{doc.doc_type_label}</span>
                              <span>·</span>
                              <span>{fmtDate(doc.created_at)}</span>
                              <span>·</span>
                              <span>{formatFileSize(doc.file_size)}</span>
                              <span>·</span>
                              <span>{formatFileType(doc.mime_type, doc.file_name)}</span>
                            </div>
                          </div>
                          <div className="rh-emp-docs-item-actions">
                            <button type="button" className="btn btn-ghost btn-sm" title="Visualiser" onClick={() => handleView(doc)}>
                              <Eye size={13} />
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" title="Télécharger" onClick={() => handleDownload(doc)}>
                              <Download size={13} />
                            </button>
                            {!readOnly && (
                              <>
                                <button type="button" className="btn btn-ghost btn-sm" title="Renommer" onClick={() => handleRename(doc)}>
                                  <Pencil size={13} />
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  title="Supprimer"
                                  onClick={() => handleDelete(doc)}
                                  style={{ color: 'var(--red)' }}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })
          )}

          {!loading && docs.length === 0 && (
            <div className="rh-emp-docs-empty-state">
              <FolderOpen size={36} style={{ color: 'var(--text-3)', marginBottom: 10 }} />
              <div style={{ fontWeight: 600, color: 'var(--text-2)' }}>Dossier vide</div>
              <div style={{ fontSize: '0.84rem', color: 'var(--text-3)', marginTop: 4 }}>
                {readOnly
                  ? 'Aucun document administratif enregistré pour cet employé.'
                  : 'Ajoutez les documents RH de cet employé via le bouton ci-dessus.'}
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
