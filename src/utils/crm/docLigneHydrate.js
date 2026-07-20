/**
 * Hydrate une ligne document (devis → facture / proforma)
 * comme FactureForm : copie des champs + PU depuis ligne / article / total_ht.
 */
import { moneyLineHt, moneyToNumber } from '../decimalMoney';

const EMPTY_LIGNE = () => ({
  _id: Date.now() + Math.random(),
  type: 'article',
  designation: '', description: '', article_id: '', categorie_id: '',
  quantite: 1, unite: 'unite', prix_ht: 0, remise: 0, tva: 20,
});

export function hydrateDocLigneFromSource(l, articles = []) {
  const type = l?.type === 'sous_titre' ? 'titre' : (l?.type || 'article');
  const base = {
    ...EMPTY_LIGNE(),
    type,
    designation: l?.designation || '',
    description: l?.description || '',
    article_id: l?.article_id ? String(l.article_id) : '',
    categorie_id: l?.categorie_id ? String(l.categorie_id) : '',
    quantite: l?.quantite ?? (type === 'article' ? 1 : 0),
    unite: l?.unite || 'unite',
    remise: l?.remise ?? 0,
    tva: l?.tva ?? 20,
    _id: l?._id || l?.id || `${Date.now()}-${Math.random()}`,
  };

  if (type !== 'article') {
    return { ...base, quantite: 0, prix_ht: 0, remise: 0, tva: 20 };
  }

  let prix = moneyToNumber(l?.prix_ht ?? l?.prix ?? 0);
  const qty = moneyToNumber(l?.quantite ?? 1) || 1;
  const remise = moneyToNumber(l?.remise ?? 0);
  const total = moneyToNumber(l?.total_ht ?? 0);

  if (prix <= 0 && base.article_id) {
    const art = articles.find((a) => String(a.id) === String(base.article_id));
    if (art) prix = moneyToNumber(art.prix_ht ?? art.prix ?? 0);
  }
  if (prix <= 0 && base.designation?.trim()) {
    const nom = base.designation.trim().toLowerCase();
    const art = articles.find((a) => (a.nom || a.designation || '').trim().toLowerCase() === nom);
    if (art) {
      prix = moneyToNumber(art.prix_ht ?? art.prix ?? 0);
      if (!base.article_id && art.id) base.article_id = String(art.id);
      if (!base.categorie_id && art.categorie_id) base.categorie_id = String(art.categorie_id);
      if (!base.unite || base.unite === 'unite') base.unite = art.unite || base.unite;
    }
  }
  if (prix <= 0 && total > 0 && qty > 0) {
    const factor = 1 - (remise / 100);
    prix = moneyToNumber(total / (qty * (factor > 0 ? factor : 1)));
  }

  return {
    ...base,
    quantite: qty,
    prix_ht: prix,
    remise,
    tva: l?.tva == null || l?.tva === '' ? 20 : moneyToNumber(l.tva),
    total_ht: moneyToNumber(moneyLineHt({ qty, unitPriceHt: prix, remisePct: remise })),
  };
}
