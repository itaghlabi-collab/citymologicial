/** Demandes chantier — catalogue fiche papier CITYMO */

export const SITE_REQUEST_PRIORITES = ['Normale', 'Urgente', 'Critique'];

/** Origine de création d'une demande chantier */
export const SITE_REQUEST_ORIGINES = {
  catalogue: { value: 'catalogue', label: 'Catalogue stock', badge: null },
  manuelle: { value: 'manuelle', label: 'Demande manuelle', badge: 'Demande manuelle' },
};

export function siteRequestOrigineLabel(origine) {
  return SITE_REQUEST_ORIGINES[origine]?.label || 'Catalogue stock';
}

export function isManualSiteRequest(req) {
  if (!req) return false;
  if (req.origine === 'manuelle') return true;
  const lines = (req.lines || []).filter((l) => Number(l.quantite_demandee) > 0 || l.is_custom);
  return lines.length > 0 && lines.every((l) => l.is_custom);
}

export const SITE_REQUEST_STATUTS = [
  { value: 'brouillon', label: 'Brouillon', color: '#757575' },
  { value: 'soumise', label: 'Soumise', color: '#1565C0' },
  { value: 'en_preparation', label: 'En préparation', color: '#F57C00' },
  { value: 'preparation_partielle', label: 'Préparation partielle', color: '#FB8C00' },
  { value: 'en_attente_dg', label: 'Attente validation DG', color: '#C62828' },
  { value: 'validee_dg', label: 'Validée DG', color: '#2E7D32' },
  { value: 'prete', label: 'Prête', color: '#00897B' },
  { value: 'livree', label: 'Livrée', color: '#2E7D32' },
  { value: 'annulee', label: 'Annulée', color: '#9E9E9E' },
];

export const SITE_REQUEST_UNITS = ['u', 'pce', 'lot', 'm', 'm²', 'm³', 'kg', 'L', 'sac', 'rouleau'];

/** Seuil MAD estimé déclenchant validation DG (lignes avec article stock lié). */
export const SITE_REQUEST_DG_THRESHOLD_MAD = 15000;

export const SITE_REQUEST_CATEGORIES = [
  {
    id: 'demolition',
    label: 'Démolition',
    icon: '🔨',
    items: ['Burin', 'Massette', 'Pelle', 'Pioche', 'Brouette', 'Sacs vides', 'Dégageur', 'Pied de biche', 'Autre'],
  },
  {
    id: 'maconnerie',
    label: 'Maçonnerie',
    icon: '🧱',
    items: [
      'Taloche GM', 'Taloche PM', 'Marteau maçon', 'Pelle', 'Truelle', 'Brouette', 'Niveau maçon',
      'Tenaille', 'Pied de biche', 'Bac ciment', 'Madrier', 'Planches', 'Échafaudage', 'Serre-joints',
      'Chandelles', 'Autre',
    ],
  },
  {
    id: 'peinture',
    label: 'Peinture',
    icon: '🎨',
    items: [
      'Rouleaux mat', 'Rouleaux laqué', 'Rouleaux vinyle', 'Rouleaux petits', 'Seaux', 'Grilles',
      'Pinceaux', 'Scotch papier', 'Bâche plastique', 'Couteaux enduit', 'Papier abrasif',
      'Taloche décor', 'Solvant', 'Autre',
    ],
  },
  {
    id: 'electricite',
    label: 'Électricité',
    icon: '⚡',
    items: [
      'Malette électricien', 'Scie cloche', 'Boîtes carrées', 'Passe câble', 'Marqueur', 'Décapeur',
      'Testeur', 'Metrix', 'Isogris diamètre', 'Boîte de jonction', 'Dominos', 'Autre',
    ],
  },
  {
    id: 'epi',
    label: 'EPI',
    icon: '🦺',
    items: [
      'Gilets', 'Lunettes', 'Gants', 'Casques', 'Chaussures', 'Combinaisons',
      'Masques poussière', 'Harnais', 'Uniformes', 'Autre',
    ],
  },
  {
    id: 'appareillage',
    label: 'Appareillage',
    icon: '🔧',
    items: [
      'Visseuse', 'Perforateur', 'Meule GF', 'Meule PF', 'Rainureuse', 'Compresseur',
      'Dégageur GM', 'Dégageur PM', 'Laser à niveau', 'Scie sabre', 'Rallonges électriques', 'Autre',
    ],
  },
  {
    id: 'ferronnerie',
    label: 'Ferronnerie',
    icon: '⚙️',
    items: [
      'Poste à souder', 'Meule GF', 'Meule PF', 'Serre-joints', 'Baguettes', 'Disques découpe',
      'Disques abrasifs', 'Disques laser', 'Autre',
    ],
  },
  {
    id: 'menuiserie',
    label: 'Menuiserie',
    icon: '🪚',
    items: [
      'Rabot', 'Ponceuse', 'Couteaux', 'Papier abrasif', 'Scotch', 'Papier couvrant',
      'Scie sauteuse', 'Défonceuse', 'Autre',
    ],
  },
  {
    id: 'plomberie',
    label: 'Plomberie',
    icon: '🔩',
    items: ['Machine PPR', 'Chalumeau', 'Téflon', 'Colle PVC', 'Autre'],
  },
  {
    id: 'ba13',
    label: 'BA13',
    icon: '📐',
    items: [
      'Scie BA13', 'Cisaille tôle', 'Vis BA13', 'Bande grillagée', 'Vis autoperforantes',
      'Montants', 'Rails', 'Fourrures', 'Chevilles à frapper', 'Chevilles cuivre',
      'Suspentes', 'Cornières', 'Autre',
    ],
  },
  {
    id: 'bitume',
    label: 'Bitume',
    icon: '🛢️',
    items: ['Butane', 'Rouleau bitume', 'Chalumeau', 'Truelle', 'Réchaud', 'Seau bitume', 'Autre'],
  },
  {
    id: 'autres',
    label: 'Autres',
    icon: '📦',
    items: [],
    freeForm: true,
  },
];

