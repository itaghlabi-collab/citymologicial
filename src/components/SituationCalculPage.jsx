import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Loader2, X } from 'lucide-react';
import { listSubcontractors, listAssignments } from '../services/rh/subcontractors';
import { listProjects } from '../services/projects/projects';
import { PAYMENT_METHODS, PAYMENT_TYPES, PAYMENT_STATUS_UI } from '../services/rh/subcontractorConstants';
import { SITUATION_UNITS } from '../services/rh/subcontractorSituations';
import {
  createSituationAndPayment,
  previewSituationCalculation,
} from '../services/rh/subcontractorSituationPayment';
import { formatSupabaseError } from '../services/supabase/formatError';
import { isSupabaseConfigured } from '../lib/supabase';

function fmtMAD(n) {
  return Number(n || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';
}

const emptyForm = {
  subcontractorId: '',
  projectId: '',
  assignmentId: '',
  reference: '',
  designation: '',
  paymentType: 'metre',
  quantity: '',
  unit: 'm²',
  unitPrice: '',
  amount: '',
  retenues: '',
  otherDeductions: '',
  paymentMethod: 'virement',
  paymentDate: new Date().toISOString().slice(0, 10),
  statusUi: 'Payé',
  description: '',
  notes: '',
  advanceMode: 'auto',
  advanceManualAmount: '',
};

/**
 * Page pleine largeur — Nouvelle situation / Calcul de paiement.
 * Utilise calcSubPaymentTotals via previewSituationCalculation / createSituationAndPayment.
 */
export default function SituationCalculPage({
  initialSubcontractorId = '',
  onBack,
  onNotify,
  onSaved,
}) {
  const [form, setForm] = useState({ ...emptyForm, subcontractorId: initialSubcontractorId || '' });
  const [subs, setSubs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState({});

  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!form.subcontractorId) { setPreview(null); return; }
      try {
        const p = await previewSituationCalculation(form);
        if (!cancelled) setPreview(p);
      } catch {
        if (!cancelled) setPreview(null);
      }
    })();
    return () => { cancelled = true; };
  }, [form]);

  function validate() {
    const e = {};
    if (!form.subcontractorId) e.subcontractorId = 'Requis';
    if (!form.projectId) e.projectId = 'Requis';
    if (!form.designation?.trim()) e.designation = 'Requis';
    if (form.paymentType === 'metre') {
      if (!(Number(form.quantity) > 0)) e.quantity = 'Quantité requise';
      if (!(Number(form.unitPrice) > 0)) e.unitPrice = 'PU requis';
    } else if (!(Number(form.amount) > 0)) {
      e.amount = 'Montant requis';
    }
    setErr(e);
    return !Object.keys(e).length;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const result = await createSituationAndPayment(form);
      onNotify?.('success', `Situation enregistrée — net ${fmtMAD(result.netPaid)}`);
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
        <h1 className="page-title">Nouvelle situation / Calcul de paiement</h1>
        <p className="page-subtitle">Réutilise les formules net existantes (brut − avances − retenues)</p>
      </div>

      <form onSubmit={handleSubmit} className="st-calcul-form">
        <section className="card st-calcul-section">
          <h2 className="st-calcul-section-title">1 — Sous-traitant</h2>
          <div className="st-calcul-grid">
            <label>
              Sous-traitant *
              <select value={form.subcontractorId} onChange={(e) => setF('subcontractorId', e.target.value)} style={err.subcontractorId ? { borderColor: 'var(--red)' } : undefined}>
                <option value="">Choisir…</option>
                {subs.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
              </select>
            </label>
            <div>
              <div className="st-calcul-meta-label">Corps de métier</div>
              <div className="st-calcul-meta-value">{selectedSub?.fonction || '—'}</div>
            </div>
            <div>
              <div className="st-calcul-meta-label">Téléphone</div>
              <div className="st-calcul-meta-value">{selectedSub?.telephone || '—'}</div>
            </div>
            <div>
              <div className="st-calcul-meta-label">Projets actifs</div>
              <div className="st-calcul-meta-value">{selectedSub?.activeProjectsCount ?? '—'}</div>
            </div>
            <div>
              <div className="st-calcul-meta-label">Avance globale dispo.</div>
              <div className="st-calcul-meta-value" style={{ color: '#E65100' }}>{fmtMAD(preview?.reliquatAvance)}</div>
            </div>
            <div>
              <div className="st-calcul-meta-label">Solde global</div>
              <div className="st-calcul-meta-value">{fmtMAD(selectedSub?.remaining)}</div>
            </div>
          </div>
        </section>

        <section className="card st-calcul-section">
          <h2 className="st-calcul-section-title">2 — Projet et prestation</h2>
          <div className="st-calcul-grid">
            <label>
              Projet *
              <select value={form.projectId} onChange={(e) => setF('projectId', e.target.value)}>
                <option value="">Choisir…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.ref ? `${p.ref} — ${p.nom}` : p.nom}</option>
                ))}
              </select>
            </label>
            <label>
              Affectation (optionnel)
              <select value={form.assignmentId} onChange={(e) => setF('assignmentId', e.target.value)}>
                <option value="">—</option>
                {assignments.map((a) => (
                  <option key={a.id} value={a.id}>{a.projectName || a.projectRef}</option>
                ))}
              </select>
            </label>
            <label>
              Référence situation
              <input value={form.reference} onChange={(e) => setF('reference', e.target.value)} placeholder="Auto si vide" />
            </label>
            <label>
              Type de paiement
              <select value={form.paymentType} onChange={(e) => setF('paymentType', e.target.value)}>
                {PAYMENT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
            <label className="st-calcul-span2">
              Désignation *
              <input value={form.designation} onChange={(e) => setF('designation', e.target.value)} />
            </label>
            {form.paymentType === 'metre' ? (
              <>
                <label>
                  Quantité *
                  <input type="number" min="0" step="0.01" value={form.quantity} onChange={(e) => setF('quantity', e.target.value)} />
                </label>
                <label>
                  Unité
                  <select value={form.unit} onChange={(e) => setF('unit', e.target.value)}>
                    {SITUATION_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </label>
                <label>
                  Prix unitaire *
                  <input type="number" min="0" step="0.01" value={form.unitPrice} onChange={(e) => setF('unitPrice', e.target.value)} />
                </label>
              </>
            ) : (
              <label>
                Montant *
                <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setF('amount', e.target.value)} />
              </label>
            )}
            <div>
              <div className="st-calcul-meta-label">Montant brut calculé</div>
              <div className="st-calcul-meta-value" style={{ fontWeight: 800 }}>{fmtMAD(preview?.gross)}</div>
            </div>
          </div>
        </section>

        <section className="card st-calcul-section">
          <h2 className="st-calcul-section-title">3 — Avance disponible</h2>
          <div className="st-calcul-kpi-row">
            <div><span>Avances versées</span><strong>{fmtMAD(preview?.avancesVersees)}</strong></div>
            <div><span>Déjà consommées</span><strong>{fmtMAD(preview?.avancesConsommees)}</strong></div>
            <div><span>Reliquat</span><strong style={{ color: '#E65100' }}>{fmtMAD(preview?.reliquatAvance)}</strong></div>
          </div>
          <div className="st-calcul-advance-modes">
            {[
              { id: 'auto', label: 'Utiliser automatiquement le maximum disponible' },
              { id: 'manual', label: 'Saisir manuellement le montant à imputer' },
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
              Montant à imputer
              <input type="number" min="0" step="0.01" value={form.advanceManualAmount} onChange={(e) => setF('advanceManualAmount', e.target.value)} />
            </label>
          )}
          <p style={{ fontSize: '0.8rem', color: 'var(--text-3)', marginTop: 8 }}>
            L’imputation est analytique uniquement — aucune écriture de caisse supplémentaire.
          </p>
        </section>

        <section className="card st-calcul-section">
          <h2 className="st-calcul-section-title">4 — Retenues et déductions</h2>
          <div className="st-calcul-grid">
            <label>
              Retenues
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
          <h2 className="st-calcul-section-title">5 — Résultat</h2>
          <div className="st-calcul-result-grid">
            <div><span>Montant brut</span><strong>{fmtMAD(preview?.gross)}</strong></div>
            <div><span>Avance imputée</span><strong style={{ color: '#E65100' }}>{fmtMAD(preview?.avances)}</strong></div>
            <div><span>Retenues</span><strong style={{ color: '#C62828' }}>{fmtMAD(preview?.retenues)}</strong></div>
            <div><span>Net à payer</span><strong style={{ color: '#2E7D32', fontSize: '1.15rem' }}>{fmtMAD(preview?.net)}</strong></div>
            <div><span>Reliquat après calcul</span><strong>{fmtMAD(preview?.reliquatApres)}</strong></div>
            <div><span>Solde situation après paiement</span><strong>{fmtMAD(preview?.soldeSituationApres)}</strong></div>
          </div>
          <div className="st-calcul-actions">
            <button type="button" className="btn btn-secondary" onClick={onBack}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer la situation'}
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}
