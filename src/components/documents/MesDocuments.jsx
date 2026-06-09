/**
 * MesDocuments.jsx — GED Mes documents (Supabase document_folders + documents)
 */
import { useState, useRef, useCallback } from 'react';
import {
  FileText, Plus, Eye, Download, Share2, Trash2, Search, Filter,
  Folder, FolderOpen, Edit2, Upload, ChevronRight, X, Move,
  Loader2, RefreshCw, Home,
} from 'lucide-react';
import { useMesDocuments } from '../../hooks/useMesDocuments';
import { SYSTEM_DEPARTMENTS } from '../../services/documents/mesDocuments';
import {
  downloadDocumentFile,
  isPreviewableMime,
  getDocumentSignedUrl,
} from '../../services/documents/documentStorage';
import {
  INPUT_STYLE, SELECT_STYLE,
  KpiCard, EmptyState, Modal, FField,
  formatBytes,
} from './shared.jsx';

function fileTypeLabel(mime) {
  if (!mime) return 'Autre';
  if (mime === 'application/pdf') return 'PDF';
  if (mime.includes('word')) return 'Word';
  if (mime.includes('excel') || mime.includes('spreadsheet')) return 'Excel';
  if (mime.startsWith('image/')) return 'Image';
  if (mime.includes('zip')) return 'ZIP';
  if (mime.startsWith('video/')) return 'Video';
  return 'Autre';
}

