/**
 * SiteRequestManualFormPage — Demande matériel hors catalogue
 * Formulaire dédié (ne touche pas SiteRequestForm / catalogue).
 */
import { useState } from 'react';
import { ChevronLeft, Loader2, CheckCircle, FileText, Plus, Trash2 } from 'lucide-react';
import { SITE_REQUEST_PRIORITES, SITE_REQUEST_UNITS } from '../../constants/siteMaterialRequests';
import { INPUT_STYLE, SELECT_STYLE } from './shared.jsx';

function Label({ children, required }) {
  return (
    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {children}{required ? ' *' : ''}
    </label>
  );
}

export function emptyManualLine(order = 0) {
  return {
    category_id: 'autres',
    article_name: '',
    quantite_demandee: '',
    quantite_preparee: 0,
    quantite_livree: 0,
    unite: 'u',
    remarque: '',
    date_souhaitee: '',
    is_custom: true,
    line_order: order,
  };
}

export function buildManualLines(existing = []) {
  const customs = (existing || []).filter((l) => l.is_custom || !l.article_id);
  if (!customs.length) return [emptyManualLine(0)];
  return customs.map((l, idx) => ({
    ...emptyManualLine(idx),
    ...l,
    quantite_demandee: l.quantite_demandee ?? '',
    date_souhaitee: l.date_souhaitee || '',
    remarque: l.remarque || '',
    is_custom: true,
    category_id: 'autres',
    line_order: idx,
  }));
}

