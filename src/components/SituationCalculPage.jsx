import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Loader2, Plus, Trash2, X } from 'lucide-react';
import { listSubcontractors, listAssignments } from '../services/rh/subcontractors';
import { listProjects } from '../services/projects/projects';
import { PAYMENT_METHODS, PAYMENT_TYPES, PAYMENT_STATUS_UI } from '../services/rh/subcontractorConstants';
import { SITUATION_UNITS } from '../services/rh/subcontractorSituations';
import {
  createMultiProjectSituation,
  previewSituationCalculation,
} from '../services/rh/subcontractorSituationPayment';
import { formatSupabaseError } from '../services/supabase/formatError';
import { isSupabaseConfigured } from '../lib/supabase';

function fmtMAD(n) {
  return Number(n || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';
}

function emptyLine() {
  return {
    key: `l-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    projectId: '',
    assignmentId: '',
    designation: '',
    paymentType: 'metre',
    quantity: '',
    unit: 'm²',
    unitPrice: '',
    amount: '',
  };
}

const emptyForm = {
  subcontractorId: '',
  reference: '',
  retenues: '',
  otherDeductions: '',
  paymentMethod: 'virement',
  paymentDate: new Date().toISOString().slice(0, 10),
  statusUi: 'Payé',
  description: '',
  notes: '',
  advanceMode: 'auto',
  advanceManualAmount: '',
  lines: [emptyLine()],
};

/**
 * Page pleine largeur — situation / travaux multi-projets.
 * Plusieurs lignes projet dans la même situation (groupId partagé).
 */
export default function SituationCalculPage({
  initialSubcontractorId = '',
  onBack,
  onNotify,
  onSaved,
}) {
  const [form, setForm] = useState({
    ...emptyForm,
    subcontractorId: initialSubcontractorId || '',
    lines: [emptyLine()],
  });
  const [subs, setSubs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState({});

  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const setLine = (key, patch) => {
    setForm((p) => ({
      ...p,
      lines: p.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    }));
  };

  const addLine = () => setForm((p) => ({ ...p, lines: [...p.lines, emptyLine()] }));

  const removeLine = (key) => {
    setForm((p) => ({
      ...p,
      lines: p.lines.length <= 1 ? p.lines : p.lines.filter((l) => l.key !== key),
    }));
  };

  const loadBase = useCallback(async () => {
    if (!isSupabaseConfigured()) { setLoading(false); return; }
    setLoading(true);
    try {
      const [s, p] = await Promise.all([listSubcontractors(), listProjects().catch(() => [])]);
      setSubs(s || []);
      setProjects(p || []);
    } catch (e) {
      onNotify?.('error', formatSupabaseError(e, 'Erreur chargement.'));
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => { loadBase(); }, [loadBase]);

  useEffect(() => {
    if (!form.subcontractorId) { setAssignments([]); return; }
    listAssignments(form.subcontractorId)
      .then(setAssignments)
      .catch(() => setAssignments([]));
  }, [form.subcontractorId]);

  const selectedSub = useMemo(
    () => subs.find((s) => s.id === form.subcontractorId) || null,
    [subs, form.subcontractorId],
  );

  const previewPayload = useMemo(() => ({
    subcontractorId: form.subcontractorId,
    advanceMode: form.advanceMode,
    advanceManualAmount: form.advanceManualAmount,
    retenues: form.retenues,
    otherDeductions: form.otherDeductions,
    lines: form.lines.map((l, i) => ({
      ...l,
      retenues: i === 0 ? form.retenues : 0,
      otherDeductions: i === 0 ? form.otherDeductions : 0,
    })),
  }), [form]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!form.subcontractorId) { setPreview(null); return; }
      try {
        const p = await previewSituationCalculation(previewPayload);
        if (!cancelled) setPreview(p);
      } catch {
        if (!cancelled) setPreview(null);
      }
    })();
    return () => { cancelled = true; };
  }, [form.subcontractorId, previewPayload]);

  function validate() {
    const e = {};
    if (!form.subcontractorId) e.subcontractorId = 'Requis';
    form.lines.forEach((l, i) => {
      if (!l.projectId) e[`line_${i}_project`] = 'Projet requis';
      if (!l.designation?.trim()) e[`line_${i}_designation`] = 'Désignation requise';
      if (l.paymentType === 'metre') {
        if (!(Number(l.quantity) > 0)) e[`line_${i}_quantity`] = 'Quantité requise';
        if (!(Number(l.unitPrice) > 0)) e[`line_${i}_unitPrice`] = 'PU requis';
      } else if (!(Number(l.amount) > 0)) {
        e[`line_${i}_amount`] = 'Montant requis';
      }
    });
    setErr(e);
    return !Object.keys(e).length;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const result = await createMultiProjectSituation({
        ...form,
        lines: form.lines.map((l, i) => ({
          ...l,
          retenues: i === 0 ? form.retenues : 0,
          otherDeductions: i === 0 ? form.otherDeductions : 0,
        })),
      });
      const n = result.results?.length || 1;
      onNotify?.(
        'success',
        n > 1
          ? `Situation multi-projets enregistrée (${n} lignes) — net ${fmtMAD(result.netPaid)}`
          : `Situation enregistrée — net ${fmtMAD(result.netPaid)}`,
      );
      onSaved?.(result);
      onBack?.();
    } catch (ex) {
      onNotify?.('error', formatSupabaseError(ex, 'Erreur enregistrement situation.'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="animate-fade-in rh-ext-page" style={{ textAlign: 'center', padding: 48 }}>
        <Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div className="animate-fade-in rh-ext-page st-calcul-page">
      <div className="rh-ext-back-bar">
        <button type="button" className="rh-ext-back-btn" onClick={onBack}>
          <ChevronLeft size={16} /> Retour
        </button>
        <button type="button" className="rh-ext-back-close" onClick={onBack} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <X size={20} />
        </button>
      </div>

      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-title">Situation / Travaux multi-projets</h1>
        <p className="page-subtitle">
          Ajoutez des travaux sur plusieurs projets dans la même situation. Net = brut − avances − retenues.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="st-calcul-form">
        <section className="card st-calcul-section">
          <h2 className="st-calcul-section-title">1 — Sous-traitant</h2>
          <div className="st-calcul-grid">
            <label>
              Sous-traitant *
              <select
                value={form.subcontractorId}
                onChange={(e) => setF('subcontractorId', e.target.value)}
                style={err.subcontractorId ? { borderColor: 'var(--red)' } : undefined}
              >
                <option value="">Choisir…</option>
                {subs.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
              </select>
            </label>
            <label>
              Référence situation
              <input value={form.reference} onChange={(e) => setF('reference', e.target.value)} placeholder="Auto si vide" />
            </label>
            <div>
              <div className="st-calcul-meta-label">Corps de métier</div>
              <div className="st-calcul-meta-value">{selectedSub?.fonction || '—'}</div>
            </div>
            <div>
              <div className="st-calcul-meta-label">Avance globale dispo.</div>
              <div className="st-calcul-meta-value" style={{ color: '#E65100' }}>{fmtMAD(preview?.reliquatAvance)}</div>
            </div>
            <div>
              <div className="st-calcul-meta-label">Solde global</div>
              <div className="st-calcul-meta-value">{fmtMAD(selectedSub?.remaining)}</div>
            </div>
            <div>
              <div className="st-calcul-meta-label">Lignes projet</div>
              <div className="st-calcul-meta-value">{form.lines.length}</div>
            </div>
          </div>
        </section>

        <section className="card st-calcul-section">
          <div className="flex-between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <h2 className="st-calcul-section-title" style={{ margin: 0 }}>2 — Travaux par projet</h2>
            <button type="button" className="btn btn-secondary btn-sm" onClick={addLine}>
              <Plus size={14} /> Ajouter un projet
            </button>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-3)', margin: '0 0 12px' }}>
            Chaque ligne = un projet / prestation. Toutes les lignes forment une seule situation (avance partagée FIFO).
          </p>

          {form.lines.map((line, idx) => (
            <div key={line.key} className="st-calcul-work-line">
              <div className="st-calcul-work-line-head">
                <strong>Ligne {idx + 1}</strong>
                {form.lines.length > 1 && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeLine(line.key)} aria-label="Supprimer la ligne">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div className="st-calcul-grid">
                <label>
                  Projet *
                  <select
                    value={line.projectId}
                    onChange={(e) => setLine(line.key, { projectId: e.target.value })}
                    style={err[`line_${idx}_project`] ? { borderColor: 'var(--red)' } : undefined}
                  >
                    <option value="">Choisir…</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.ref ? `${p.ref} — ${p.nom}` : p.nom}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Affectation (optionnel)
                  <select
                    value={line.assignmentId}
                    onChange={(e) => setLine(line.key, { assignmentId: e.target.value })}
                  >
                    <option value="">—</option>
                    {assignments
                      .filter((a) => !line.projectId || String(a.projectId) === String(line.projectId))
                      .map((a) => (
                        <option key={a.id} value={a.id}>{a.projectName || a.projectRef}</option>
                      ))}
                  </select>
                </label>
                <label>
                  Type de paiement
                  <select
                    value={line.paymentType}
                    onChange={(e) => setLine(line.key, { paymentType: e.target.value })}
                  >
                    {PAYMENT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </label>
                <label className="st-calcul-span2">
                  Désignation *
                  <input
                    value={line.designation}
                    onChange={(e) => setLine(line.key, { designation: e.target.value })}
                    style={err[`line_${idx}_designation`] ? { borderColor: 'var(--red)' } : undefined}
                  />
                </label>
                {line.paymentType === 'metre' ? (
                  <>
                    <label>
                      Quantité *
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.quantity}
                        onChange={(e) => setLine(line.key, { quantity: e.target.value })}
                      />
                    </label>
                    <label>
                      Unité
                      <select value={line.unit} onChange={(e) => setLine(line.key, { unit: e.target.value })}>
                        {SITUATION_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </label>
                    <label>
                      Prix unitaire *
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitPrice}
                        onChange={(e) => setLine(line.key, { unitPrice: e.target.value })}
                      />
                    </label>
                  </>
                ) : (
                  <label>
                    Montant *
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.amount}
                      onChange={(e) => setLine(line.key, { amount: e.target.value })}
                    />
                  </label>
                )}
                <div>
                  <div className="st-calcul-meta-label">Brut (ligne)</div>
                  <div className="st-calcul-meta-value" style={{ fontWeight: 800 }}>
                    {fmtMAD(preview?.linePreviews?.[idx]?.gross)}
                  </div>
                </div>
              </div>
            </div>
          ))}

          <button type="button" className="btn btn-secondary btn-sm" onClick={addLine} style={{ marginTop: 8 }}>
            <Plus size={14} /> Ajouter un autre projet
          </button>
        </section>

        <section className="card st-calcul-section">
          <h2 className="st-calcul-section-title">3 — Avance disponible (partagée)</h2>
          <div className="st-calcul-kpi-row">
            <div><span>Avances versées</span><strong>{fmtMAD(preview?.avancesVersees)}</strong></div>
            <div><span>Déjà consommées</span><strong>{fmtMAD(preview?.avancesConsommees)}</strong></div>
            <div><span>Reliquat</span><strong style={{ color: '#E65100' }}>{fmtMAD(preview?.reliquatAvance)}</strong></div>
          </div>
          <div className="st-calcul-advance-modes">
            {[
              { id: 'auto', label: 'Utiliser automatiquement le maximum disponible (FIFO sur les lignes)' },
              { id: 'manual', label: 'Saisir manuellement le montant total à imputer' },
              { id: 'none', label: 'Ne pas utiliser l’avance sur cette situation' },
            ].map((m) => (
              <label key={m.id} className="st-calcul-radio">
                <input
                  type="radio"
                  name="advanceMode"
                  checked={form.advanceMode === m.id}
                  onChange={() => setF('advanceMode', m.id)}
                />
                {m.label}
              </label>
            ))}
          </div>
          {form.advanceMode === 'manual' && (
            <label style={{ maxWidth: 240, display: 'block', marginTop: 10 }}>
              Montant total à imputer
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.advanceManualAmount}
                onChange={(e) => setF('advanceManualAmount', e.target.value)}
              />
            </label>
          )}
          <p style={{ fontSize: '0.8rem', color: 'var(--text-3)', marginTop: 8 }}>
            L’imputation est analytique uniquement — aucune écriture de caisse supplémentaire.
          </p>
        </section>

        <section className="card st-calcul-section">
          <h2 className="st-calcul-section-title">4 — Retenues et paiement</h2>
          <div className="st-calcul-grid">
            <label>
              Retenues (situation)
              <input type="number" min="0" step="0.01" value={form.retenues} onChange={(e) => setF('retenues', e.target.value)} />
            </label>
            <label>
              Autres déductions
              <input type="number" min="0" step="0.01" value={form.otherDeductions} onChange={(e) => setF('otherDeductions', e.target.value)} />
            </label>
            <label className="st-calcul-span2">
              Observation
              <input value={form.notes} onChange={(e) => setF('notes', e.target.value)} />
            </label>
            <label>
              Mode de paiement
              <select value={form.paymentMethod} onChange={(e) => setF('paymentMethod', e.target.value)}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label>
              Date
              <input type="date" value={form.paymentDate} onChange={(e) => setF('paymentDate', e.target.value)} />
            </label>
            <label>
              Statut paiement
              <select value={form.statusUi} onChange={(e) => setF('statusUi', e.target.value)}>
                {PAYMENT_STATUS_UI.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
        </section>

        <section className="card st-calcul-section st-calcul-result">
          <h2 className="st-calcul-section-title">5 — Résultat (toutes les lignes)</h2>
          <div className="st-calcul-result-grid">
            <div><span>Montant brut</span><strong>{fmtMAD(preview?.gross)}</strong></div>
            <div><span>Avance imputée</span><strong style={{ color: '#E65100' }}>{fmtMAD(preview?.avances)}</strong></div>
            <div><span>Retenues</span><strong style={{ color: '#C62828' }}>{fmtMAD(preview?.retenues)}</strong></div>
            <div><span>Net à payer</span><strong style={{ color: '#2E7D32', fontSize: '1.15rem' }}>{fmtMAD(preview?.net)}</strong></div>
            <div><span>Reliquat après calcul</span><strong>{fmtMAD(preview?.reliquatApres)}</strong></div>
            <div><span>Projets dans la situation</span><strong>{form.lines.length}</strong></div>
          </div>
          <div className="st-calcul-actions">
            <button type="button" className="btn btn-secondary" onClick={onBack}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving
                ? 'Enregistrement…'
                : form.lines.length > 1
                  ? `Enregistrer la situation (${form.lines.length} projets)`
                  : 'Enregistrer la situation'}
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}
