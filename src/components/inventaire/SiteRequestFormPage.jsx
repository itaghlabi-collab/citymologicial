/**
 * SiteRequestFormPage.jsx — Page création / édition demande chantier (style devis CITYMO)
 */
import { ChevronLeft, Loader2, CheckCircle, FileText } from 'lucide-react';
import SiteRequestForm from './SiteRequestForm.jsx';

export default function SiteRequestFormPage({
  editId,
  form,
  setForm,
  lines,
  setLines,
  projects,
  stockArticles,
  saving,
  error,
  onBack,
  onSave,
}) {
  const isEdit = !!editId;

  return (
    <div className="animate-fade-in site-request-form-page">
      <style>{`
        .site-request-form-page .devis-doc-header { box-shadow: 0 2px 12px rgba(0,0,0,0.04); }
        @media (max-width: 960px) {
          .site-request-form-grid { grid-template-columns: 1fr !important; }
          .site-request-form-page .devis-doc-header > div:first-child { grid-template-columns: 1fr !important; }
          .site-request-form-page .devis-doc-header > div:first-child > div:first-child {
            border-right: none !important;
            border-bottom: 1px solid var(--border);
          }
        }
      `}</style>

      <button
        type="button"
        onClick={onBack}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
          cursor: 'pointer', color: 'var(--text-2)', fontSize: '0.875rem', fontWeight: 600,
          marginBottom: 16, padding: 0,
        }}
      >
        <ChevronLeft size={16} /> Retour aux demandes
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>
            {isEdit ? 'Modifier la demande chantier' : 'Nouvelle demande chantier'}
          </h1>
          <p className="page-subtitle">
            Bon de demande matériel — consommables, équipements et EPI pour le chantier
          </p>
        </div>
      </div>

      {error && (
        <div style={{
          background: '#FFEBEE', color: 'var(--red)', border: '1px solid rgba(211,47,47,0.25)',
          borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', marginBottom: 16,
        }}
        >
          {error}
        </div>
      )}

      <SiteRequestForm
        form={form}
        setForm={setForm}
        lines={lines}
        setLines={setLines}
        projects={projects}
        stockArticles={stockArticles}
        layout="page"
      />

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end',
        marginTop: 20, paddingTop: 16, borderTop: '2px solid var(--border)',
      }}
      >
        <button type="button" className="btn btn-ghost" onClick={onBack} disabled={saving}>
          Annuler
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => onSave(false)}
          disabled={saving}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 160, justifyContent: 'center' }}
        >
          {saving ? <Loader2 size={14} className="spin" /> : <FileText size={14} />}
          Enregistrer brouillon
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => onSave(true)}
          disabled={saving}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 200, justifyContent: 'center' }}
        >
          {saving ? <Loader2 size={14} className="spin" /> : <CheckCircle size={14} />}
          Soumettre au magasin
        </button>
      </div>
    </div>
  );
}