export function siteRequestStatutLabel(statut) {
  return SITE_REQUEST_STATUTS.find((s) => s.value === statut)?.label || statut;
}

export function siteRequestStatutColor(statut) {
  return SITE_REQUEST_STATUTS.find((s) => s.value === statut)?.color || '#757575';
}

export function siteRequestPreparationStatut(statut) {
  if (['en_preparation', 'preparation_partielle'].includes(statut)) return siteRequestStatutLabel(statut);
  if (['prete', 'validee_dg', 'livree'].includes(statut)) return 'Préparée';
  if (statut === 'soumise') return 'En attente';
  if (statut === 'en_attente_dg') return 'Attente DG';
  if (statut === 'annulee') return 'Annulée';
  return '—';
}

export function siteRequestLivraisonStatut(statut) {
  if (statut === 'livree') return 'Livrée';
  if (['prete', 'validee_dg'].includes(statut)) return 'À livrer';
  if (statut === 'annulee') return 'Annulée';
  return '—';
}

export function buildDefaultCatalogLines() {
  const lines = [];
  let order = 0;
  SITE_REQUEST_CATEGORIES.forEach((cat) => {
    if (cat.freeForm) return;
    cat.items.forEach((name) => {
      if (name === 'Autre') return;
      lines.push({
        category_id: cat.id,
        article_name: name,
        quantite_demandee: 0,
        quantite_preparee: 0,
        quantite_livree: 0,
        unite: 'u',
        remarque: '',
        remarque_magasinier: '',
        is_custom: false,
        line_order: order++,
      });
    });
  });
  return lines;
}

export function normalizeSearchText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function searchCatalogItems(query, stockArticles = []) {
  const q = normalizeSearchText(query);
  if (!q || q.length < 2) return [];
  const tokens = q.split(' ').filter(Boolean);
  const results = [];
  const seen = new Set();

  const push = (item) => {
    const key = `${item.categoryId}|${item.articleName}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(item);
  };

  SITE_REQUEST_CATEGORIES.forEach((cat) => {
    cat.items.forEach((name) => {
      if (name === 'Autre') return;
      const n = normalizeSearchText(name);
      if (tokens.every((t) => n.includes(t))) {
        push({ categoryId: cat.id, categoryLabel: cat.label, articleName: name });
      }
    });
  });

  (stockArticles || []).forEach((art) => {
    const n = normalizeSearchText(art.nom || art.designation);
    if (tokens.every((t) => n.includes(t))) {
      push({
        categoryId: 'autres',
        categoryLabel: 'Stock',
        articleName: art.nom || art.designation,
        article_id: art.id,
        fromStock: true,
      });
    }
  });

  return results.slice(0, 25);
}
