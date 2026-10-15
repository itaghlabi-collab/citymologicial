import { useState } from 'react';
import { Download, Eye, FileText, Image as ImageIcon, X } from 'lucide-react';
import { formatFileSize } from '../../services/projects/projectDocuments';
import { isImageFile, isPdfFile } from './shared';

export function downloadUrl(file) {
  if (!file?.url) return '';
  const sep = file.url.includes('?') ? '&' : '?';
  return `${file.url}${sep}download=${encodeURIComponent(file.file_name || 'plan')}`;
}

/** Liste de fichiers de plan avec aperçu (PDF / image) et téléchargement. */
export default function FilePreviewList({ files = [], onRemove, removable = false, compact = false }) {
  const [preview, setPreview] = useState(null);

  if (!files.length) {
    return <div style={{ fontSize: '0.84rem', color: 'var(--text-3)' }}>Aucun fichier</div>;
  }

  return (
    <>
      <div className={`fab-files${compact ? ' is-compact' : ''}`}>
        {files.map((f) => (
          <div key={f.id || f.storage_path || f.file_name} className="fab-file">
            <button
              type="button"
              className="fab-file-thumb"
              onClick={() => f.url && setPreview(f)}
              disabled={!f.url}
              title="Aperçu"
            >
              {isImageFile(f) && f.url
                ? <img src={f.url} alt={f.file_name} />
                : (isImageFile(f) ? <ImageIcon size={20} /> : <FileText size={20} />)}
            </button>
            <div className="fab-file-body">
              <div className="fab-file-name" title={f.file_name}>{f.file_name || 'Fichier'}</div>
              {f.file_size ? <div className="fab-file-meta">{formatFileSize(f.file_size)}</div> : null}
              <div className="fab-file-actions">
                {f.url ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPreview(f)}>
                    <Eye size={13} /> Aperçu
                  </button>
                ) : null}
                {f.url ? (
                  <a className="btn btn-ghost btn-sm" href={downloadUrl(f)} rel="noreferrer">
                    <Download size={13} /> Télécharger
                  </a>
                ) : null}
                {removable && onRemove ? (
                  <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => onRemove(f)}>
                    <X size={13} /> Retirer
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      {preview ? (
        <div className="fab-modal-overlay fab-preview-overlay" role="presentation" onClick={(e) => e.target === e.currentTarget && setPreview(null)}>
          <div className="fab-preview-box" role="dialog" aria-modal="true">
            <div className="fab-modal-head">
              <div className="fab-modal-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {preview.file_name}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <a className="btn btn-ghost btn-sm" href={downloadUrl(preview)} rel="noreferrer"><Download size={14} /></a>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPreview(null)} aria-label="Fermer"><X size={16} /></button>
              </div>
            </div>
            <div className="fab-preview-body">
              {isImageFile(preview) ? (
                <img src={preview.url} alt={preview.file_name} />
              ) : isPdfFile(preview) ? (
                <iframe src={preview.url} title={preview.file_name} />
              ) : (
                <div style={{ padding: 40, textAlign: 'center' }}>
                  <a className="btn btn-primary" href={preview.url} target="_blank" rel="noreferrer">Ouvrir le fichier</a>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
