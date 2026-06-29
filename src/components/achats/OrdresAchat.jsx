/**
 * OrdresAchat.jsx — Ordres d'achat persistés (générés automatiquement depuis le workflow)
 */
import { useState } from 'react';
import { ShoppingBag, Eye, Search, Filter, ChevronLeft, Loader2, RefreshCw, CheckCircle } from 'lucide-react';
import { useAcquisitionOrders } from '../../hooks/useAcquisitionOrders';
import { updateAcquisitionOrderStatus } from '../../services/achats/purchaseAcquisitionOrders';
import {
  INPUT_STYLE, SELECT_STYLE, STATUTS_ORDRE, BADGE_ORDRE,
  KpiCard, EmptyState, SectionTitle, formatMAD,
} from './shared.jsx';

function DetailOA({ ordre, onBack, onStatusChange, saving }) {
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
        <span className={`badge ${BADGE_ORDRE[ordre.statut] || 'badge-grey'}`}>{ordre.statut}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
        <div className="card">
          <SectionTitle icon={<ShoppingBag size={12} />}>Détails</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: '0.84rem' }}>
            {[['Fournisseur', ordre.supplier_name], ['Projet', ordre.projet_lie], ['HT', formatMAD(ordre.montant_ht)], ['TTC', formatMAD(ordre.montant_ttc)], ['Délai', ordre.delai], ['Conditions', ordre.conditions_paiement], ['Garantie', ordre.garantie]].map(([l, v]) => (
              <div key={l}>
                <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>{l}</span>
                <div style={{ fontWeight: 600 }}>{v || '—'}</div>
              </div>
            ))}
          </div>
          <p style={{ marginTop: 14, fontSize: '0.78rem', color: 'var(--text-3)' }}>
            Généré automatiquement depuis une demande d&apos;achat validée par le DG.
          </p>
        </div>
        <div className="card">
          <SectionTitle>Actions</SectionTitle>
          {ordre.statut === 'En attente validation' && (
            <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => onStatusChange(ordre.id, 'Validé')}>
              <CheckCircle size={13} /> Valider OA
            </button>
          )}
          {ordre.statut === 'Validé' && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => onStatusChange(ordre.id, 'Commandé')}>
              Marquer commandé
            </button>
          )}
          {ordre.statut === 'Commandé' && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={() => onStatusChange(ordre.id, 'Clôturé')}>
              Clôturer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OrdresAchat() {
  const { records: ordres, loading, error, reload } = useAcquisitionOrders();
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [saving, setSaving] = useState(false);

  const filtered = ordres.filter((o) => {
    const q = search.toLowerCase();
    return (!q || o.ref?.toLowerCase().includes(q) || o.objet?.toLowerCase().includes(q) || o.supplier_name?.toLowerCase().includes(q))
      && (!filterStatut || o.statut === filterStatut);
  });

  async function handleStatusChange(id, statut) {
    setSaving(true);
    try {
      await updateAcquisitionOrderStatus(id, statut);
      await reload();
    } finally {
      setSaving(false);
    }
  }

  if (detailId) {
    const ordre = ordres.find((o) => o.id === detailId);
    if (!ordre) { setDetailId(null); return null; }
    return <DetailOA ordre={ordre} onBack={() => setDetailId(null)} onStatusChange={handleStatusChange} saving={saving} />;
  }

  const enAttente = ordres.filter((o) => o.statut === 'En attente validation').length;
  const valides = ordres.filter((o) => o.statut === 'Validé' || o.statut === 'Commandé').length;
  const montantTotal = ordres.reduce((s, o) => s + (Number(o.montant_ttc) || 0), 0);

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">ORDRES D&apos;ACHAT</h1>
          <p className="page-subtitle">Créés automatiquement après validation du fournisseur par le DG.</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={reload} disabled={loading}>
          <RefreshCw size={14} /> Actualiser
        </button>
      </div>

      {error && <div className="card" style={{ marginBottom: 14, color: 'var(--red)', fontSize: '0.85rem' }}>{error}</div>}

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', marginBottom: 20 }}>
        <KpiCard icon={<ShoppingBag size={17} />} label="Total OA" value={ordres.length} color="blue" />
        <KpiCard icon={<ShoppingBag size={17} />} label="En attente validation" value={enAttente} color="orange" />
        <KpiCard icon={<CheckCircle size={17} />} label="Validés / commandés" value={valides} color="green" />
        <KpiCard icon={<ShoppingBag size={17} />} label="Montant total" value={formatMAD(montantTotal)} color="red" />
      </div>

      {showFilters && (
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Réf., objet, fournisseur..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 200 }}>
              <option value="">Tous statuts</option>
              {STATUTS_ORDRE.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={22} className="cin-spin" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<ShoppingBag size={24} />} title="Aucun ordre d'achat" sub="Les OA sont générés automatiquement lors de la validation d'un devis par le DG." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Réf.</th><th>Objet</th><th>Fournisseur</th><th>Projet</th><th>TTC</th><th>Statut</th><th /></tr></thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 700, color: 'var(--red)' }}>{o.ref}</td>
                    <td>{o.objet}</td>
                    <td>{o.supplier_name}</td>
                    <td>{o.project_ref || '—'}</td>
                    <td>{formatMAD(o.montant_ttc)}</td>
                    <td><span className={`badge ${BADGE_ORDRE[o.statut] || 'badge-grey'}`}>{o.statut}</span></td>
                    <td><button type="button" className="btn btn-secondary btn-sm" onClick={() => setDetailId(o.id)}><Eye size={13} /></button></td>
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
