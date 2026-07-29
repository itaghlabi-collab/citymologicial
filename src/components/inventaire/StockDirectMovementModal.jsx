/**
 * Mouvement direct depuis Stocks (Entrée / Sortie / Transfert / Régularisation).
 * Réutilise saveMouvementRapide — aucune logique stock dupliquée.
 */
import { useState, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE, EMPLACEMENTS_STOCK,
  Modal, FField, FRow, SectionTitle,
  filterVisibleEmplacements, formatEmplacementDisplay, isSansEmplacement,
} from './shared.jsx';
import { saveMouvementRapide, getArticleStockInfo } from '../../services/inventaire/mouvementRapide';
import { useAuth } from '../../hooks/useAuth';

const MOTIFS = {
  Entrée: ['Réception directe', 'Retour chantier', 'Stock initial', 'Régularisation positive', 'Article retrouvé', 'Autre'],
  Sortie: ['Consommation chantier', 'Remise à un ouvrier', 'Utilisation interne', 'Casse', 'Perte', 'Régularisation négative', 'Autre'],
  Transfert: ['Besoin chantier', 'Réorganisation stock', 'Besoin atelier', 'Autre'],
  Régularisation: ['Régularisation positive', 'Régularisation négative', 'Inventaire physique', 'Autre'],
};

