/**
 * ComparaisonDevis.jsx — Tableau comparatif agrégé (workflow Achats)
 */
import { useState, useEffect, useCallback } from 'react';
import { BarChart2, Eye, Loader2, RefreshCw, CheckCircle } from 'lucide-react';
import { listAllQuotesForComparison } from '../../services/achats/purchaseRequestQuotes';
import { validateSupplierQuote } from '../../services/achats/purchaseWorkflow';
import { projectOptionLabel } from '../../services/achats/purchaseRequests';
import { useAuth } from '../../hooks/useAuth';
import { resolveCurrentPurchaseRole, purchasePermissions } from '../../services/achats/purchaseWorkflowRoles';
import { canValidateQuoteOnRequest } from '../../constants/purchaseWorkflow';
import { BADGE_DEMANDE, formatMAD, KpiCard, EmptyState } from './shared.jsx';

export default function ComparaisonDevis({ onOpenDemande }) {
  const { user } = useAuth();
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null);
  const [validatingId, setValidatingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listAllQuotesForComparison();
      setQuotes(rows);
    } catch (err) {
      console.error('[CITYMO] ComparaisonDevis', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    resolveCurrentPurchaseRole(user).then(setRole);
  }, [load, user]);

  const perms = purchasePermissions(role);

  async function handleValidate(requestId, quoteId) {
    if (!window.confirm('Valider ce devis fournisseur ? Les autres devis seront verrouillés.')) return;
    setValidatingId(quoteId);
    try {
      await validateSupplierQuote(requestId, quoteId);
      await load();
    } catch (err) {
      window.alert(err.message || 'Erreur validation');
    } finally {
      setValidatingId(null);
    }
  }

  const enAttente = quotes.filter((q) => canValidateQuoteOnRequest(q.request_statut) && !q.selected && !q.verrouille).length;
  const retenus = quotes.filter((q) => q.selected).length;

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div>
          <h1 className="page-title">COMPARAISON DEVIS</h1>
          <p className="page-subtitle">
            Tous les devis enregistrés dans les demandes d&apos;achat — validation DG depuis ce tableau.
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} /> Actualiser
        </button>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', marginBottom: 20 }}>
        <KpiCard icon={<BarChart2 size={17} />} label="Devis enregistrés" value={quotes.length} color="blue" />
        <KpiCard icon={<Eye size={17} />} label="En attente validation" value={enAttente} color="orange" />
        <KpiCard icon={<CheckCircle size={17} />} label="Devis retenus" value={retenus} color="green" />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}><Loader2 size={22} className="cin-spin" /></div>
      ) : quotes.length === 0 ? (
        <EmptyState
          icon={<BarChart2 size={24} />}
          title="Aucun devis"
          sub="Les devis saisis par la Chargée d'Achats dans une demande apparaîtront ici automatiquement."
        />
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Demande</th>
                  <th>Projet</th>
                  <th>Fournisseur</th>
                  <th>Réf. devis</th>
                  <th>HT</th>
                  <th>TVA</th>
                  <th>TTC</th>
                  <th>Délai</th>
                  <th>Conditions paiement</th>
                  <th>Statut demande</th>
                  <th>Retenu</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => {
                  const canValidate = perms.canValidateSupplier
                    && canValidateQuoteOnRequest(q.request_statut)
                    && !q.selected
                    && !q.verrouille;
                  return (
                    <tr key={q.id} style={q.selected ? { background: 'rgba(46,125,50,0.08)' } : undefined}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--red)', fontSize: '0.82rem' }}>{q.request_ref}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{q.request_titre}</div>
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>
                        {q.project_ref ? projectOptionLabel({ ref: q.project_ref, nom: q.project_name }) : '—'}
                      </td>
                      <td style={{ fontWeight: 600 }}>{q.supplier_name}</td>
                      <td>{q.ref_devis || '—'}</td>
                      <td>{formatMAD(q.montant_ht)}</td>
                      <td>{q.tva_rate}%</td>
                      <td style={{ fontWeight: 700 }}>{formatMAD(q.montant_ttc)}</td>
                      <td>{q.delai || '—'}</td>
                      <td>{q.conditions_paiement || '—'}</td>
                      <td>
                        <span className={`badge ${BADGE_DEMANDE[q.request_statut] || 'badge-grey'}`} style={{ fontSize: '0.7rem' }}>
                          {q.request_statut}
                        </span>
                      </td>
                      <td>{q.selected ? 'Oui' : 'Non'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {onOpenDemande && (
                            <button type="button" className="btn btn-ghost btn-sm" title="Voir demande" onClick={() => onOpenDemande(q.request_id)}>
                              <Eye size={13} />
                            </button>
                          )}
                          {canValidate && (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={validatingId === q.id}
                              onClick={() => handleValidate(q.request_id, q.id)}
                            >
                              {validatingId === q.id ? <Loader2 size={12} className="cin-spin" /> : 'Valider'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
