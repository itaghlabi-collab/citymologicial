/**
 * ComparaisonDevis.jsx — Comparatif intégré aux demandes d'achat (workflow CITYMO)
 * Les devis sont saisis dans chaque demande ; cette vue agrège les comparatifs pour le DG.
 */
import { useState, useEffect, useCallback } from 'react';
import { BarChart2, Eye, Loader2, RefreshCw, ChevronLeft } from 'lucide-react';
import { listPurchaseRequests } from '../../services/achats/purchaseRequests';
import { listQuotesForRequest } from '../../services/achats/purchaseWorkflow';
import { projectOptionLabel } from '../../services/achats/purchaseRequests';
import { useAuth } from '../../hooks/useAuth';
import { resolveCurrentPurchaseRole, purchasePermissions } from '../../services/achats/purchaseWorkflowRoles';
import { validateSupplierQuote } from '../../services/achats/purchaseWorkflow';
import { BADGE_DEMANDE, formatMAD, KpiCard, EmptyState } from './shared.jsx';

const COMPARE_STATUSES = ['Devis reçus', 'En validation DG', 'Validée', 'Ordre d\'achat créé'];

function InlineCompare({ request, quotes, onValidate, canValidate, validatingId }) {
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="flex-between" style={{ marginBottom: 10 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, color: 'var(--red)' }}>{request.ref}</div>
          <div style={{ fontWeight: 600 }}>{request.titre}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>
            {projectOptionLabel({ ref: request.project_ref, nom: request.project_name })} — {request.requester_name || '—'}
          </div>
        </div>
        <span className={`badge ${BADGE_DEMANDE[request.statut] || 'badge-grey'}`}>{request.statut}</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fournisseur</th><th>HT</th><th>TVA</th><th>TTC</th><th>Délai</th><th>Garantie</th><th>Conditions</th>
              {canValidate && <th>Action</th>}
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.id} style={q.selected ? { background: 'rgba(46,125,50,0.08)' } : undefined}>
                <td style={{ fontWeight: 700 }}>{q.supplier_name}{q.selected ? ' ✓' : ''}</td>
                <td>{formatMAD(q.montant_ht)}</td>
                <td>{q.tva_rate}%</td>
                <td style={{ fontWeight: 700 }}>{formatMAD(q.montant_ttc)}</td>
                <td>{q.delai || '—'}</td>
                <td>{q.garantie || '—'}</td>
                <td>{q.conditions_paiement || '—'}</td>
                {canValidate && (
                  <td>
                    {!q.selected && !q.verrouille && ['Devis reçus', 'En validation DG'].includes(request.statut) && (
                      <button type="button" className="btn btn-primary btn-sm" disabled={validatingId === q.id} onClick={() => onValidate(request.id, q.id)}>
                        Valider ce fournisseur
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ComparaisonDevis({ onOpenDemande }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [quotesMap, setQuotesMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null);
  const [validatingId, setValidatingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listPurchaseRequests();
      const withQuotes = rows.filter((r) => COMPARE_STATUSES.includes(r.statut));
      const qMap = {};
      await Promise.all(withQuotes.map(async (r) => {
        qMap[r.id] = await listQuotesForRequest(r.id);
      }));
      setItems(withQuotes.filter((r) => (qMap[r.id] || []).length > 0));
      setQuotesMap(qMap);
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
    setValidatingId(quoteId);
    try {
      await validateSupplierQuote(requestId, quoteId);
      await load();
    } finally {
      setValidatingId(null);
    }
  }

  const enAttente = items.filter((x) => ['Devis reçus', 'En validation DG'].includes(x.statut)).length;

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div>
          <h1 className="page-title">COMPARAISON DEVIS</h1>
          <p className="page-subtitle">
            Comparatif automatique des devis enregistrés dans les demandes d&apos;achat.
            Les devis se saisissent dans chaque demande (onglet Demandes d&apos;achat).
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} /> Actualiser
        </button>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', marginBottom: 20 }}>
        <KpiCard icon={<BarChart2 size={17} />} label="Comparatifs actifs" value={items.length} color="blue" />
        <KpiCard icon={<Eye size={17} />} label="En attente validation DG" value={enAttente} color="orange" />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}><Loader2 size={22} className="cin-spin" /></div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<BarChart2 size={24} />}
          title="Aucun comparatif"
          sub="Les devis saisis par la Chargée d'Achats dans une demande apparaîtront ici automatiquement."
        />
      ) : (
        items.map((r) => (
          <InlineCompare
            key={r.id}
            request={r}
            quotes={quotesMap[r.id] || []}
            canValidate={perms.canValidateSupplier}
            validatingId={validatingId}
            onValidate={handleValidate}
          />
        ))
      )}
    </div>
  );
}