export default function StockDirectMovementModal({
  open,
  type, // Entrée | Sortie | Transfert | Régularisation
  article,
  emplacementsList = EMPLACEMENTS_STOCK,
  onClose,
  onDone,
}) {
  const { user } = useAuth();
  const sessionName = user?.user_metadata?.full_name || user?.nom || user?.email?.split('@')[0] || '';
  const emplacements = filterVisibleEmplacements(emplacementsList?.length ? emplacementsList : EMPLACEMENTS_STOCK);

  const [form, setForm] = useState({});
  const [stockInfo, setStockInfo] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const resolvedType = type === 'Régularisation' ? null : type;

  useEffect(() => {
    if (!open || !article) return;
    const raw = (article.emplacement || '').trim();
    const prefEmp = raw && !isSansEmplacement(raw) ? raw : (emplacements[0] || '');
    setForm({
      quantite: '',
      date_creation: new Date().toISOString().slice(0, 10),
      emplacement_source: prefEmp,
      emplacement_destination: prefEmp,
      motif: type === 'Régularisation' ? 'Régularisation positive' : '',
      cree_par: sessionName,
      projet: '',
      beneficiaire: '',
      fournisseur: '',
      ref_externe: '',
      note: '',
      etat: article.etat || 'Neuf',
      prix_achat: '',
      target_qty: '',
    });
    setError('');
    getArticleStockInfo(article.id)
      .then(setStockInfo)
      .catch(() => setStockInfo({ totalStock: Number(article.stock_actuel) || 0, levels: [] }));
  }, [open, article?.id, type, sessionName]); // eslint-disable-line react-hooks/exhaustive-deps

  const stockAvant = (stockInfo?.totalStock ?? Number(article?.stock_actuel)) || 0;
  const qty = Number(form.quantite) || 0;

  const sourceOptions = useMemo(() => {
    const levels = stockInfo?.levels || [];
    const byEmp = new Map(levels.map((l) => [l.emplacement, Number(l.quantite) || 0]));
    const all = filterVisibleEmplacements([...levels.map((l) => l.emplacement), ...emplacements]);
    return all.map((e) => ({ value: e, qty: byEmp.has(e) ? byEmp.get(e) : null }));
  }, [stockInfo, emplacements]);

  const sourceQty = useMemo(() => {
    const hit = (stockInfo?.levels || []).find((l) => l.emplacement === form.emplacement_source);
    return hit ? Number(hit.quantite) || 0 : stockAvant;
  }, [stockInfo, form.emplacement_source, stockAvant]);

  function set(k, v) { setForm((p) => ({ ...p, [k]: v })); }

  function resolveMovementType() {
    if (type !== 'Régularisation') return type;
    const target = Number(form.target_qty);
    if (Number.isNaN(target)) return null;
    if (target > stockAvant) return 'Entrée';
    if (target < stockAvant) return 'Sortie';
    return null;
  }

  function validate() {
    const mType = resolveMovementType();
    if (!article?.id) return 'Article manquant.';
    if (!mType) return type === 'Régularisation' ? 'Indiquez une nouvelle quantité différente du stock actuel.' : 'Type invalide.';
    const q = type === 'Régularisation' ? Math.abs(Number(form.target_qty) - stockAvant) : qty;
    if (!q || q <= 0) return 'Quantité invalide.';
    if (!form.date_creation) return 'Date requise.';
    if (!form.motif) return 'Motif requis.';
    if (!form.cree_par?.trim()) return 'Effectué par requis.';
    if ((mType === 'Sortie' || mType === 'Transfert') && !form.emplacement_source) return 'Emplacement source requis.';
    if ((mType === 'Entrée' || mType === 'Transfert') && !form.emplacement_destination) return 'Emplacement destination requis.';
    if (mType === 'Transfert' && form.emplacement_source === form.emplacement_destination) {
      return 'Source et destination doivent être différentes.';
    }
    if ((mType === 'Sortie' || mType === 'Transfert') && q > sourceQty) {
      return `Stock insuffisant (${sourceQty} disponible).`;
    }
    return null;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    const mType = resolveMovementType();
    const q = type === 'Régularisation' ? Math.abs(Number(form.target_qty) - stockAvant) : qty;
    setSaving(true);
    setError('');
    try {
      await saveMouvementRapide({
        type_mouvement: mType,
        article_id: article.id,
        quantite: q,
        emplacement_source: form.emplacement_source || '',
        emplacement_destination: form.emplacement_destination || '',
        date_creation: form.date_creation,
        motif: form.motif,
        cree_par: form.cree_par,
        projet: form.projet,
        beneficiaire: form.beneficiaire,
        fournisseur: form.fournisseur,
        ref_externe: form.ref_externe,
        note: [
          form.note || '',
          form.prix_achat ? `Prix achat: ${form.prix_achat}` : '',
          form.etat ? `État: ${form.etat}` : '',
          type === 'Régularisation' ? `Régularisation → ${form.target_qty}` : '',
        ].filter(Boolean).join(' | '),
      });
      onDone?.();
      onClose?.();
    } catch (e) {
      setError(e?.message || 'Échec du mouvement.');
    } finally {
      setSaving(false);
    }
  }

  if (!article) return null;

  const titleMap = {
    Entrée: 'Faire une entrée',
    Sortie: 'Faire une sortie',
    Transfert: 'Faire un transfert',
    Régularisation: 'Régulariser le stock',
  };

  const previewQty = type === 'Régularisation'
    ? Math.abs(Number(form.target_qty) - stockAvant) || 0
    : qty;
  const previewType = resolveMovementType();
  const stockApres = previewType === 'Entrée' ? stockAvant + previewQty
    : previewType === 'Sortie' ? stockAvant - previewQty
    : stockAvant;

  const motifs = MOTIFS[type] || MOTIFS.Entrée;

  return (
    <Modal open={open} onClose={() => !saving && onClose?.()} title={titleMap[type] || 'Mouvement'} width={640}>
      <form onSubmit={handleSubmit}>
        {error && (
          <div className="card" style={{ marginBottom: 12, padding: 10, color: 'var(--red)', fontSize: '0.84rem' }}>{error}</div>
        )}

        <SectionTitle>Article</SectionTitle>
        <div style={{ marginBottom: 14, padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 8 }}>
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, color: 'var(--red)' }}>{article.code}</div>
          <div style={{ fontWeight: 600 }}>{article.designation}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-3)', marginTop: 4 }}>
            Stock actuel : <strong>{stockAvant} {article.unite || 'U'}</strong>
          </div>
        </div>

        <FRow>
          {type === 'Régularisation' ? (
            <FField label="Nouvelle quantité cible" required>
              <input type="number" min="0" step="0.001" value={form.target_qty} onChange={(e) => set('target_qty', e.target.value)} style={INPUT_STYLE} />
            </FField>
          ) : (
            <FField label="Quantité" required>
              <input type="number" min="1" step="0.001" value={form.quantite} onChange={(e) => set('quantite', e.target.value)} style={INPUT_STYLE} />
            </FField>
          )}
          <FField label="Date" required>
            <input type="date" value={form.date_creation} onChange={(e) => set('date_creation', e.target.value)} style={INPUT_STYLE} />
          </FField>
          <FField label="Effectué par" required>
            <input value={form.cree_par} onChange={(e) => set('cree_par', e.target.value)} style={INPUT_STYLE} />
          </FField>
        </FRow>

        <FRow>
          {(type === 'Sortie' || type === 'Transfert' || (type === 'Régularisation' && previewType === 'Sortie')) && (
            <FField label="Emplacement source" required>
              <select value={form.emplacement_source} onChange={(e) => set('emplacement_source', e.target.value)} style={SELECT_STYLE}>
                <option value="">— Sélectionner —</option>
                {sourceOptions.map(({ value, qty: q }) => (
                  <option key={value} value={value}>{q != null ? `${value} (${q})` : value}</option>
                ))}
              </select>
            </FField>
          )}
          {(type === 'Entrée' || type === 'Transfert' || (type === 'Régularisation' && previewType === 'Entrée') || type === 'Régularisation') && (
            <FField label="Emplacement destination" required={type !== 'Régularisation' || previewType === 'Entrée'}>
              <select value={form.emplacement_destination} onChange={(e) => set('emplacement_destination', e.target.value)} style={SELECT_STYLE}>
                <option value="">— Sélectionner —</option>
                {emplacements.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </FField>
          )}
        </FRow>

        <FRow>
          <FField label="Motif" required>
            <select value={form.motif} onChange={(e) => set('motif', e.target.value)} style={SELECT_STYLE}>
              <option value="">— Sélectionner —</option>
              {motifs.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </FField>
          {(type === 'Sortie' || type === 'Transfert') && (
            <FField label="Projet / chantier">
              <input value={form.projet} onChange={(e) => set('projet', e.target.value)} style={INPUT_STYLE} placeholder="Optionnel" />
            </FField>
          )}
        </FRow>

        {type === 'Entrée' && (
          <FRow>
            <FField label="Fournisseur">
              <input value={form.fournisseur} onChange={(e) => set('fournisseur', e.target.value)} style={INPUT_STYLE} />
            </FField>
            <FField label="Réf. facture / BL">
              <input value={form.ref_externe} onChange={(e) => set('ref_externe', e.target.value)} style={INPUT_STYLE} />
            </FField>
            <FField label="Prix d'achat unitaire">
              <input type="number" step="0.01" min="0" value={form.prix_achat} onChange={(e) => set('prix_achat', e.target.value)} style={INPUT_STYLE} />
            </FField>
          </FRow>
        )}
        {type === 'Sortie' && (
          <FRow>
            <FField label="Bénéficiaire">
              <input value={form.beneficiaire} onChange={(e) => set('beneficiaire', e.target.value)} style={INPUT_STYLE} />
            </FField>
          </FRow>
        )}

        <FField label="Observation">
          <textarea value={form.note} onChange={(e) => set('note', e.target.value)} style={{ ...TEXTAREA_STYLE, minHeight: 56 }} />
        </FField>

        {previewQty > 0 && previewType && (
          <div style={{ margin: '14px 0', padding: '12px 14px', borderRadius: 8, background: '#F5F5F5', fontSize: '0.88rem' }}>
            <div>Stock actuel : <strong>{stockAvant}</strong></div>
            <div>{previewType} : <strong>{previewType === 'Entrée' ? '+' : '-'}{previewQty}</strong></div>
            <div>Nouveau stock : <strong>{stockApres}</strong></div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {saving && <Loader2 size={14} className="cin-spin" />}
            Confirmer
          </button>
        </div>
      </form>
    </Modal>
  );
}
