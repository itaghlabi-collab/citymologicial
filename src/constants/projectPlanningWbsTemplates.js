/**
 * Modèles WBS par lot — import optionnel dans le planning chantier.
 * Structure indicative : l'utilisateur peut modifier / supprimer après import.
 */

/** @typedef {{ nom: string, wbs_code?: string, duree_jours?: number, children?: Array<{ nom: string, wbs_code?: string, duree_jours?: number }> }} WbsTemplateNode */

/** @type {Record<string, WbsTemplateNode[]>} */
export const PLANNING_WBS_TEMPLATES = {
  'Études et préparation': [
    { nom: 'Étude dossier', wbs_code: '1', duree_jours: 7 },
    { nom: 'Préparation administrative et technique', wbs_code: '2', duree_jours: 7 },
  ],
  'Installation chantier': [
    { nom: 'Implantation chantier et installation provisoire', wbs_code: '1', duree_jours: 5 },
  ],
  'Topographie et implantation': [
    { nom: 'Implantation et repérage', wbs_code: '1', duree_jours: 3 },
  ],
  Terrassement: [
    { nom: 'Décapage et terrassement général', wbs_code: '1', duree_jours: 7 },
    { nom: 'Remblai et compactage', wbs_code: '2', duree_jours: 5 },
  ],
  'Gros œuvre': [
    {
      nom: 'Fondations',
      wbs_code: '1',
      duree_jours: 14,
      children: [
        { nom: 'Béton de propreté', wbs_code: '1.1', duree_jours: 2 },
        { nom: 'Armatures', wbs_code: '1.2', duree_jours: 4 },
        { nom: 'Coffrage', wbs_code: '1.3', duree_jours: 3 },
        { nom: 'Coulage béton', wbs_code: '1.4', duree_jours: 3 },
      ],
    },
    {
      nom: 'Élévation',
      wbs_code: '2',
      duree_jours: 21,
      children: [
        { nom: 'Poteaux', wbs_code: '2.1', duree_jours: 7 },
        { nom: 'Voiles', wbs_code: '2.2', duree_jours: 7 },
        { nom: 'Dalles', wbs_code: '2.3', duree_jours: 7 },
      ],
    },
    { nom: 'Maçonnerie', wbs_code: '3', duree_jours: 10 },
    { nom: 'Enduits', wbs_code: '4', duree_jours: 8 },
  ],
  'Second œuvre': [
    { nom: 'Cloisons', wbs_code: '1', duree_jours: 7 },
    { nom: 'Doublages', wbs_code: '2', duree_jours: 5 },
  ],
  TCE: [
    { nom: 'Lots techniques', wbs_code: '1', duree_jours: 14 },
  ],
  Électricité: [
    { nom: 'Alimentation et tableaux', wbs_code: '1', duree_jours: 7 },
    { nom: 'Éclairage et prises', wbs_code: '2', duree_jours: 7 },
  ],
  Plomberie: [
    { nom: 'Réseaux EF / EC', wbs_code: '1', duree_jours: 7 },
    { nom: 'Appareils sanitaires', wbs_code: '2', duree_jours: 5 },
  ],
  Peinture: [
    { nom: 'Préparation supports', wbs_code: '1', duree_jours: 5 },
    { nom: 'Peinture finition', wbs_code: '2', duree_jours: 7 },
  ],
  Menuiserie: [
    { nom: 'Menuiseries intérieures', wbs_code: '1', duree_jours: 7 },
    { nom: 'Menuiseries extérieures', wbs_code: '2', duree_jours: 7 },
  ],
  Carrelage: [
    { nom: 'Carrelage sol', wbs_code: '1', duree_jours: 7 },
    { nom: 'Carrelage mural', wbs_code: '2', duree_jours: 5 },
  ],
  Étanchéité: [
    { nom: 'Étanchéité toiture / terrasse', wbs_code: '1', duree_jours: 5 },
  ],
  Finitions: [
    { nom: 'Finitions générales', wbs_code: '1', duree_jours: 10 },
  ],
};

export function hasPlanningWbsTemplate(lot) {
  const items = PLANNING_WBS_TEMPLATES[lot];
  return Array.isArray(items) && items.length > 0;
}

export function countPlanningWbsTemplateTasks(lot) {
  const items = PLANNING_WBS_TEMPLATES[lot] || [];
  return items.reduce((n, item) => n + 1 + (item.children?.length || 0), 0);
}
