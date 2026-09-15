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
import { isSuperAdmin } from '../../services/rh/isSuperAdmin';

const MOTIF_MISE_A_REBUT = 'Mise au rebut';

const MOTIFS = {
  Entrée: ['Réception directe', 'Retour chantier', 'Stock initial', 'Régularisation positive', 'Article retrouvé', 'Autre'],
  Sortie: ['Consommation chantier', 'Remise à un ouvrier', 'Utilisation interne', 'Casse', 'Perte', 'Régularisation négative', 'Autre'],
  Transfert: ['Besoin chantier', 'Réorganisation stock', 'Besoin atelier', 'Autre'],
  Régularisation: [
    'Régularisation positive',
    'Régularisation négative',
    MOTIF_MISE_A_REBUT,
    'Inventaire physique',
    'Autre',
  ],
};

function isStockDecreaseType(mType) {
  return mType === 'Sortie' || mType === 'Rebut';
}

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
  const allowMaterielSortie = isSuperAdmin(user);
  const emplacements = filterVisibleEmplacements(emplacementsList?.length ? emplacementsList : EMPLACEMENTS_STOCK);

  const [form, setForm] = useState({});
  const [stockInfo, setStockInfo] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
  const isRegularisation = type === 'Régularisation';

  const sourceOptions = useMemo(() => {
    const levels = stockInfo?.levels || [];
    const byEmp = new Map(levels.map((l) => [l.emplacement, Number(l.quantite) || 0]));
    const all = filterVisibleEmplacements([...levels.map((l) => l.emplacement), ...emplacements]);
    return all.map((e) => ({ value: e, qty: byEmp.has(e) ? byEmp.get(e) : null }));
  }, [stockInfo, emplacements]);

  /** Qty at a given emplacement (0 if none) — never fall back to article total. */
  function qtyAtEmplacement(emp) {
    if (!emp) return 0;
    const hit = (stockInfo?.levels || []).find((l) => l.emplacement === emp);
    return hit ? Number(hit.quantite) || 0 : 0;
  }

  const sourceQty = useMemo(() => {
    if (!form.emplacement_source) return stockAvant;
    const hit = (stockInfo?.levels || []).find((l) => l.emplacement === form.emplacement_source);
    // Sortie/Transfert: missing level = 0 at that location (not total).
    if (hit) return Number(hit.quantite) || 0;
    return isRegularisation ? 0 : stockAvant;
  }, [stockInfo, form.emplacement_source, stockAvant, isRegularisation]);

  const regularisationEmp = form.emplacement_source || form.emplacement_destination || '';

  /** Cible 0 = mise à zéro du stock TOTAL (tous les emplacements), pas d’un seul lieu. */
  const wipeAllToZero = isRegularisation
    && form.target_qty !== ''
    && form.target_qty != null
    && !Number.isNaN(Number(form.target_qty))
    && Number(form.target_qty) === 0;

  const baselineQty = wipeAllToZero
    ? stockAvant
    : (isRegularisation ? qtyAtEmplacement(regularisationEmp) : stockAvant);

  const levelsWithStock = useMemo(() => (
    (stockInfo?.levels || [])
      .map((l) => ({ emplacement: l.emplacement, quantite: Number(l.quantite) || 0 }))
      .filter((l) => l.quantite > 0 && l.emplacement && !isSansEmplacement(l.emplacement))
  ), [stockInfo]);

  function set(k, v) { setForm((p) => ({ ...p, [k]: v })); }

  function setRegularisationEmplacement(emp) {
    setForm((p) => ({ ...p, emplacement_source: emp, emplacement_destination: emp }));
  }

  function resolveMovementType() {
    if (type !== 'Régularisation') return type;
    const target = Number(form.target_qty);
    if (Number.isNaN(target) || form.target_qty === '' || form.target_qty == null) return null;
    if (wipeAllToZero) {
      if (stockAvant <= 0) return null;
      // Cible 0 → Rebut sur tous les emplacements (stock total → 0).
      return 'Rebut';
    }
    if (target > baselineQty) return 'Entrée';
    if (target < baselineQty) {
      if (String(form.motif || '').trim() === MOTIF_MISE_A_REBUT) return 'Rebut';
      return 'Sortie';
    }
    return null;
  }

  function regularisationDelta() {
    return Math.abs(Number(form.target_qty) - baselineQty);
  }

  function validate() {
    const mType = resolveMovementType();
    if (!article?.id) return 'Article manquant.';
    if (isRegularisation && !wipeAllToZero && !regularisationEmp) return 'Emplacement requis.';
    if (!mType) {
      return isRegularisation
        ? (wipeAllToZero
          ? 'Stock déjà à 0.'
          : 'Indiquez une nouvelle quantité différente du stock à cet emplacement.')
        : 'Type invalide.';
    }
    if (isRegularisation && String(form.motif || '').trim() === MOTIF_MISE_A_REBUT && mType !== 'Rebut') {
      return 'Mise au rebut : indiquez une quantité cible inférieure au stock.';
    }
    const q = isRegularisation ? regularisationDelta() : qty;
    if (!q || q <= 0) return 'Quantité invalide.';
    if (!form.date_creation) return 'Date requise.';
    if (!form.motif) return 'Motif requis.';
    if (!form.cree_par?.trim()) return 'Effectué par requis.';
    if (!wipeAllToZero) {
      if ((isStockDecreaseType(mType) || mType === 'Transfert') && !(isRegularisation ? regularisationEmp : form.emplacement_source)) {
        return 'Emplacement source requis.';
      }
      if ((mType === 'Entrée' || mType === 'Transfert') && !(isRegularisation ? regularisationEmp : form.emplacement_destination)) {
        return 'Emplacement destination requis.';
      }
    }
    if (mType === 'Transfert' && form.emplacement_source === form.emplacement_destination) {
      return 'Source et destination doivent être différentes.';
    }
    if (!wipeAllToZero && (isStockDecreaseType(mType) || mType === 'Transfert') && q > sourceQty) {
      return `Stock insuffisant (${sourceQty} disponible).`;
    }
    if (wipeAllToZero && levelsWithStock.length === 0 && stockAvant <= 0) {
      return 'Aucun stock à mettre à rebut.';
    }
    return null;
  }

  async function saveOneMovement({ mType, quantite, empSrc, empDest, noteExtra }) {
    await saveMouvementRapide({
      type_mouvement: mType,
      article_id: article.id,
      quantite,
      emplacement_source: empSrc,
      emplacement_destination: empDest,
      date_creation: form.date_creation,
      motif: form.motif || MOTIF_MISE_A_REBUT,
      cree_par: form.cree_par,
      projet: form.projet,
      beneficiaire: form.beneficiaire,
      fournisseur: form.fournisseur,
      ref_externe: form.ref_externe,
      allow_materiel_sortie: allowMaterielSortie,
      note: [
        form.note || '',
        form.prix_achat ? `Prix achat: ${form.prix_achat}` : '',
        form.etat ? `État: ${form.etat}` : '',
        noteExtra || '',
      ].filter(Boolean).join(' | '),
    });
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    const mType = resolveMovementType();
    setSaving(true);
    setError('');
    try {
      if (wipeAllToZero) {
        // Un Rebut par emplacement avec qty > 0 → stock total à 0 (1 confirm).
        const targets = levelsWithStock.length > 0
          ? levelsWithStock
          : [{
            emplacement: regularisationEmp || (article.emplacement || '').trim() || (emplacements[0] || 'STOCK'),
            quantite: stockAvant,
          }];
        for (const level of targets) {
          await saveOneMovement({
            mType: 'Rebut',
            quantite: level.quantite,
            empSrc: level.emplacement,
            empDest: '',
            noteExtra: `Régularisation mise à 0 (tous emplacements) : ${formatEmplacementDisplay(level.emplacement) || level.emplacement} ${level.quantite} → 0 (mise au rebut)`,
          });
        }
      } else {
        const q = isRegularisation ? regularisationDelta() : qty;
        const empSrc = isRegularisation
          ? (isStockDecreaseType(mType) ? regularisationEmp : '')
          : (form.emplacement_source || '');
        const empDest = isRegularisation
          ? (mType === 'Entrée' || mType === 'Sortie' ? regularisationEmp : '')
          : (form.emplacement_destination || '');
        await saveOneMovement({
          mType,
          quantite: q,
          empSrc,
          empDest,
          noteExtra: isRegularisation
            ? `Régularisation ${formatEmplacementDisplay(regularisationEmp) || regularisationEmp} : ${baselineQty} → ${form.target_qty}${mType === 'Rebut' ? ' (mise au rebut)' : ''}`
            : '',
        });
      }
      onDone?.();
      onClose?.();
    } catch (e) {
      setError(e?.message || 'Échec du mouvement.');
    } finally {
      setSaving(false);
    }
  }

  const motifs = useMemo(() => {
    const base = MOTIFS[type] || MOTIFS.Entrée;
    if (!isRegularisation) return base;
    if (wipeAllToZero) {
      // Cible 0 → motifs de diminution uniquement (Mise au rebut en tête).
      return [MOTIF_MISE_A_REBUT, 'Régularisation négative', 'Inventaire physique', 'Autre'];
    }
    const targetNum = Number(form.target_qty);
    const hasTarget = form.target_qty !== '' && form.target_qty != null && !Number.isNaN(targetNum);
    if (hasTarget && targetNum > baselineQty) {
      return base.filter((m) => m !== MOTIF_MISE_A_REBUT);
    }
    return base;
  }, [type, isRegularisation, form.target_qty, baselineQty, wipeAllToZero]);

  function setTargetQty(value) {
    const targetNum = Number(value);
    const toZero = value !== '' && !Number.isNaN(targetNum) && targetNum === 0;
    // Comparer à l'emplacement sélectionné (pas au total wipe), sinon motif bloqué après cible 0.
    const empBaseline = qtyAtEmplacement(regularisationEmp);
    setForm((p) => {
      let nextMotif = p.motif;
      if (toZero) nextMotif = MOTIF_MISE_A_REBUT;
      else if (value !== '' && !Number.isNaN(targetNum) && targetNum > empBaseline && nextMotif === MOTIF_MISE_A_REBUT) {
        nextMotif = 'Régularisation positive';
      }
      return { ...p, target_qty: value, motif: nextMotif };
    });
  }

  if (!article) return null;

  const titleMap = {
    Entrée: 'Faire une entrée',
    Sortie: 'Faire une sortie',
    Transfert: 'Faire un transfert',
    Régularisation: 'Régulariser le stock',
  };

  const previewQty = isRegularisation ? regularisationDelta() || 0 : qty;
  const previewType = resolveMovementType();
  const previewDecrease = isStockDecreaseType(previewType);
  const stockApresTotal = wipeAllToZero
    ? 0
    : (previewType === 'Entrée' ? stockAvant + previewQty
      : previewDecrease ? stockAvant - previewQty
        : stockAvant);
  const stockApresEmp = wipeAllToZero
    ? 0
    : (previewType === 'Entrée' ? baselineQty + previewQty
      : previewDecrease ? baselineQty - previewQty
        : baselineQty);
  const unite = article.unite || 'U';

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
            Stock total : <strong>{stockAvant} {unite}</strong>
            {isRegularisation && !wipeAllToZero && regularisationEmp ? (
              <>
                {' · '}Stock à cet emplacement : <strong>{baselineQty} {unite}</strong>
              </>
            ) : null}
            {wipeAllToZero ? (
              <>
                {' · '}
                <span style={{ color: 'var(--red)' }}>
                  Mise à 0 sur {levelsWithStock.length || 1} emplacement(s)
                </span>
              </>
            ) : null}
          </div>
        </div>

        <FRow>
          {isRegularisation ? (
            <FField label="Nouvelle quantité cible" required>
              <input type="number" min="0" step="0.001" value={form.target_qty} onChange={(e) => setTargetQty(e.target.value)} style={INPUT_STYLE} />
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
          {isRegularisation ? (
            wipeAllToZero ? (
              <FField label="Emplacements">
                <div style={{ fontSize: '0.84rem', color: 'var(--text-2)', padding: '8px 0' }}>
                  Cible 0 : un Rebut sera créé pour chaque emplacement avec stock
                  {levelsWithStock.length > 0 ? (
                    <>
                      {' '}({levelsWithStock.map((l) => `${formatEmplacementDisplay(l.emplacement) || l.emplacement}×${l.quantite}`).join(', ')})
                    </>
                  ) : null}
                  .
                </div>
              </FField>
            ) : (
              <FField label="Emplacement à régulariser" required>
                <select
                  value={regularisationEmp}
                  onChange={(e) => setRegularisationEmplacement(e.target.value)}
                  style={SELECT_STYLE}
                >
                  <option value="">— Sélectionner —</option>
                  {sourceOptions.map(({ value, qty: q }) => (
                    <option key={value} value={value}>{q != null ? `${value} (${q})` : `${value} (0)`}</option>
                  ))}
                </select>
              </FField>
            )
          ) : (
            <>
              {(type === 'Sortie' || type === 'Transfert') && (
                <FField label="Emplacement source" required>
                  <select value={form.emplacement_source} onChange={(e) => set('emplacement_source', e.target.value)} style={SELECT_STYLE}>
                    <option value="">— Sélectionner —</option>
                    {sourceOptions.map(({ value, qty: q }) => (
                      <option key={value} value={value}>{q != null ? `${value} (${q})` : value}</option>
                    ))}
                  </select>
                </FField>
              )}
              {(type === 'Entrée' || type === 'Transfert') && (
                <FField label="Emplacement destination" required>
                  <select value={form.emplacement_destination} onChange={(e) => set('emplacement_destination', e.target.value)} style={SELECT_STYLE}>
                    <option value="">— Sélectionner —</option>
                    {emplacements.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                </FField>
              )}
            </>
          )}
        </FRow>

        <FRow>
          <FField label="Motif" required>
            <select value={form.motif} onChange={(e) => set('motif', e.target.value)} style={SELECT_STYLE}>
              <option value="">— Sélectionner —</option>
              {motifs.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            {isRegularisation && (form.motif === MOTIF_MISE_A_REBUT || wipeAllToZero) ? (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 4 }}>
                {wipeAllToZero
                  ? 'Crée un mouvement Rebut par emplacement pour ramener le stock total à 0.'
                  : 'Crée un mouvement de type Rebut (retrait définitif à cet emplacement).'}
              </div>
            ) : null}
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
            {isRegularisation ? (
              wipeAllToZero ? (
                <>
                  <div>Stock total : <strong>{stockAvant}</strong> → <strong>0</strong></div>
                  <div>Rebut : <strong>-{stockAvant}</strong> sur {levelsWithStock.length || 1} emplacement(s)</div>
                </>
              ) : (
                <>
                  <div>Stock à l&apos;emplacement : <strong>{baselineQty}</strong> → <strong>{stockApresEmp}</strong></div>
                  <div>{previewType} : <strong>{previewType === 'Entrée' ? '+' : '-'}{previewQty}</strong></div>
                  <div>Stock total : <strong>{stockAvant}</strong> → <strong>{stockApresTotal}</strong></div>
                </>
              )
            ) : (
              <>
                <div>Stock actuel : <strong>{stockAvant}</strong></div>
                <div>{previewType} : <strong>{previewType === 'Entrée' ? '+' : '-'}{previewQty}</strong></div>
                <div>Nouveau stock : <strong>{stockApresTotal}</strong></div>
              </>
            )}
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
