/**
 * OrdresAchat.jsx — Ordres d'achat persistés (générés automatiquement depuis le workflow)
 */
import { useState } from 'react';
import {
  ShoppingBag, Eye, Search, ChevronLeft, Loader2, RefreshCw, CheckCircle,
  Send, Package, FileText, History, Edit2, Trash2,
} from 'lucide-react';
import { useAcquisitionOrders } from '../../hooks/useAcquisitionOrders';
import { updateAcquisitionOrder, updateAcquisitionOrderStatus, deleteAcquisitionOrder } from '../../services/achats/purchaseAcquisitionOrders';
import { getPurchaseRequestQuote } from '../../services/achats/purchaseRequestQuotes';
import { generateAcquisitionOrderPdf } from '../../services/achats/purchaseAcquisitionOrderPdf';
import { listPurchaseRequestHistory } from '../../services/achats/purchaseRequestHistory';
import { PURCHASE_ASSIGNEE, getAcquisitionOrderStatusLabel } from '../../constants/purchaseWorkflow';
import {
  INPUT_STYLE, SELECT_STYLE, STATUTS_ORDRE, BADGE_ORDRE,
  KpiCard, EmptyState, SectionTitle, FField, FRow, formatMAD, Modal,
} from './shared.jsx';

const NEXT_STATUS = {
  Brouillon: 'Validé',
  Validé: 'Envoyé fournisseur',
  'Envoyé fournisseur': 'En attente réception',
  'En attente réception': 'Réceptionné',
  Réceptionné: 'Clôturé',
};

