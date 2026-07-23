import { Handshake, Plus, Loader2, X, Search, ChevronRight } from 'lucide-react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSubcontractorPaymentForm } from '../hooks/useSubcontractorPaymentForm';
import SubcontractorPaymentFormBody from './SubcontractorPaymentFormBody';
import {
  createPaymentBatch,
} from '../services/rh/subcontractors';
import { paymentStatusToDb } from '../services/rh/subcontractorConstants';
import {
  validateSubcontractorPaymentForm,
  buildSubcontractorPaymentPayload,
} from '../utils/rh/subcontractorPaymentFormUtils';
import { listSubcontractorAccounts } from '../services/rh/subcontractorAccount';
import { formatSupabaseError } from '../services/supabase/formatError';
import { isSupabaseConfigured } from '../lib/supabase';

function fmtMAD(n) {
  return Number(n || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';
}

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('fr-MA'); } catch { return iso; }
}

/**
 * Liste des comptes sous-traitants (1 ligne / ST) + modal Nouveau paiement inchangé.
 * variant="payments" conserve l’ancienne liste paiements (non utilisé en Situation).
 */
export default function PaiementSousTraitantsSection({
  onNotify,
  standalone = false,
  onOpenAccount,
  variant = 'accounts',
  accountsOverride = null,
  skipRemoteLoad = false,
}) {
  const [showModal, setShowModal] = useState(false);
  const [accounts, setAccounts] = useState(accountsOverride || []);
  const [loading, setLoading] = useState(!accountsOverride && !skipRemoteLoad);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const paymentForm = useSubcontractorPaymentForm({ active: showModal });

  const loadAccounts = useCallback(async () => {
    if (skipRemoteLoad || accountsOverride) {
      setAccounts(accountsOverride || []);
      setLoading(false);
      return;
    }
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await listSubcontractorAccounts();
      setAccounts(rows);
    } catch (err) {
      onNotify?.('error', formatSupabaseError(err, 'Erreur chargement comptes sous-traitants.'));
    } finally {
      setLoading(false);
    }
  }, [onNotify, skipRemoteLoad, accountsOverride]);

  useEffect(() => {
    if (variant === 'accounts') loadAccounts();
  }, [variant, loadAccounts]);

  function openCreate() {
    paymentForm.resetForm();
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const err = validateSubcontractorPaymentForm(paymentForm.form, paymentForm.paymentSelectedLines);
    if (Object.keys(err).length) {
      paymentForm.setFormErr(err);
      return;
    }
    setSaving(true);
    try {
      const { shared, lines } = buildSubcontractorPaymentPayload(
        paymentForm.form,
        paymentForm.paymentSelectedLines,
        paymentStatusToDb,
      );
      await createPaymentBatch(paymentForm.form.projectId, shared, lines);
      onNotify?.('success', `${lines.length} paiement(s) sous-traitant enregistré(s) — ${fmtMAD(paymentForm.paymentBatchTotal)}`);
      setShowModal(false);
      paymentForm.resetForm();
      await loadAccounts();
    } catch (err) {
      onNotify?.('error', formatSupabaseError(err, 'Erreur enregistrement paiement sous-traitant.'));
    } finally {
      setSaving(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) =>
      (a.fullName || '').toLowerCase().includes(q)
      || (a.fonction || '').toLowerCase().includes(q)
      || (a.currentProject || '').toLowerCase().includes(q),
    );
  }, [accounts, search]);

  const totals = useMemo(() => ({
    count: accounts.length,
    paye: accounts.reduce((s, a) => s + (Number(a.kpis?.montantsPayes) || 0), 0),
    reste: accounts.reduce((s, a) => s + (Number(a.kpis?.resteAPayer) || 0), 0),
  }), [accounts]);

  return (
    <div className="card rh-ext-table-card" style={standalone ? {} : { marginTop: 24 }}>
      <div className="flex-between finance-page-header" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div className={standalone ? 'rh-ext-hide-mobile' : undefined}>
          <div className="card-title" style={{ marginBottom: 4 }}>
            <Handshake size={16} /> Comptes sous-traitants
          </div>
          <p className="rh-ext-hide-mobile" style={{ margin: 0, fontSize: '0.83rem', color: 'var(--text-3)' }}>
            Une ligne par sous-traitant — ouvrir la fiche compte pour le détail, l’historique et les documents
          </p>
        </div>
        <div className="finance-page-actions finance-page-actions--solo">
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Plus size={15} /> Nouveau paiement
          </button>
        </div>
      </div>

      <div className="stat-grid rh-ext-stat-grid finance-kpi-strip">
        <div className="stat-card">
          <div className="stat-body">
            <div className="stat-value" style={{ fontSize: '0.95rem' }}>{loading ? '—' : totals.count}</div>
            <div className="stat-label">Sous-traitants</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-body">
            <div className="stat-value" style={{ fontSize: '0.95rem', color: '#2E7D32' }}>{loading ? '—' : fmtMAD(totals.paye)}</div>
            <div className="stat-label">Total payé (nets)</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-body">
            <div className="stat-value" style={{ fontSize: '0.95rem', color: totals.reste > 0 ? '#C62828' : undefined }}>
              {loading ? '—' : fmtMAD(totals.reste)}
            </div>
            <div className="stat-label">Reste à payer</div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 14, maxWidth: 360 }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un sous-traitant…"
            style={{ width: '100%', padding: '8px 10px 8px 32px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px' }} />
          Chargement…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)', fontSize: '0.88rem' }}>
          {accounts.length === 0
            ? 'Aucun compte sous-traitant. Créez un paiement ou activez un sous-traitant.'
            : 'Aucun résultat pour cette recherche.'}
        </div>
      ) : (
        <div className="table-wrap" style={standalone ? { padding: 0 } : undefined}>
          <table>
            <thead>
              <tr>
                <th>Sous-traitant</th>
                <th>Métier</th>
                <th>Projets</th>
                <th>Travaux</th>
                <th>Avances imputées</th>
                <th>Payé</th>
                <th>Reste</th>
                <th>Dernière op.</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="rh-ext-compact-row">
                  <td data-label="Sous-traitant" style={{ fontWeight: 600 }}>
                    <button
                      type="button"
                      onClick={() => onOpenAccount?.(a.id)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600,
                        color: 'var(--text)', padding: 0, textDecoration: 'underline', textUnderlineOffset: 2,
                      }}
                    >
                      {a.fullName || '—'}
                    </button>
                  </td>
                  <td data-label="Métier">{a.fonction || '—'}</td>
                  <td data-label="Projets">{a.kpis?.nombreProjets ?? a.activeProjectsCount ?? 0}</td>
                  <td data-label="Travaux">{fmtMAD(a.kpis?.travauxRealises)}</td>
                  <td data-label="Avances" style={{ color: '#E65100' }}>{fmtMAD(a.kpis?.avancesConsommees)}</td>
                  <td data-label="Payé" style={{ fontWeight: 700, color: '#2E7D32' }}>{fmtMAD(a.kpis?.montantsPayes)}</td>
                  <td data-label="Reste" style={{ color: (a.kpis?.resteAPayer || 0) > 0 ? '#C62828' : undefined }}>
                    {fmtMAD(a.kpis?.resteAPayer)}
                  </td>
                  <td data-label="Dernière op.">{fmtDate(a.kpis?.derniereOperation)}</td>
                  <td data-label="Statut">
                    <span className={`badge ${a.statut === 'actif' ? 'badge-green' : 'badge-grey'}`}>
                      {a.statut === 'actif' ? 'Actif' : (a.statut || '—')}
                    </span>
                  </td>
                  <td data-label="Actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenAccount?.(a.id)}>
                      Compte <ChevronRight size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="rh-ext-modal-overlay">
          <div className="card rh-ext-modal-box rh-ext-modal-box--lg">
            <div className="flex-between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <button type="button" className="rh-ext-back-btn" onClick={() => setShowModal(false)} aria-label="Retour" style={{ marginBottom: 8 }}>
                  ← Retour aux comptes
                </button>
                <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem', margin: 0 }}>
                  Paiement sous-traitant
                </h2>
              </div>
              <button type="button" onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', minWidth: 44, minHeight: 44 }} aria-label="Fermer">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <SubcontractorPaymentFormBody {...paymentForm} />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
