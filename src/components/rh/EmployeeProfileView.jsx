/**
 * EmployeeProfileView.jsx — Fiche récap complète employé (lecture seule)
 */
import { useState, useEffect, useCallback } from 'react';
import { X, Eye, Download, FileText, FolderOpen, Loader2 } from 'lucide-react';
import { employeeFullName } from '../../services/rh/employees';
import {
  listEmployeeDocuments,
  groupDocumentsBySection,
  formatFileSize,
  EMP_DOC_SECTIONS,
} from '../../services/rh/employeeDocuments';

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch {
    return String(d).slice(0, 10) || '—';
  }
}

function fmtMAD(n) {
  const num = Number(n);
  if (isNaN(num)) return '—';
  return `${num.toLocaleString('fr-MA')} MAD`;
}

function InfoRow({ label, value }) {
  return (
    <div className="rh-emp-profile-field">
      <div className="rh-emp-profile-label">{label}</div>
      <div className="rh-emp-profile-value">{value || '—'}</div>
    </div>
  );
}

export default function EmployeeProfileView({ employee, onClose, onOpenDocuments }) {
  const [docs, setDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [docsError, setDocsError] = useState('');

  const loadDocs = useCallback(async () => {
    if (!employee?.id) return;
    setLoadingDocs(true);
    setDocsError('');
    try {
      const rows = await listEmployeeDocuments(employee.id);
      setDocs(rows);
    } catch (err) {
      setDocsError(err.message || 'Impossible de charger les documents.');
    } finally {
      setLoadingDocs(false);
    }
  }, [employee?.id]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  if (!employee) return null;

  const fullName = employeeFullName(employee);
  const grouped = groupDocumentsBySection(docs);

  function handleViewDoc(doc) {
    if (!doc.url) return;
    window.open(doc.url, '_blank', 'noopener,noreferrer');
  }

  function handleDownloadDoc(doc) {
    if (!doc.url) return;
    const a = document.createElement('a');
    a.href = doc.url;
    a.download = doc.file_name || 'document';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <>
      <div className="rh-emp-modal-overlay" onClick={onClose} aria-hidden="true" />
      <aside className="rh-emp-profile-drawer" role="dialog" aria-label={`Fiche employé — ${fullName}`}>
        <header className="rh-emp-docs-drawer-header">
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Fiche employé
            </div>
            <h2 className="rh-emp-docs-drawer-title">{fullName || '—'}</h2>
          </div>
          <button type="button" className="rh-emp-modal-close" onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </header>

        <div className="rh-emp-profile-body">
          <section className="rh-emp-profile-section">
            <h3 className="rh-emp-profile-section-title">Identité</h3>
            <div className="rh-emp-profile-grid">
              <InfoRow label="Nom" value={employee.lastname} />
              <InfoRow label="Prénom" value={employee.firstname} />
              <InfoRow label="Email" value={employee.email} />
              <InfoRow label="Téléphone" value={employee.telephone} />
              <InfoRow label="CIN" value={employee.numero_cin} />
              <InfoRow label="CNSS" value={employee.cnss} />
              <InfoRow label="Date de naissance" value={fmtDate(employee.date_naissance)} />
            </div>
          </section>

          <section className="rh-emp-profile-section">
            <h3 className="rh-emp-profile-section-title">Poste & contrat</h3>
            <div className="rh-emp-profile-grid">
              <InfoRow label="Poste" value={employee.poste} />
              <InfoRow label="Département" value={employee.department} />
              <InfoRow label="Date d'embauche" value={fmtDate(employee.date_embauche)} />
              <InfoRow label="Type de contrat" value={employee.type_contrat} />
              <InfoRow label="Statut" value={employee.statut} />
              <InfoRow label="Salaire" value={fmtMAD(employee.salaire)} />
            </div>
          </section>

          <section className="rh-emp-profile-section">
            <h3 className="rh-emp-profile-section-title">Coordonnées & banque</h3>
            <div className="rh-emp-profile-grid">
              <InfoRow label="Adresse" value={employee.adresse} />
              <InfoRow label="Banque" value={employee.banque} />
              <InfoRow label="RIB" value={employee.rib} />
              <InfoRow label="Contact d'urgence" value={employee.contact_urgence} />
              <InfoRow label="Situation familiale" value={employee.situation_familiale} />
            </div>
          </section>

          <section className="rh-emp-profile-section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
              <h3 className="rh-emp-profile-section-title" style={{ margin: 0 }}>Documents liés</h3>
              {onOpenDocuments && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenDocuments}>
                  <FolderOpen size={13} /> Gérer le dossier
                </button>
              )}
            </div>

            {loadingDocs ? (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-3)' }}>
                <Loader2 size={18} className="cin-spin" /> Chargement des documents…
              </div>
            ) : docsError ? (
              <div style={{ color: 'var(--red)', fontSize: '0.84rem' }}>{docsError}</div>
            ) : docs.length === 0 ? (
              <div style={{ fontSize: '0.84rem', color: 'var(--text-3)' }}>Aucun document enregistré.</div>
            ) : (
              EMP_DOC_SECTIONS.map((section) => {
                const sectionDocs = grouped[section.id] || [];
                if (!sectionDocs.length) return null;
                return (
                  <div key={section.id} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 6 }}>
                      {section.label}
                    </div>
                    {sectionDocs.map((doc) => (
                      <div key={doc.id} className="rh-emp-profile-doc-row">
                        <FileText size={14} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {doc.file_name}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>
                            {formatFileSize(doc.file_size)} — {fmtDate(doc.created_at)}
                          </div>
                        </div>
                        <button type="button" className="btn btn-ghost btn-sm" title="Voir" onClick={() => handleViewDoc(doc)}>
                          <Eye size={12} />
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" title="Télécharger" onClick={() => handleDownloadDoc(doc)}>
                          <Download size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