function UploadZone({ onFiles, disabled }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFiles(files);
  }

  return (
    <div
      className="docs-upload-zone"
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragging ? 'var(--red)' : 'var(--border)'}`,
        borderRadius: 10, padding: '24px 20px', textAlign: 'center', cursor: disabled ? 'not-allowed' : 'pointer',
        background: dragging ? 'var(--red-light)' : 'var(--surface-2)', opacity: disabled ? 0.6 : 1,
        transition: 'all 0.2s', marginBottom: 16,
      }}
    >
      <Upload size={22} style={{ color: dragging ? 'var(--red)' : 'var(--text-3)', margin: '0 auto 8px', display: 'block' }} />
      <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-2)' }}>
        Glisser-déposer ou cliquer pour uploader
      </div>
      <div style={{ fontSize: '0.76rem', color: 'var(--text-3)', marginTop: 4 }}>PDF, Word, Excel, Images, ZIP — Max 50 Mo</div>
      <input ref={inputRef} type="file" multiple style={{ display: 'none' }} disabled={disabled}
        onChange={(e) => { const f = Array.from(e.target.files || []); if (f.length) onFiles(f); e.target.value = ''; }}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp,.zip,.mp4,.mov,.txt" />
    </div>
  );
}

function FolderCard({ folder, docCount, onOpen, onRename, onDelete }) {
  return (
    <div className="mes-docs-folder-card" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <div className="mes-docs-folder-icon">
        {folder.is_system ? <FolderOpen size={22} /> : <Folder size={22} />}
      </div>
      <div className="mes-docs-folder-name">{folder.name}</div>
      {folder.department && <div className="mes-docs-folder-meta">{folder.department}</div>}
      {docCount > 0 && <div className="mes-docs-folder-count">{docCount} fichier{docCount > 1 ? 's' : ''}</div>}
      {!folder.is_system && (
        <div className="mes-docs-folder-actions" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="btn btn-ghost btn-sm" title="Renommer" onClick={onRename}><Edit2 size={12} /></button>
          <button type="button" className="btn btn-ghost btn-sm" title="Supprimer" onClick={onDelete} style={{ color: 'var(--red)' }}><Trash2 size={12} /></button>
        </div>
      )}
    </div>
  );
}

function FileActions({ doc, onPreview, onDownload, onShare, onRename, onMove, onDelete, saving }) {
  return (
    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
      <button type="button" className="btn btn-secondary btn-sm" title="Aperçu" onClick={onPreview} disabled={saving}><Eye size={13} /></button>
      <button type="button" className="btn btn-ghost btn-sm" title="Télécharger" onClick={onDownload} disabled={saving}><Download size={13} /></button>
      <button type="button" className="btn btn-ghost btn-sm" title="Partager" onClick={onShare} disabled={saving || doc.is_shared}><Share2 size={13} /></button>
      <button type="button" className="btn btn-ghost btn-sm" title="Déplacer" onClick={onMove} disabled={saving}><Move size={13} /></button>
      <button type="button" className="btn btn-ghost btn-sm" title="Renommer" onClick={onRename} disabled={saving}><Edit2 size={13} /></button>
      <button type="button" className="btn btn-ghost btn-sm" title="Corbeille" onClick={onDelete} disabled={saving} style={{ color: 'var(--red)' }}><Trash2 size={13} /></button>
    </div>
  );
}

export default function MesDocuments() {
  const {
    currentFolderId, setCurrentFolderId,
    folders, documents, breadcrumb, allFolders, stats,
    loading, saving, error, configured,
    search, setSearch, filterDept, setFilterDept,
    reload, createFolder, renameFolder, removeFolder,
    uploadFiles, renameDoc, moveDoc, shareDoc, removeDoc,
  } = useMesDocuments();

  const [showFilters, setShowFilters] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [moveTarget, setMoveTarget] = useState(null);
  const [moveFolderId, setMoveFolderId] = useState('');
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');

  const handleUpload = useCallback(async (files) => {
    const result = await uploadFiles(files);
    if (result.success) setShowUpload(false);
  }, [uploadFiles]);

  async function handlePreview(doc) {
    const url = doc.file_url || await getDocumentSignedUrl(doc.file_path);
    setPreviewDoc(doc);
    setPreviewUrl(url);
  }

  async function handleNewFolder(e) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    const result = await createFolder({ name: newFolderName.trim(), parentId: currentFolderId });
    if (result.success) {
      setNewFolderName('');
      setShowNewFolder(false);
    }
  }

  async function handleRenameSubmit(e) {
    e.preventDefault();
    if (!renameTarget || !renameValue.trim()) return;
    const result = renameTarget.type === 'folder'
      ? await renameFolder(renameTarget.id, renameValue.trim())
      : await renameDoc(renameTarget.id, renameValue.trim());
    if (result.success) {
      setRenameTarget(null);
      setRenameValue('');
    }
  }

  async function handleMoveSubmit(e) {
    e.preventDefault();
    if (!moveTarget) return;
    const result = await moveDoc(moveTarget.id, moveFolderId || null);
    if (result.success) {
      setMoveTarget(null);
      setMoveFolderId('');
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">MES DOCUMENTS</h1>
          <p className="page-subtitle">Espace documentaire interne par dossiers et départements.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={reload} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} /> Actualiser
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowFilters((f) => !f)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Filter size={14} /> Filtres
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowUpload((v) => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Upload size={14} /> Upload
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowNewFolder(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Folder size={14} /> Nouveau dossier
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 16, padding: '12px 16px', borderColor: 'var(--red)', color: 'var(--red)', fontSize: '0.85rem' }}>
          {error}
          {!configured && (
            <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--text-3)' }}>
              Exécutez <code>supabase/RUN_MES_DOCUMENTS.sql</code> dans le SQL Editor Supabase.
            </div>
          )}
        </div>
      )}

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(158px, 1fr))', marginBottom: 20 }}>
        <KpiCard icon={<FileText size={17} />} label="Total documents" value={stats.total} color="grey" />
        <KpiCard icon={<Upload size={17} />} label="Ajoutés aujourd'hui" value={stats.recents} color="blue" />
        <KpiCard icon={<Upload size={17} />} label="Espace utilisé" value={formatBytes(stats.totalSize)} color="orange" />
        <KpiCard icon={<Share2 size={17} />} label="Partagés" value={stats.partages} color="green" />
      </div>

      {showFilters && (
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un fichier..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 220 }}>
              <option value="">Tous départements</option>
              {SYSTEM_DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterDept(''); }}>Réinitialiser</button>
          </div>
        </div>
      )}

      {!showFilters && (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un fichier..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
        </div>
      )}

      {/* Fil d'Ariane */}
      <div className="card" style={{ marginBottom: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: '0.84rem' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCurrentFolderId(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Home size={14} /> Accueil
        </button>
        {breadcrumb.map((f) => (
          <span key={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ChevronRight size={14} style={{ color: 'var(--text-3)' }} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCurrentFolderId(f.id)}>{f.name}</button>
          </span>
        ))}
      </div>

      {showUpload && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontWeight: 700 }}>Uploader dans {breadcrumb.length ? breadcrumb[breadcrumb.length - 1].name : 'Accueil'}</div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowUpload(false)}><X size={14} /></button>
          </div>
          <UploadZone onFiles={handleUpload} disabled={saving} />
          {saving && <div style={{ fontSize: '0.8rem', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={14} className="spin" /> Upload en cours...</div>}
        </div>
      )}

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Loader2 size={20} className="spin" /> Chargement...
        </div>
      ) : (
        <>
          {/* Grille dossiers */}
          <div className="card" style={{ marginBottom: 16, padding: 16 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Dossiers</div>
            {folders.length === 0 ? (
              <div style={{ color: 'var(--text-3)', fontSize: '0.84rem' }}>Aucun dossier ici. Créez un sous-dossier ou remontez d'un niveau.</div>
            ) : (
              <div className="mes-docs-folder-grid">
                {folders.map((f) => (
                  <FolderCard
                    key={f.id}
                    folder={f}
                    docCount={0}
                    onOpen={() => setCurrentFolderId(f.id)}
                    onRename={() => { setRenameTarget({ type: 'folder', id: f.id, name: f.name }); setRenameValue(f.name); }}
                    onDelete={async () => {
                      if (!window.confirm(`Envoyer le dossier « ${f.name} » à la corbeille ?`)) return;
                      await removeFolder(f.id);
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Fichiers — tableau desktop */}
          <div className="card mes-docs-desktop-only" style={{ padding: 0, marginBottom: 16 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Fichiers ({documents.length})
            </div>
            {documents.length === 0 ? (
              <EmptyState icon={<FileText size={24} />} title="Aucun fichier" sub="Uploadez un document dans ce dossier" action="Uploader" onAction={() => setShowUpload(true)} />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nom</th>
                      <th>Type</th>
                      <th>Taille</th>
                      <th>Département</th>
                      <th>Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((d) => (
                      <tr key={d.id}>
                        <td style={{ fontWeight: 600 }}>{d.name}</td>
                        <td data-label="Type">{fileTypeLabel(d.mime_type)}</td>
                        <td data-label="Taille">{formatBytes(d.size_bytes)}</td>
                        <td data-label="Département">{d.department || '—'}</td>
                        <td data-label="Date">{d.date_upload || '—'}</td>
                        <td>
                          <FileActions
                            doc={d}
                            saving={saving}
                            onPreview={() => handlePreview(d)}
                            onDownload={() => downloadDocumentFile(d.file_path, d.name)}
                            onShare={async () => { await shareDoc(d.id); }}
                            onRename={() => { setRenameTarget({ type: 'file', id: d.id, name: d.name }); setRenameValue(d.name); }}
                            onMove={() => { setMoveTarget(d); setMoveFolderId(d.folder_id || ''); }}
                            onDelete={async () => {
                              if (!window.confirm(`Envoyer « ${d.name} » à la corbeille ?`)) return;
                              await removeDoc(d.id);
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Fichiers — cartes mobile */}
          <div className="mes-docs-mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {documents.length === 0 ? (
              <div className="card"><EmptyState icon={<FileText size={22} />} title="Aucun fichier" sub="Uploadez un document" action="Uploader" onAction={() => setShowUpload(true)} /></div>
            ) : documents.map((d) => (
              <div key={d.id} className="card" style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <FileText size={18} style={{ color: 'var(--red)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{formatBytes(d.size_bytes)} — {d.date_upload}</div>
                  </div>
                </div>
                <FileActions
                  doc={d}
                  saving={saving}
                  onPreview={() => handlePreview(d)}
                  onDownload={() => downloadDocumentFile(d.file_path, d.name)}
                  onShare={async () => { await shareDoc(d.id); }}
                  onRename={() => { setRenameTarget({ type: 'file', id: d.id, name: d.name }); setRenameValue(d.name); }}
                  onMove={() => { setMoveTarget(d); setMoveFolderId(d.folder_id || ''); }}
                  onDelete={async () => {
                    if (!window.confirm(`Envoyer « ${d.name} » à la corbeille ?`)) return;
                    await removeDoc(d.id);
                  }}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal nouveau dossier */}
      <Modal open={showNewFolder} onClose={() => setShowNewFolder(false)} title="Nouveau dossier" width={400}>
        <form onSubmit={handleNewFolder}>
          <FField label="Nom du dossier" required>
            <input autoFocus value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Ex: Devis 2026" style={INPUT_STYLE} />
          </FField>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowNewFolder(false)}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {saving ? <Loader2 size={14} className="spin" /> : <Folder size={14} />} Créer
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal renommer */}
      <Modal open={!!renameTarget} onClose={() => setRenameTarget(null)} title="Renommer" width={400}>
        <form onSubmit={handleRenameSubmit}>
          <FField label="Nouveau nom" required>
            <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} style={INPUT_STYLE} />
          </FField>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setRenameTarget(null)}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>Enregistrer</button>
          </div>
        </form>
      </Modal>

      {/* Modal déplacer */}
      <Modal open={!!moveTarget} onClose={() => setMoveTarget(null)} title="Déplacer le fichier" width={420}>
        <form onSubmit={handleMoveSubmit}>
          <FField label="Dossier de destination">
            <select value={moveFolderId} onChange={(e) => setMoveFolderId(e.target.value)} style={SELECT_STYLE}>
              <option value="">Accueil (racine)</option>
              {allFolders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}{f.department ? ` — ${f.department}` : ''}</option>
              ))}
            </select>
          </FField>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setMoveTarget(null)}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>Déplacer</button>
          </div>
        </form>
      </Modal>

      {/* Modal aperçu */}
      <Modal open={!!previewDoc} onClose={() => { setPreviewDoc(null); setPreviewUrl(''); }} title={previewDoc?.name || 'Aperçu'} width={900}>
        {previewDoc && isPreviewableMime(previewDoc.mime_type) && previewUrl ? (
          previewDoc.mime_type.startsWith('image/') ? (
            <img src={previewUrl} alt={previewDoc.name} style={{ maxWidth: '100%', maxHeight: '70vh', display: 'block', margin: '0 auto' }} />
          ) : (
            <iframe src={previewUrl} title={previewDoc.name} style={{ width: '100%', height: '70vh', border: 'none', borderRadius: 8 }} />
          )
        ) : (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
            <FileText size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
            <div>Aperçu non disponible pour ce type de fichier.</div>
            <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 16 }} onClick={() => previewDoc && downloadDocumentFile(previewDoc.file_path, previewDoc.name)}>
              <Download size={14} /> Télécharger
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
