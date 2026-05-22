/**
 * CITYMO ERP – Database migration
 * Run: node db/migrate.js
 * Creates all tables if they don't exist (idempotent DDL).
 * Also runs additive ALTER TABLE upgrades safely.
 */
const db = require('./connection');

const migrations = [

  // ─── USERS ──────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    nom            TEXT NOT NULL,
    email          TEXT UNIQUE NOT NULL,
    role           TEXT DEFAULT 'commercial' CHECK(role IN ('admin','commercial','marketing')),
    department_id  INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    password_hash  TEXT,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ─── DEPARTMENTS ────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS departments (
    id          INTEGER PRIMARY KEY,
    code        TEXT NOT NULL UNIQUE,
    nom         TEXT NOT NULL,
    description TEXT
  )`,

  // ─── PROSPECTS ──────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS prospects (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    department_id      INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    type               TEXT NOT NULL CHECK(type IN ('particulier','btob')),
    nom                TEXT NOT NULL,
    prenom             TEXT,
    email              TEXT,
    telephone          TEXT NOT NULL,
    fonction           TEXT,
    secteur            TEXT,
    niveau_decisionnel TEXT,
    type_projet        TEXT NOT NULL,
    action             TEXT,
    commentaire        TEXT,
    created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ─── DEVIS ──────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS devis (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    numero        TEXT UNIQUE,
    prospect_id   INTEGER NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
    type_projet  TEXT NOT NULL CHECK(type_projet IN ('villa','appartement','bureau','showroom','hotel','immeuble')),
    source       TEXT NOT NULL CHECK(source IN ('facebook_ads','landing_page','google_ads','autre')),
    assigne_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    statut       TEXT NOT NULL DEFAULT 'en_attente' CHECK(statut IN ('en_cours','en_attente','realise')),
    commentaire  TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS devis_files (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    devis_id   INTEGER NOT NULL REFERENCES devis(id) ON DELETE CASCADE,
    file_url   TEXT NOT NULL,
    type       TEXT NOT NULL CHECK(type IN ('pdf','image','video')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ─── RDV ────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS rdv (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    department_id     INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    titre             TEXT NOT NULL,
    type_rdv         TEXT,
    date             DATETIME NOT NULL,
    lieu             TEXT,
    prospect_id      INTEGER REFERENCES prospects(id) ON DELETE SET NULL,
    assigne_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
    statut           TEXT NOT NULL DEFAULT 'prevu' CHECK(statut IN ('prevu','realise','annule','reporte')),
    notes            TEXT,
    actions_suivantes TEXT,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS rdv_files (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    rdv_id     INTEGER NOT NULL REFERENCES rdv(id) ON DELETE CASCADE,
    file_url   TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ─── COMPTES RENDUS ─────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS comptes_rendus (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    department_id    INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    rdv_id           INTEGER NOT NULL REFERENCES rdv(id) ON DELETE CASCADE,
    prospect_id      INTEGER REFERENCES prospects(id) ON DELETE SET NULL,
    resume           TEXT,
    decision         TEXT,
    prochaine_action TEXT,
    assigne_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
    date             DATE NOT NULL,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ─── ACTIONS MARKETING ──────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS actions_marketing (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    department_id   INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    titre           TEXT NOT NULL,
    type            TEXT NOT NULL,
    budget          REAL DEFAULT 0,
    date_debut      DATE,
    priorite        TEXT DEFAULT 'normale' CHECK(priorite IN ('haute','normale','basse')),
    statut          TEXT NOT NULL DEFAULT 'en_attente' CHECK(statut IN ('en_cours','en_attente','valide')),
    responsable_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    canal           TEXT CHECK(canal IN ('meta','google','offline','autre')),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ─── DEPENSES ───────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS depenses (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    intitule      TEXT NOT NULL,
    type          TEXT NOT NULL CHECK(type IN ('marketing','commercial')),
    montant       REAL NOT NULL DEFAULT 0,
    date          DATE NOT NULL,
    reference_id  INTEGER,
    fichier_url   TEXT,
    commentaire   TEXT,
    department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ─── PROPOSITIONS MARKETING ─────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS propositions_marketing (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    department_id  INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    titre          TEXT NOT NULL,
    prospect_id    INTEGER REFERENCES prospects(id) ON DELETE SET NULL,
    objectif       TEXT,
    description    TEXT,
    budget_estime  REAL DEFAULT 0,
    statut         TEXT NOT NULL DEFAULT 'brouillon' CHECK(statut IN ('brouillon','envoye','valide','refuse')),
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS propositions_files (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    proposition_id  INTEGER NOT NULL REFERENCES propositions_marketing(id) ON DELETE CASCADE,
    file_url        TEXT NOT NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ─── NOTIFICATIONS ──────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS notifications (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type         TEXT NOT NULL,
    message      TEXT NOT NULL,
    reference_id INTEGER,
    lu           INTEGER NOT NULL DEFAULT 0,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ─── EMPLOYEES (from HR module) ─────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS employees (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    prenom          TEXT NOT NULL,
    nom             TEXT NOT NULL,
    email           TEXT UNIQUE,
    poste           TEXT,
    departement_id  INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    telephone       TEXT,
    date_embauche   DATE,
    salaire         REAL DEFAULT 0,
    statut          TEXT DEFAULT 'Actif',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ─── CLIENTS ────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS clients (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    nom        TEXT NOT NULL,
    email      TEXT,
    telephone  TEXT,
    ville      TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ─── PROJECTS ───────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS projects (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nom             TEXT NOT NULL,
    client          TEXT,
    budget          REAL DEFAULT 0,
    avancement      INTEGER DEFAULT 0,
    statut          TEXT DEFAULT 'Debut',
    date_debut      DATE,
    date_fin        DATE,
    description     TEXT,
    departement_id  INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ─── EXPENSES (charges) ─────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS expenses (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    libelle         TEXT NOT NULL,
    montant         REAL NOT NULL DEFAULT 0,
    categorie       TEXT,
    departement_id  INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    date            DATE,
    statut          TEXT DEFAULT 'En attente',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ─── INVOICES ───────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS invoices (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    client     TEXT,
    montant    REAL DEFAULT 0,
    statut     TEXT DEFAULT 'En attente',
    date       DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ─── PAYMENT ORDERS ─────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS payment_orders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    libelle    TEXT,
    montant    REAL DEFAULT 0,
    statut     TEXT DEFAULT 'En attente',
    date       DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ─── WORKERS ────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS workers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    prenom     TEXT NOT NULL,
    nom        TEXT NOT NULL,
    telephone  TEXT,
    cin        TEXT,
    fonction   TEXT,
    tarif      REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ─── LEAVE REQUESTS ─────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS leave_requests (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    employe     TEXT NOT NULL,
    type        TEXT,
    date_debut  DATE,
    date_fin    DATE,
    date_retour DATE,
    jours       INTEGER DEFAULT 0,
    raison      TEXT,
    statut      TEXT DEFAULT 'En attente',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ─── QUOTES (devis CRM) ─────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS quotes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    client     TEXT,
    montant    REAL DEFAULT 0,
    statut     TEXT DEFAULT 'En attente',
    date       DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ─── PRODUCTS / STOCK ───────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS products (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    nom        TEXT NOT NULL,
    categorie  TEXT,
    prix       REAL DEFAULT 0,
    stock      INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // ─── PURCHASE ORDERS ────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS purchase_orders (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    fournisseur   TEXT,
    montant       REAL DEFAULT 0,
    statut        TEXT DEFAULT 'En attente',
    date          DATE,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
];

console.log('Running migrations...');
db.transaction(() => {
  for (const sql of migrations) {
    db.prepare(sql).run();
  }
})();

/* ── Additive ALTER TABLE upgrades (idempotent – skip if column exists) ────── */
const alterations = [
  'ALTER TABLE users ADD COLUMN password_hash TEXT',
  'ALTER TABLE users ADD COLUMN department_id INTEGER REFERENCES departments(id)',
  'ALTER TABLE users ADD COLUMN updated_at DATETIME',
  'ALTER TABLE prospects ADD COLUMN department_id INTEGER REFERENCES departments(id)',
  'ALTER TABLE devis ADD COLUMN department_id INTEGER REFERENCES departments(id)',
  'ALTER TABLE devis ADD COLUMN numero TEXT',
  'ALTER TABLE rdv ADD COLUMN department_id INTEGER REFERENCES departments(id)',
  'ALTER TABLE comptes_rendus ADD COLUMN department_id INTEGER REFERENCES departments(id)',
  'ALTER TABLE actions_marketing ADD COLUMN department_id INTEGER REFERENCES departments(id)',
  'ALTER TABLE depenses ADD COLUMN department_id INTEGER REFERENCES departments(id)',
  'ALTER TABLE propositions_marketing ADD COLUMN department_id INTEGER REFERENCES departments(id)',
  'ALTER TABLE notifications ADD COLUMN reference_id INTEGER',
];
for (const sql of alterations) {
  try { db.prepare(sql).run(); } catch (_) { /* column exists — skip */ }
}

console.log('Migrations complete.');

module.exports = db;
