/**
 * ProjectDocuments.jsx — Upload / liste fichiers projet (PDF, images, Office)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, FileText, Trash2, ExternalLink, Image as ImageIcon, AlertCircle } from 'lucide-react';
import {
  listProjectDocuments,
  addProjectDocument,
  deleteProjectDocument,
  formatFileSize,
  DOC_CATEGORIES,
} from '../../services/projects/projectDocuments';
import { isAllowedProjectFile, MAX_PROJECT_FILE_BYTES } from '../../services/projects/projectStorage';

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif,.txt';

function FileIcon({ mime }) {
  if (mime?.startsWith('image/')) return <ImageIcon size={18} />;
  return <FileText size={18} />;
}

export default function ProjectDocuments({ projectId, compact = false }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('autre');
  const inputRef = useRef(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const rows = await listProjectDocuments(projectId);
      setDocs(rows);
    } catch (err) {
      setError(err.message || 'Impossible de charger les fichiers.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function handleFiles(fileList) {
    if (!projectId || !fileList?.length) return;
    setUploading(true);
    setError('');
    try {
      for (const file of Array.from(fileList)) {
        if (!isAllowedProjectFile(file)) {
          throw new Error(`« ${file.name} » : type non autorisé ou > ${MAX_PROJECT_FILE_BYTES / (1024 * 1024)} Mo.`);
        }
        await addProjectDocument(projectId, file, category);
      }
      await load();
    } catch (err) {
      setError(err.message || 'Erreur lors de l\'upload.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Supprimer ce fichier ?')) return;
    try {
      await deleteProjectDocument(id);
      setDocs(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      setError(err.message || 'Erreur suppression.');
    }
  }

  if (!projectId) {
    return (
      <div style={{ background: 'var(--surface-2)', border: '2px dashed var(--border)', borderRadius: 8, padding: '16px 18px', color: 'var(--text-3)', fontSize: '0.84rem', textAlign: 'center' }}>
        Enregistrez le projet pour ajouter des fichiers (PDF, images, documents).
      </div>
    );
  }

  const inputStyle = {
    width: '100%', padding: '8px 11px', border: '1.5px solid var(--border)',
    borderRadius: 6, fontSize: '0.86rem', background: '#fff', boxSizing: 'border-box',
  };

  return (
    <div>
      {!compact && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase' }}>Catégorie</label>
          <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...inputStyle, maxWidth: 220, cursor: 'pointer' }}>
            {DOC_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        onClick={() => !uploading && inputRef.current?.click()}
        onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--red)'; }}
        onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
        onDrop={e => {
          e.preventDefault();
          e.currentTarget.style.borderColor = 'var(--border)';
          handleFiles(e.dataTransfer.files);
        }}
        style={{
          background: 'var(--surface-2)', border: '2px dashed var(--border)', borderRadius: 8,
          padding: compact ? '14px 16px' : '22px 20px', marginBottom: 14, textAlign: 'center',
          cursor: uploading ? 'wait' : 'pointer', transition: 'border-color 0.15s',
        }}
      >
        <Upload size={22} style={{ color: 'var(--text-3)', margin: '0 auto 8px', display: 'block' }} />
        <div style={{ fontSize: '0.84rem', color: 'var(--text-2)', fontWeight: 600 }}>
          {uploading ? 'Envoi en cours...' : 'Cliquez ou déposez des fichiers ici'}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 4 }}>
          PDF, images, Word, Excel — max {MAX_PROJECT_FILE_BYTES / (1024 * 1024)} Mo
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />
      </div>

      {error && (
        <div style={{ background: '#FFEBEE', color: 'var(--red)', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem', marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: '0.84rem', color: 'var(--text-3)', padding: '8px 0' }}>Chargement des fichiers...</div>
      ) : docs.length === 0 ? (
        <div style={{ fontSize: '0.84rem', color: 'var(--text-3)' }}>Aucun fichier pour ce projet.</div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {docs.map(d => (
            <li key={d.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              border: '1px solid var(--border)', borderRadius: 8, background: '#fff',
            }}>
              <span style={{ color: 'var(--red)', flexShrink: 0 }}><FileIcon mime={d.mime_type} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.file_name}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>
                  {DOC_CATEGORIES.find(c => c.value === d.category)?.label || d.category}
                  {' · '}{formatFileSize(d.file_size)}
                </div>
              </div>
              {d.url && (
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" title="Ouvrir">
                  <ExternalLink size={14} />
                </a>
              )}
              <button type="button" className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => handleDelete(d.id)} style={{ color: 'var(--red)' }}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