function DetailOA({ ordre, history, onBack, onStatusChange, onSave, saving }) {
  const [editMode, setEditMode] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [form, setForm] = useState({
    delai: ordre.delai || '',
    conditions_paiement: ordre.conditions_paiement || '',
    mode_paiement: ordre.mode_paiement || '',
    date_livraison: ordre.date_livraison || '',
  });
  const next = NEXT_STATUS[ordre.statut];

  async function handlePdf() {
    setPdfLoading(true);
    try {
      let quote = null;
      if (ordre.quote_id) quote = await getPurchaseRequestQuote(ordre.quote_id);
      await generateAcquisitionOrderPdf(ordre, { quote });
    } catch (err) {
      window.alert(err.message || 'Erreur génération PDF');
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <button type="button" className="btn btn-ghost btn-sm" style={{ marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={onBack}>
        <ChevronLeft size={15} /> Retour
      </button>
      <div className="flex-between" style={{ marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>{ordre.ref}</h1>
          <p className="page-subtitle">{ordre.objet}</p>
        </div>
        <span className={`badge ${BADGE_ORDRE[ordre.statut] || 'badge-grey'}`}>{getAcquisitionOrderStatusLabel(ordre.statut)}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>
        <div className="card">
          <SectionTitle icon={<ShoppingBag size={12} />}>Détails</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: '0.84rem' }}>
            {[
              ['Demande d\'achat', ordre.purchase_request_ref || '—'],
              ['Fournisseur', ordre.supplier_name],
              ['Projet', ordre.projet_lie],
              ['Responsable achats', ordre.responsable_achats || PURCHASE_ASSIGNEE.label],
              ['HT', formatMAD(ordre.montant_ht)],
              ['TTC', formatMAD(ordre.montant_ttc)],
              ['Délai', ordre.delai],
              ['Conditions', ordre.conditions_paiement],
            ].map(([l, v]) => (
              <div key={l}>
                <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>{l}</span>
                <div style={{ fontWeight: 600 }}>{v || '—'}</div>
              </div>
            ))}
          </div>
          {ordre.attachment_url && (
            <a href={ordre.attachment_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ marginTop: 12 }}>
              <FileText size={13} /> Pièce jointe
            </a>
          )}
        </div>
        <div className="card">
          <SectionTitle>Actions</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditMode((v) => !v)}><Edit2 size={13} /> Modifier</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={pdfLoading} onClick={handlePdf}>
              {pdfLoading ? <Loader2 size={13} className="cin-spin" /> : <FileText size={13} />} Télécharger PDF
            </button>
            {next && (
              <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => onStatusChange(ordre.id, next)}>
                {ordre.statut === 'Brouillon' && <><CheckCircle size={13} /> Valider</>}
                {ordre.statut === 'Validé' && <><Send size={13} /> Envoyer fournisseur</>}
                {ordre.statut === 'Envoyé fournisseur' && <><Package size={13} /> En attente réception</>}
                {ordre.statut === 'En attente réception' && <><CheckCircle size={13} /> Réceptionner</>}
                {ordre.statut === 'Réceptionné' && 'Clôturer'}
                {!['Brouillon', 'Validé', 'Envoyé fournisseur', 'En attente réception', 'Réceptionné'].includes(ordre.statut) && next}
              </button>
            )}
          </div>
        </div>
      </div>

      {editMode && (
        <div className="card" style={{ marginTop: 16 }}>
          <SectionTitle>Compléter l&apos;ordre d&apos;achat</SectionTitle>
          <FRow>
            <FField label="Délai"><input value={form.delai} onChange={(e) => setForm((p) => ({ ...p, delai: e.target.value }))} style={INPUT_STYLE} /></FField>
            <FField label="Date livraison"><input type="date" value={form.date_livraison} onChange={(e) => setForm((p) => ({ ...p, date_livraison: e.target.value }))} style={INPUT_STYLE} /></FField>
            <FField label="Conditions paiement"><input value={form.conditions_paiement} onChange={(e) => setForm((p) => ({ ...p, conditions_paiement: e.target.value }))} style={INPUT_STYLE} /></FField>
            <FField label="Mode paiement"><input value={form.mode_paiement} onChange={(e) => setForm((p) => ({ ...p, mode_paiement: e.target.value }))} style={INPUT_STYLE} /></FField>
          </FRow>
          <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => onSave(ordre.id, form)}>Enregistrer</button>
        </div>
      )}

      {history.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <SectionTitle icon={<History size={12} />}>Historique (demande liée)</SectionTitle>
          {history.slice(0, 8).map((h) => (
            <div key={h.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--surface-2)', fontSize: '0.82rem' }}>
              <strong>{h.action}</strong> — {h.date_label} {h.time_label}
              {h.detail && <div>{h.detail}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrdresAchat() {
  const { records: ordres, loading, error, reload } = useAcquisitionOrders();
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);
  const [pdfLoadingId, setPdfLoadingId] = useState(null);
  const [actionId, setActionId] = useState(null);

  const filtered = ordres.filter((o) => {
    const q = search.toLowerCase();
    return (!q || o.ref?.toLowerCase().includes(q) || o.objet?.toLowerCase().includes(q) || o.supplier_name?.toLowerCase().includes(q) || o.purchase_request_ref?.toLowerCase().includes(q))
      && (!filterStatut || o.statut === filterStatut);
  });

  async function openDetail(id) {
    setDetailId(id);
    const ordre = ordres.find((o) => o.id === id);
    setDetail(ordre);
    if (ordre?.purchase_request_id) {
      const h = await listPurchaseRequestHistory(ordre.purchase_request_id);
      setHistory(h);
    } else {
      setHistory([]);
    }
  }

  async function handleStatusChange(id, statut) {
    setSaving(true);
    setActionId(id);
    try {
      await updateAcquisitionOrderStatus(id, statut);
      await reload();
      if (detailId === id) {
        const updated = ordres.find((o) => o.id === id);
        if (updated) setDetail({ ...updated, statut });
      }
    } finally {
      setSaving(false);
      setActionId(null);
    }
  }

  async function handleSave(id, form) {
    setSaving(true);
    try {
      await updateAcquisitionOrder(id, form);
      await reload();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id, statut) {
    const msg = statut === 'Brouillon'
      ? 'Supprimer cet ordre d\'achat ?'
      : 'Cet ordre d\'achat est validé ou en cours. Confirmer la suppression ?';
    if (!window.confirm(msg)) return;
    setActionId(id);
    try {
      await deleteAcquisitionOrder(id);
      await reload();
      if (detailId === id) {
        setDetailId(null);
        setDetail(null);
      }
    } catch (err) {
      window.alert(err.message || 'Erreur suppression');
    } finally {
      setActionId(null);
    }
  }

  async function handleListPdf(id) {
    setPdfLoadingId(id);
    try {
      const ordre = ordres.find((o) => o.id === id);
      if (!ordre) return;
      let quote = null;
      if (ordre.quote_id) quote = await getPurchaseRequestQuote(ordre.quote_id);
      await generateAcquisitionOrderPdf(ordre, { quote });
    } catch (err) {
      window.alert(err.message || 'Erreur génération PDF');
    } finally {
      setPdfLoadingId(null);
    }
  }

  if (detailId && detail) {
    return (
      <DetailOA
        ordre={detail}
        history={history}
        onBack={() => { setDetailId(null); setDetail(null); }}
        onStatusChange={handleStatusChange}
        onSave={handleSave}
        saving={saving}
      />
    );
  }

  const brouillons = ordres.filter((o) => o.statut === 'Brouillon').length;
  const enCours = ordres.filter((o) => ['Validé', 'Envoyé fournisseur', 'En attente réception'].includes(o.statut)).length;
  const montantTotal = ordres.reduce((s, o) => s + (Number(o.montant_ttc) || 0), 0);

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">ORDRES D&apos;ACHAT</h1>
          <p className="page-subtitle">Créés automatiquement après validation du devis par le DG.</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={reload} disabled={loading}>
          <RefreshCw size={14} /> Actualiser
        </button>
      </div>

      {error && <div className="card" style={{ marginBottom: 14, color: 'var(--red)', fontSize: '0.85rem' }}>{error}</div>}

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', marginBottom: 20 }}>
        <KpiCard icon={<ShoppingBag size={17} />} label="Total OA" value={ordres.length} color="blue" />
        <KpiCard icon={<ShoppingBag size={17} />} label="Brouillons" value={brouillons} color="grey" />
        <KpiCard icon={<CheckCircle size={17} />} label="En cours" value={enCours} color="orange" />
        <KpiCard icon={<ShoppingBag size={17} />} label="Montant total" value={formatMAD(montantTotal)} color="red" />
      </div>

      <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Réf., objet, fournisseur, demande..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
          <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 220 }}>
            <option value="">Tous statuts</option>
            {STATUTS_ORDRE.map((s) => <option key={s} value={s}>{getAcquisitionOrderStatusLabel(s)}</option>)}
          </select>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={22} className="cin-spin" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<ShoppingBag size={24} />} title="Aucun ordre d'achat" sub="Les OA sont générés automatiquement lors de la validation d'un devis par le DG." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Réf.</th><th>Demande</th><th>Objet</th><th>Fournisseur</th><th>Projet</th><th>TTC</th><th>Statut</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 700, color: 'var(--red)' }}>{o.ref}</td>
                    <td>{o.purchase_request_ref || '—'}</td>
                    <td>{o.objet}</td>
                    <td>{o.supplier_name}</td>
                    <td>{o.project_ref || '—'}</td>
                    <td>{formatMAD(o.montant_ttc)}</td>
                    <td><span className={`badge ${BADGE_ORDRE[o.statut] || 'badge-grey'}`}>{getAcquisitionOrderStatusLabel(o.statut)}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-secondary btn-sm" title="Voir" onClick={() => openDetail(o.id)}><Eye size={13} /></button>
                        <button type="button" className="btn btn-ghost btn-sm" title="PDF" disabled={pdfLoadingId === o.id} onClick={() => handleListPdf(o.id)}>
                          {pdfLoadingId === o.id ? <Loader2 size={12} className="cin-spin" /> : <FileText size={12} />}
                        </button>
                        {o.statut === 'Brouillon' && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            title="Valider l'ordre d'achat"
                            disabled={actionId === o.id}
                            onClick={() => handleStatusChange(o.id, 'Validé')}
                          >
                            {actionId === o.id ? <Loader2 size={12} className="cin-spin" /> : <CheckCircle size={12} />}
                          </button>
                        )}
                        {o.statut === 'Validé' && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            title="Envoyer au fournisseur"
                            disabled={actionId === o.id}
                            onClick={() => handleStatusChange(o.id, 'Envoyé fournisseur')}
                          >
                            {actionId === o.id ? <Loader2 size={12} className="cin-spin" /> : <Send size={12} />}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title="Supprimer"
                          disabled={actionId === o.id}
                          onClick={() => handleDelete(o.id, o.statut)}
                          style={{ color: 'var(--red)' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
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
