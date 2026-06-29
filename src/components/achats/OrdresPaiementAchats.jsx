/**
 * OrdresPaiementAchats.jsx — Ordres de paiement liés au workflow Achats
 */
import { useState, useEffect, useCallback } from 'react';
import {
  CreditCard, Eye, Search, ChevronLeft, Loader2, RefreshCw,
  CheckCircle, DollarSign, FileText, History, Send,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { resolveCurrentPurchaseRole, purchasePermissions } from '../../services/achats/purchaseWorkflowRoles';
import {
  listAchatsPaymentOrders,
  getAchatsPaymentOrder,
  updateAchatsPaymentOrder,
  validateAchatsPaymentOrder,
  markAchatsPaymentOrderPaid,
  submitAchatsPaymentForDgValidation,
} from '../../services/achats/purchasePaymentOrdersAchats';
import { listPurchaseRequestHistory } from '../../services/achats/purchaseRequestHistory';
import {
  INPUT_STYLE, SELECT_STYLE, STATUTS_OP_ACHATS, BADGE_OP_ACHATS,
  MODES_PAIEMENT, KpiCard, EmptyState, SectionTitle, FField, FRow, formatMAD, Modal,
} from './shared.jsx';

function DetailOP({ op, history, onBack, perms, onAction, saving }) {
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({
    mode_paiement: op.mode_paiement || 'Virement',
    date_prevue: op.date_prevue || op.date || '',
    observation: op.observation || '',
    commentaire: op.commentaire || '',
  });

  return (
    <div className="animate-fade-in">
      <button type="button" className="btn btn-ghost btn-sm" style={{ marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={onBack}>
        <ChevronLeft size={15} /> Retour
      </button>
      <div className="flex-between" style={{ marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>{op.ref}</h1>
          <p className="page-subtitle">{op.motif || op.beneficiaire}</p>
        </div>
        <span className={`badge ${BADGE_OP_ACHATS[op.statut] || 'badge-grey'}`}>{op.statut}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>
        <div className="card">
          <SectionTitle icon={<CreditCard size={12} />}>Informations</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: '0.84rem' }}>
            {[
              ['Demande d\'achat', op.purchase_request_ref || '—'],
              ['Ordre d\'achat', op.purchase_oa_ref || '—'],
              ['Fournisseur', op.fournisseur_lie || op.beneficiaire],
              ['HT', formatMAD(op.montant_ht)],
              ['TVA', `${op.tva_rate ?? 20}%`],
              ['TTC', formatMAD(op.montant_ttc || op.montant)],
              ['Mode paiement', op.mode_paiement || '—'],
              ['Date prévue', op.date_prevue || op.date || '—'],
            ].map(([l, v]) => (
              <div key={l}>
                <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>{l}</span>
                <div style={{ fontWeight: 600 }}>{v || '—'}</div>
              </div>
            ))}
          </div>
          {op.observation && (
            <div style={{ marginTop: 14, padding: 10, background: 'var(--surface-2)', borderRadius: 8, fontSize: '0.84rem' }}>
              {op.observation}
            </div>
          )}
        </div>

        <div className="card">
          <SectionTitle>Actions</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditMode((v) => !v)}>
              Modifier
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.print()}>
              <FileText size={13} /> Télécharger PDF
            </button>
            {op.statut === 'À préparer' && (
              <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => onAction('submit', op.id)}>
                <Send size={13} /> Soumettre validation DG
              </button>
            )}
            {perms.canValidatePayment && op.statut === 'En attente validation DG' && (
              <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => onAction('validate', op.id)}>
                <CheckCircle size={13} /> Valider DG
              </button>
            )}
            {['Validé', 'En attente validation DG'].includes(op.statut) && perms.canValidatePayment && (
              <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => onAction('paid', op.id)}>
                <DollarSign size={13} /> Marquer payé
              </button>
            )}
          </div>
        </div>
      </div>

      {editMode && (
        <div className="card" style={{ marginTop: 16 }}>
          <SectionTitle>Modifier</SectionTitle>
          <FRow>
            <FField label="Mode de paiement">
              <select value={form.mode_paiement} onChange={(e) => setForm((p) => ({ ...p, mode_paiement: e.target.value }))} style={SELECT_STYLE}>
                {MODES_PAIEMENT.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </FField>
            <FField label="Date prévue paiement">
              <input type="date" value={form.date_prevue} onChange={(e) => setForm((p) => ({ ...p, date_prevue: e.target.value }))} style={INPUT_STYLE} />
            </FField>
          </FRow>
          <FField label="Observations">
            <textarea value={form.observation} onChange={(e) => setForm((p) => ({ ...p, observation: e.target.value }))} style={{ ...INPUT_STYLE, minHeight: 60 }} />
          </FField>
          <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => onAction('update', op.id, form)}>
            Enregistrer
          </button>
        </div>
      )}

      {history.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <SectionTitle icon={<History size={12} />}>Historique lié (demande d&apos;achat)</SectionTitle>
          {history.slice(0, 10).map((h) => (
            <div key={h.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--surface-2)', fontSize: '0.82rem' }}>
              <strong>{h.action}</strong> — {h.date_label} {h.time_label}
              {h.detail && <div style={{ color: 'var(--text-2)' }}>{h.detail}</div>}
              {h.commentaire && <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{h.commentaire}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrdresPaiementAchats() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [history, setHistory] = useState([]);
  const [role, setRole] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await listAchatsPaymentOrders();
      setItems(rows);
    } catch (err) {
      setError(err.message || 'Erreur chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    resolveCurrentPurchaseRole(user).then(setRole);
  }, [load, user]);

  const perms = purchasePermissions(role);

  async function openDetail(id) {
    setDetailId(id);
    try {
      const op = await getAchatsPaymentOrder(id);
      setDetail(op);
      if (op?.purchase_request_id) {
        const h = await listPurchaseRequestHistory(op.purchase_request_id);
        setHistory(h.filter((x) => x.action?.toLowerCase().includes('paiement') || x.action?.toLowerCase().includes('ordre')));
      } else {
        setHistory([]);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAction(type, id, form) {
    setSaving(true);
    try {
      const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Utilisateur';
      if (type === 'validate') await validateAchatsPaymentOrder(id, userName);
      else if (type === 'paid') await markAchatsPaymentOrderPaid(id, userName);
      else if (type === 'submit') await submitAchatsPaymentForDgValidation(id);
      else if (type === 'update') await updateAchatsPaymentOrder(id, form);
      await load();
      if (detailId === id) await openDetail(id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const filtered = items.filter((o) => {
    const q = search.toLowerCase();
    return (!q || o.ref?.toLowerCase().includes(q) || o.beneficiaire?.toLowerCase().includes(q) || o.purchase_request_ref?.toLowerCase().includes(q))
      && (!filterStatut || o.statut === filterStatut);
  });

  if (detailId && detail) {
    return (
      <DetailOP
        op={detail}
        history={history}
        onBack={() => { setDetailId(null); setDetail(null); }}
        perms={perms}
        onAction={handleAction}
        saving={saving}
      />
    );
  }

  const aPreparer = items.filter((o) => o.statut === 'À préparer').length;
  const enAttente = items.filter((o) => o.statut === 'En attente validation DG').length;
  const payes = items.filter((o) => o.statut === 'Payé').length;

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">ORDRES DE PAIEMENT — ACHATS</h1>
          <p className="page-subtitle">Créés automatiquement lors de la validation d&apos;un devis par le DG.</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} /> Actualiser
        </button>
      </div>

      {error && <div className="card" style={{ marginBottom: 14, color: 'var(--red)', fontSize: '0.85rem' }}>{error}</div>}

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', marginBottom: 20 }}>
        <KpiCard icon={<CreditCard size={17} />} label="Total OP" value={items.length} color="blue" />
        <KpiCard icon={<CreditCard size={17} />} label="À préparer" value={aPreparer} color="grey" />
        <KpiCard icon={<Send size={17} />} label="En attente DG" value={enAttente} color="orange" />
        <KpiCard icon={<CheckCircle size={17} />} label="Payés" value={payes} color="green" />
      </div>

      <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Réf., fournisseur, demande..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
          <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 220 }}>
            <option value="">Tous statuts</option>
            {STATUTS_OP_ACHATS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={22} className="cin-spin" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<CreditCard size={24} />} title="Aucun ordre de paiement" sub="Les OP sont générés automatiquement à la validation d'un devis." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Réf. OP</th>
                  <th>Demande</th>
                  <th>OA</th>
                  <th>Fournisseur</th>
                  <th>TTC</th>
                  <th>Date prévue</th>
                  <th>Statut</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 700, color: 'var(--red)' }}>{o.ref}</td>
                    <td>{o.purchase_request_ref || '—'}</td>
                    <td>{o.purchase_oa_ref || '—'}</td>
                    <td>{o.fournisseur_lie || o.beneficiaire}</td>
                    <td>{formatMAD(o.montant_ttc || o.montant)}</td>
                    <td>{o.date_prevue || o.date || '—'}</td>
                    <td><span className={`badge ${BADGE_OP_ACHATS[o.statut] || 'badge-grey'}`}>{o.statut}</span></td>
                    <td>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => openDetail(o.id)}><Eye size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
