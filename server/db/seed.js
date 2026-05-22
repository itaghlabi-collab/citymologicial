/**
 * CITYMO ERP – Seed file
 * Run: node db/seed.js
 * Inserts default departments + demo data (with hashed passwords).
 */
require('./migrate'); // ensure tables exist
const db     = require('./connection');
const bcrypt = require('bcryptjs');

// ── Departments (fixed system list) ────────────────────────────────────────
const DEPARTMENTS = [
  { id: 1, code: 'COM', nom: 'DEPARTEMENT COMMERCIAL',          description: 'Gestion des ventes, clients et devis' },
  { id: 2, code: 'RH',  nom: 'DEPARTEMENT RESSOURCES HUMAINES', description: 'Gestion du personnel, recrutement et conges' },
  { id: 3, code: 'ACH', nom: 'DEPARTEMENT ACHATS',              description: 'Approvisionnement, fournisseurs et commandes' },
  { id: 4, code: 'MKT', nom: 'DEPARTEMENT MARKETING',           description: 'Communication, marketing et actions commerciales' },
  { id: 5, code: 'EXP', nom: 'DEPARTEMENT EXPLOITATION',        description: 'Chantiers, ouvriers et suivi terrain' },
  { id: 6, code: 'CPT', nom: 'DEPARTEMENT COMPTABILITE',        description: 'Finances, tresorerie et charges' },
  { id: 7, code: 'ADM', nom: 'ADMINISTRATION',                  description: 'Direction, administration et systeme' },
  { id: 8, code: 'SAV', nom: 'SERVICE APRES VENTE',             description: 'Interventions, SAV et suivi client post-projet' },
  { id: 9, code: 'LOG', nom: 'LOGISTIQUE',                      description: 'Vehicules, transport et gestion du depot' },
];

const insertDept = db.prepare(
  'INSERT OR REPLACE INTO departments (id, code, nom, description) VALUES (@id, @code, @nom, @description)'
);

db.transaction(() => {
  for (const d of DEPARTMENTS) insertDept.run(d);
})();

// ── Demo users (with hashed passwords) ──────────────────────────────────────
// Passwords: admin→citymo2026, others→citymo123
const hashAdmin = bcrypt.hashSync('citymo2026', 10);
const hashUser  = bcrypt.hashSync('citymo123',  10);

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (nom, email, role, department_id, password_hash)
  VALUES (?, ?, ?, ?, ?)
`);
db.transaction(() => {
  insertUser.run('Ahmed Citymo', 'admin@citymo.dz',  'admin',      7, hashAdmin); // ADM
  insertUser.run('Sara Hamidi',  'sara@citymo.dz',   'commercial', 1, hashUser);  // COM
  insertUser.run('Ali Benali',   'ali@citymo.dz',    'commercial', 1, hashUser);  // COM
  insertUser.run('Leila Mansouri','leila@citymo.dz', 'marketing',  4, hashUser);  // MKT
})();

// Update password_hash for existing records that have none (for re-seeding)
db.prepare("UPDATE users SET password_hash = ? WHERE email = 'admin@citymo.dz' AND (password_hash IS NULL OR password_hash = '')").run(hashAdmin);
db.prepare("UPDATE users SET password_hash = ? WHERE email != 'admin@citymo.dz' AND (password_hash IS NULL OR password_hash = '')").run(hashUser);

// ── Demo prospects ──────────────────────────────────────────────────────────
const insertProspect = db.prepare(`
  INSERT OR IGNORE INTO prospects (type, nom, prenom, telephone, type_projet, action, commentaire)
  VALUES (@type, @nom, @prenom, @telephone, @type_projet, @action, @commentaire)
`);
db.transaction(() => {
  insertProspect.run({ type: 'particulier', nom: 'Amrani',  prenom: 'Youssef', telephone: '+212 600 111 222', type_projet: 'villa',        action: 'Appel entrant', commentaire: 'Interesse par une villa 200m2' });
  insertProspect.run({ type: 'btob',        nom: 'Horizon', prenom: 'Group',   telephone: '+212 661 333 444', type_projet: 'immeuble',      action: 'Email',         commentaire: 'Projet immeuble R+5' });
  insertProspect.run({ type: 'particulier', nom: 'Tazi',    prenom: 'Nadia',   telephone: '+212 600 555 666', type_projet: 'appartement',   action: 'WhatsApp',      commentaire: 'Cherche 3 pieces' });
})();

// ── Demo actions marketing ───────────────────────────────────────────────────
const insertAction = db.prepare(`
  INSERT OR IGNORE INTO actions_marketing (titre, type, budget, priorite, statut, canal)
  VALUES (@titre, @type, @budget, @priorite, @statut, @canal)
`);
db.transaction(() => {
  insertAction.run({ titre: 'Campagne Facebook Ete 2026', type: 'Publicite',    budget: 15000, priorite: 'haute',   statut: 'en_cours',   canal: 'meta' });
  insertAction.run({ titre: 'Google Ads Residence',       type: 'SEA',          budget: 8000,  priorite: 'normale', statut: 'en_attente', canal: 'google' });
  insertAction.run({ titre: 'Salon immobilier Casablanca',type: 'Evenementiel', budget: 25000, priorite: 'haute',   statut: 'valide',     canal: 'offline' });
})();

console.log('Seed complete.');
