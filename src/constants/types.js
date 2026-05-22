/**
 * types.js — CITYMO Centralized Type Definitions
 *
 * JavaScript object shapes used throughout the ERP.
 * Compatible with PostgreSQL / Supabase schema conventions.
 *
 * All records follow the pattern:
 *   { id, created_at, updated_at, ...fields }
 *
 * When migrating to TypeScript, convert these to TypeScript interfaces.
 */

/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} nom
 * @property {string} email
 * @property {string} role          - 'Super Admin' | 'Admin' | 'Manager' | 'Utilisateur'
 * @property {string} initiales
 * @property {string} [avatar_url]
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} Worker
 * @property {string|number} id
 * @property {string} nom
 * @property {string} prenom
 * @property {string} [telephone]
 * @property {string} [cin]
 * @property {string} [cin_url]     - URL to uploaded CIN scan
 * @property {string} [metier]
 * @property {string} [projet_actuel]
 * @property {string} status        - 'Present' | 'Absent' | 'Conge' | 'Inactif'
 * @property {number} [salaire_journalier]
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} AttendanceRecord
 * @property {string|number} id
 * @property {string|number} ouvrier_id
 * @property {string} ouvrier        - Full name
 * @property {string} projet
 * @property {string} date           - YYYY-MM-DD
 * @property {string} heure_entree   - HH:mm
 * @property {string} heure_sortie   - HH:mm
 * @property {string} statut         - 'Present' | 'Absent' | 'Retard' | 'Demi-journee'
 * @property {string} [notes]
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} OvertimeRecord
 * @property {string|number} id
 * @property {string|number} ouvrier_id
 * @property {string} ouvrier
 * @property {string} projet
 * @property {string} date
 * @property {number} heures
 * @property {number} [taux_horaire]
 * @property {string} [motif]
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} PayrollRecord
 * @property {string|number} id
 * @property {string|number} ouvrier_id
 * @property {string} ouvrier
 * @property {string} semaine         - e.g. "2026-W01"
 * @property {number} jours_travailles
 * @property {number} heures_sup
 * @property {number} salaire_base
 * @property {number} prime_sup
 * @property {number} total
 * @property {string} statut          - 'en_attente' | 'valide' | 'paye'
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} LeaveRequest
 * @property {string|number} id
 * @property {string|number} employe_id
 * @property {string} employe
 * @property {string} type            - 'conge_paye' | 'maladie' | 'sans_solde' | 'autre'
 * @property {string} date_debut
 * @property {string} date_fin
 * @property {number} nb_jours
 * @property {string} motif
 * @property {string} statut          - 'en_attente' | 'approuve' | 'refuse'
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} Project
 * @property {string|number} id
 * @property {string} nom
 * @property {string} [description]
 * @property {string} statut          - 'en_cours' | 'termine' | 'en_attente' | 'annule'
 * @property {string} [client_id]
 * @property {string} [client_nom]
 * @property {string} [date_debut]
 * @property {string} [date_fin]
 * @property {number} [budget]
 * @property {string} [adresse]
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} Client
 * @property {string|number} id
 * @property {string} nom
 * @property {string} [prenom]
 * @property {string} type            - 'btob' | 'btoc'
 * @property {string} [email]
 * @property {string} [telephone]
 * @property {string} [adresse]
 * @property {string} [siret]
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} Prospect
 * @property {string|number} id
 * @property {string} [nom]
 * @property {string} [prenom]
 * @property {string} type            - 'btob' | 'btoc'
 * @property {string} [email]
 * @property {string} [telephone]
 * @property {string} [type_projet]
 * @property {string} [source]
 * @property {string} statut          - 'nouveau' | 'en_cours' | 'gagne' | 'perdu'
 * @property {string} [action]
 * @property {string} [notes]
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} Quote
 * @property {string|number} id
 * @property {string} numero
 * @property {string} [prospect_id]
 * @property {string} [prospect_nom]
 * @property {string} type_projet
 * @property {string} source
 * @property {string} statut          - 'en_attente' | 'en_cours' | 'realise'
 * @property {string} [commentaire]
 * @property {string} [assigne_id]
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} Invoice
 * @property {string|number} id
 * @property {string} numero
 * @property {string} [client_id]
 * @property {string} [client_nom]
 * @property {number} montant_ht
 * @property {number} tva
 * @property {number} montant_ttc
 * @property {string} statut          - 'brouillon' | 'envoyee' | 'payee' | 'annulee'
 * @property {string} [date_echeance]
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} Expense
 * @property {string|number} id
 * @property {string} titre
 * @property {number} montant
 * @property {string} [categorie]
 * @property {string} [date]
 * @property {string} [description]
 * @property {string} [justificatif_url]
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} Vehicle
 * @property {string|number} id
 * @property {string} immatriculation
 * @property {string} [marque]
 * @property {string} [modele]
 * @property {string} [type]         - 'camion' | 'utilitaire' | 'voiture' | 'engin'
 * @property {string} statut         - 'disponible' | 'affecte' | 'intervention' | 'hors_service' | 'maintenance'
 * @property {number} [kilometrage]
 * @property {string} [date_revision]
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} Intervention
 * @property {string|number} id
 * @property {string} titre
 * @property {string} [vehicule_id]
 * @property {string} [vehicule_immat]
 * @property {string} type           - 'preventive' | 'corrective' | 'urgente'
 * @property {string} priorite       - 'faible' | 'normale' | 'urgente' | 'critique'
 * @property {string} statut         - 'en_attente' | 'diagnostic' | 'en_cours' | 'termine' | 'annule'
 * @property {string} [date_demande]
 * @property {string} [date_fin]
 * @property {number} [cout]
 * @property {string} [description]
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} Supplier
 * @property {string|number} id
 * @property {string} nom
 * @property {string} [categorie]
 * @property {string} [email]
 * @property {string} [telephone]
 * @property {string} [adresse]
 * @property {string} [siret]
 * @property {string} [site_web]
 * @property {string} statut         - 'actif' | 'inactif' | 'blackliste'
 * @property {number} [note]         - 0–5
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} StockItem
 * @property {string|number} id
 * @property {string} reference
 * @property {string} nom
 * @property {string} [categorie_id]
 * @property {string} [categorie_nom]
 * @property {string} unite
 * @property {number} quantite
 * @property {number} [quantite_min]
 * @property {number} [prix_unitaire]
 * @property {string} [depot_id]
 * @property {string} [depot_nom]
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} Document
 * @property {string|number} id
 * @property {string} nom
 * @property {string} [type]         - 'pdf' | 'image' | 'spreadsheet' | 'document' | 'other'
 * @property {string} url
 * @property {number} [taille]       - bytes
 * @property {string} [dossier_id]
 * @property {string} [partage_par]
 * @property {boolean} [public]
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} MarketingAction
 * @property {string|number} id
 * @property {string} titre
 * @property {string} type
 * @property {string} canal
 * @property {number} [budget]
 * @property {string} priorite       - 'haute' | 'normale' | 'basse'
 * @property {string} statut         - 'en_attente' | 'en_cours' | 'valide' | 'termine' | 'annule'
 * @property {string} [date_debut]
 * @property {string} [date_fin]
 * @property {string} [description]
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} RDV
 * @property {string|number} id
 * @property {string} titre
 * @property {string} rdv_type       - 'prevu' | 'rapide'
 * @property {string} [type_rdv]
 * @property {string} statut         - 'planifie' | 'confirme' | 'realise' | 'annule' | 'reporte'
 * @property {string} date           - YYYY-MM-DD
 * @property {string} [heure]        - HH:mm
 * @property {string} [lieu]
 * @property {string|number} [prospect_id]
 * @property {string} [type_projet]
 * @property {string} [notes]
 * @property {string} [actions_suivantes]
 * @property {string} [secteur]
 * @property {string} [societe]
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} CompteRendu
 * @property {string|number} id
 * @property {string|number} [rdv_id]
 * @property {string|number} [prospect_id]
 * @property {string} resume
 * @property {string} [decision]
 * @property {string} [prochaine_action]
 * @property {string} date
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} SAVTicket
 * @property {string|number} id
 * @property {string} titre
 * @property {string} [client_id]
 * @property {string} [client_nom]
 * @property {string} [projet_id]
 * @property {string} priorite       - 'faible' | 'normale' | 'haute' | 'critique'
 * @property {string} statut         - 'ouvert' | 'en_cours' | 'en_attente' | 'resolu' | 'ferme'
 * @property {string} [description]
 * @property {string} created_at
 * @property {string} updated_at
 */

// Export all type names as string constants for runtime reference
export const TYPE_NAMES = {
  USER:              'User',
  WORKER:            'Worker',
  ATTENDANCE:        'AttendanceRecord',
  OVERTIME:          'OvertimeRecord',
  PAYROLL:           'PayrollRecord',
  LEAVE_REQUEST:     'LeaveRequest',
  PROJECT:           'Project',
  CLIENT:            'Client',
  PROSPECT:          'Prospect',
  QUOTE:             'Quote',
  INVOICE:           'Invoice',
  EXPENSE:           'Expense',
  VEHICLE:           'Vehicle',
  INTERVENTION:      'Intervention',
  SUPPLIER:          'Supplier',
  STOCK_ITEM:        'StockItem',
  DOCUMENT:          'Document',
  MARKETING_ACTION:  'MarketingAction',
  RDV:               'RDV',
  COMPTE_RENDU:      'CompteRendu',
  SAV_TICKET:        'SAVTicket',
};
