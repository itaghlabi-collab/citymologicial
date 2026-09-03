import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { listProjectDocuments, formatFileSize } from '../../services/projects/projectDocuments';
import { isAllowedProjectFile } from '../../services/projects/projectStorage';
import { FabModal, FabField, FAB_INPUT, FAB_TEXTAREA } from './shared';
import './fabrication.css';

export default function TransmettrePlanModal({ open, onClose, projet, onSubmit, saving }) {
  const [designation, setDesignation] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [docs, setDocs] = useState([]);
  const [docId, setDocId] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [loadingDocs, setLoadingDocs] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDesignation('');
    setCommentaire('');
    setDocId('');
    setFile(null);
    setError('');
    if (!projet?.id) return;
    setLoadingDocs(true);
    listProjectDocuments(projet.id)
      .then((rows) => setDocs(rows || []))
      .catch(() => setDocs([]))
      .finally(() => setLoadingDocs(false));
  }, [open, projet?.id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const existingDocument = docs.find((d) => d.id === docId) || null;
    if (!String(designation).trim()) {
      setError('L’objet / désignation est obligatoire.');
      return;
    }
    if (!file && !existingDocument) {
      setError('Sélectionnez un document projet ou joignez un fichier.');
      return;
    }
    if (file && !isAllowedProjectFile(file)) {
      setError('Fichier non autorisé ou trop volumineux (max 20 Mo).');
      return;
    }
    const result = await onSubmit({
      project: projet,
      designation,
      commentaire,
      file: existingDocument ? null : file,
      existingDocument,
    });
    if (!result?.success) {
      setError(result?.error || 'Erreur transmission.');
      return;
    }
    onClose();
  }

  return (
    <FabModal open={open} onClose={onClose} title="Transmettre à Fabrication" width={560}>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FabField label="Projet">
            <input style={FAB_INPUT} value={projet?.nom || ''} readOnly disabled />
          </FabField>
          <FabField label="Objet / désignation" required>
            <input
              style={FAB_INPUT}
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              placeholder="Ex. Placards + portes RDC"
            />
          </FabField>
          <FabField label="Plan / fichier existant">
            {loadingDocs ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-3)' }}>Chargement des documents…</div>
            ) : (
              <select
                style={{ ...FAB_INPUT, cursor: 'pointer' }}
                value={docId}
                onChange={(e) => { setDocId(e.target.value); if (e.target.value) setFile(null); }}
              >
                <option value="">— Joindre un nouveau fichier —</option>
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.file_name} {d.category ? `(${d.category})` : ''} {d.file_size ? `· ${formatFileSize(d.file_size)}` : ''}
                  </option>
                ))}
              </select>
            )}
          </FabField>
          <FabField label="Ou joindre un fichier">
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.txt"
              disabled={Boolean(docId)}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </FabField>
          <FabField label="Commentaire">
            <textarea
              style={FAB_TEXTAREA}
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              placeholder="Consignes optionnelles pour le responsable de site"
            />
          </FabField>
          {error ? <div style={{ color: 'var(--red)', fontSize: '0.84rem' }}>{error}</div> : null}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <Loader2 size={14} /> : null} Transmettre à Fabrication
            </button>
          </div>
        </div>
      </form>
    </FabModal>
  );
}