export default function SiteRequestManualFormPage({
  editId,
  form,
  setForm,
  lines,
  setLines,
  projects,
  saving,
  error,
  onBack,
  onSave,
  lockProject = false,
  backLabel = 'Retour aux demandes',
}) {
  const [localError, setLocalError] = useState('');
  const isEdit = !!editId;

  function onProjectChange(projectId) {
    const p = projects.find((x) => String(x.id) === String(projectId));
    setForm((f) => ({
      ...f,
      project_id: projectId || '',
      project_ref: p?.ref || '',
      project_name: p?.nom || p?.name || '',
      client_name: p?.client || p?.client_nom || '',
      chef_projet: p?.chef_projet || p?.responsable || f.chef_projet,
      chef_chantier: p?.chef_chantier || f.chef_chantier,
    }));
  }

  function updateLine(idx, patch) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyManualLine(prev.length)]);
  }

  function removeLine(idx) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  function validateAndSave(submitAfter) {
    setLocalError('');
    if (!form.project_id) {
      setLocalError('Sélectionnez un projet.');
      return;
    }
    const cleaned = lines
      .map((l, idx) => ({
        ...l,
        article_name: String(l.article_name || '').trim(),
        quantite_demandee: Number(l.quantite_demandee) || 0,
        is_custom: true,
        category_id: 'autres',
        line_order: idx,
      }))
      .filter((l) => l.article_name && l.quantite_demandee > 0);

    // Fusionner les désignations en double (même nom)
    const byName = new Map();
    cleaned.forEach((l) => {
      const key = l.article_name.toLowerCase();
      const prev = byName.get(key);
      if (!prev) {
        byName.set(key, { ...l });
        return;
      }
      prev.quantite_demandee = (Number(prev.quantite_demandee) || 0) + (Number(l.quantite_demandee) || 0);
      prev.quantite_preparee = Math.max(Number(prev.quantite_preparee) || 0, Number(l.quantite_preparee) || 0);
      prev.remarque = prev.remarque || l.remarque;
    });
    const merged = [...byName.values()].map((l, idx) => ({ ...l, line_order: idx }));

    if (!merged.length) {
      setLocalError('Ajoutez au moins une ligne avec désignation et quantité.');
      return;
    }
    setLines(merged);
    onSave(submitAfter, merged);
  }

  const displayError = localError || error;

  return (
    <div className="animate-fade-in site-request-manual-page">
      <button
        type="button"
        onClick={onBack}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
          cursor: 'pointer', color: 'var(--text-2)', fontSize: '0.875rem', fontWeight: 600,
          marginBottom: 16, padding: 0,
        }}
      >
        <ChevronLeft size={16} /> {backLabel}
      </button>

      <div style={{ marginBottom: 16 }}>
        <h1 className="page-title" style={{ marginBottom: 4 }}>
          {isEdit ? 'Modifier la demande manuelle' : 'Demande manuelle de matériel'}
        </h1>
        <p className="page-subtitle">
          Matériel hors catalogue — même circuit magasinier que les demandes stock.
        </p>
        <span className="badge badge-orange" style={{ marginTop: 8, display: 'inline-flex' }}>Demande manuelle</span>
      </div>

      {displayError && (
        <div style={{
          background: '#FFEBEE', color: 'var(--red)', border: '1px solid rgba(211,47,47,0.25)',
          borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', marginBottom: 16,
        }}
        >
          {displayError}
        </div>
      )}

      <div className="card" style={{ padding: '20px 22px', marginBottom: 16 }}>
        <div style={{
          fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)',
          textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14,
        }}
        >
          Informations chantier
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
          <div>
            <Label required>Projet</Label>
            <select value={form.project_id || ''} onChange={(e) => onProjectChange(e.target.value)} style={SELECT_STYLE} disabled={lockProject} required>
              <option value="">— Sélectionner un projet —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.ref} — {p.nom || p.name}</option>)}
            </select>
          </div>
          <div>
            <Label>Client</Label>
            <input value={form.client_name || ''} readOnly style={{ ...INPUT_STYLE, background: '#F5F5F5' }} />
          </div>
          <div>
            <Label>Chef de projet</Label>
            <input value={form.chef_projet || ''} onChange={(e) => setForm((f) => ({ ...f, chef_projet: e.target.value }))} style={INPUT_STYLE} />
          </div>
          <div>
            <Label>Chef de chantier</Label>
            <input value={form.chef_chantier || ''} onChange={(e) => setForm((f) => ({ ...f, chef_chantier: e.target.value }))} style={INPUT_STYLE} />
          </div>
          <div>
            <Label>Date de la demande</Label>
            <input type="date" value={form.date_demande || ''} onChange={(e) => setForm((f) => ({ ...f, date_demande: e.target.value }))} style={INPUT_STYLE} />
          </div>
          <div>
            <Label>Priorité</Label>
            <select value={form.priorite || 'Normale'} onChange={(e) => setForm((f) => ({ ...f, priorite: e.target.value }))} style={SELECT_STYLE}>
              {SITE_REQUEST_PRIORITES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <Label>Observations générales</Label>
          <textarea
            value={form.observation || ''}
            onChange={(e) => setForm((f) => ({ ...f, observation: e.target.value }))}
            style={{ ...INPUT_STYLE, minHeight: 64, resize: 'vertical' }}
            placeholder="Contexte, urgence, livraison…"
          />
        </div>
      </div>

      <div className="card" style={{ padding: '20px 22px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{
            fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)',
            textTransform: 'uppercase', letterSpacing: '0.1em',
          }}
          >
            Lignes de matériel
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={addLine}>
            <Plus size={14} /> Ajouter une ligne
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {lines.map((line, idx) => (
            <div
              key={line.id || `manual-${idx}`}
              style={{
                border: '1px solid var(--border)', borderRadius: 10, padding: 14,
                display: 'grid', gridTemplateColumns: 'minmax(160px, 2fr) 90px 90px 140px minmax(140px, 1.5fr) 40px',
                gap: 10, alignItems: 'end',
              }}
              className="sr-manual-line"
            >
              <div>
                <Label required>Désignation</Label>
                <input
                  value={line.article_name || ''}
                  onChange={(e) => updateLine(idx, { article_name: e.target.value })}
                  style={INPUT_STYLE}
                  placeholder="Ex. Perforateur Bosch"
                />
              </div>
              <div>
                <Label required>Qté</Label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.quantite_demandee}
                  onChange={(e) => updateLine(idx, { quantite_demandee: e.target.value })}
                  style={INPUT_STYLE}
                />
              </div>
              <div>
                <Label>Unité</Label>
                <select value={line.unite || 'u'} onChange={(e) => updateLine(idx, { unite: e.target.value })} style={SELECT_STYLE}>
                  {SITE_REQUEST_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <Label>Date souhaitée</Label>
                <input
                  type="date"
                  value={line.date_souhaitee || ''}
                  onChange={(e) => updateLine(idx, { date_souhaitee: e.target.value })}
                  style={INPUT_STYLE}
                />
              </div>
              <div>
                <Label>Observation</Label>
                <input
                  value={line.remarque || ''}
                  onChange={(e) => updateLine(idx, { remarque: e.target.value })}
                  style={INPUT_STYLE}
                  placeholder="Optionnel"
                />
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                title="Supprimer la ligne"
                style={{ color: 'var(--red)', marginBottom: 2 }}
                onClick={() => removeLine(idx)}
                disabled={lines.length <= 1}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        <style>{`
          @media (max-width: 900px) {
            .sr-manual-line {
              grid-template-columns: 1fr 1fr !important;
            }
          }
        `}</style>
      </div>

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end',
        marginTop: 8, paddingTop: 16, borderTop: '2px solid var(--border)',
      }}
      >
        <button type="button" className="btn btn-ghost" onClick={onBack} disabled={saving}>Annuler</button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => validateAndSave(false)}
          disabled={saving}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 160, justifyContent: 'center' }}
        >
          {saving ? <Loader2 size={14} className="spin" /> : <FileText size={14} />}
          Enregistrer brouillon
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => validateAndSave(true)}
          disabled={saving}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 160, justifyContent: 'center' }}
        >
          {saving ? <Loader2 size={14} className="spin" /> : <CheckCircle size={14} />}
          Soumettre
        </button>
      </div>
    </div>
  );
}
