# CITYMO ERP — Rapport d'audit migration Localhost ↔ Vercel ↔ Supabase Production

**Date :** 2026-05-25  
**Projet Supabase attendu :** `https://npddbwsskaojcawaxygh.supabase.co`  
**Frontend production :** `https://citymologicial.vercel.app`  
**Référentiel code :** branche `main` (post-sync migrations + hooks Supabase)

---

## Synthèse exécutive

| Dimension | Localhost (code actuel) | Vercel (si env OK) | Risque principal |
|-----------|-------------------------|--------------------|------------------|
| **Persistance métier** | Supabase Postgres + Storage | Même Supabase si `VITE_*` corrects | Migrations SQL non appliquées en prod |
| **Données « localhost »** | **Pas de localStorage métier** — tout est Supabase | Identique | Confusion avec ancien build Vercel (mock) |
| **Modules UI-only** | Finance, Achats, Inventaire, Documents, Admin (partiel) | Identique — **non persistés** | Fonctionnalités visibles mais vides |
| **OCR CIN** | `/api` → Express local ou Vercel serverless | Mindee si `MINDEE_*` sur Vercel | Tesseract seul = extraction fragile |
| **Dashboard** | Mix Express `safeGet` → `[]` + Supabase partiel | Express absent → KPIs vides | Tableau de bord incomplet |

**Conclusion :** Pour reproduire localhost sur Vercel, il faut **(1)** déployer le **dernier frontend**, **(2)** exécuter **toutes les migrations** (ou `RUN_FULL_RESTORE_CITYMO.sql`) sur Supabase Production, **(3)** configurer **Vercel env** (Supabase + Mindee), **(4)** accepter que les modules **non branchés Supabase** restent locaux à la session navigateur.

---

## Architecture données globale

```
┌─────────────────────────────────────────────────────────────────┐
│  Navigateur (localhost:5173 ou citymologicial.vercel.app)       │
│  React + Vite — src/services/* + src/hooks/*                    │
└───────────────────────────┬─────────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
  Supabase Auth      Supabase Postgres    Supabase Storage
  (profiles)         35 tables public      citymo-workers
                     RLS authenticated     citymo-projects
         │
         ▼ (optionnel / partiel)
  /api/*  Express local :3000  OU  Vercel serverless api/ocr/*
```

| Mécanisme | Usage |
|-----------|--------|
| **localStorage** | Session auth Supabase uniquement (`citymo-supabase-auth`) |
| **IndexedDB** | Non utilisé |
| **Fichiers JSON / mock runtime** | Aucun pour modules Supabase ; seeds = scripts SQL |
| **SQLite** | Non utilisé |
| **Express `api.js`** | Legacy — `safeGet()` retourne `[]` si API down |

---

## Inventaire migrations Supabase (36 fichiers)

**Tables attendues (35) :** voir `AUDIT_SCHEMA_CITYMO.sql`.

| # | Fichier migration | Tables / effet |
|---|-------------------|----------------|
| 1 | `20260525000000_rh_schema.sql` | `departments`, `profiles`, `employees`, `leaves`, `attendance`, `payroll` + seed départements |
| 2 | `20260525000001_profiles_insert_policy.sql` | RLS profiles |
| 3 | `20260525200000_leaves_rls_super_admin.sql` | RLS leaves (super-admin) |
| 4 | `20260525300000_workers_schema.sql` | `workers`, `worker_documents` + bucket `citymo-workers` |
| 5–7 | attendance / overtime / payroll alters | Colonnes ouvriers |
| 8–14 | commercial | `prospects`, `devis`, `planning_commercial`, `actions_marketing`, `comptes_rendus`, `depenses`, `propositions_marketing` |
| 15–22 | CRM | `clients`, `categories`, `articles`, `crm_devis*`, `crm_factures*` |
| 23–24 | internal | `internal_tasks`, `internal_appointments` |
| 25–27 | employees extended + seeds | CIN champs ; 25 employés (safe reseed) |
| 28–31 | logistique | `vehicles` + seed 18 ; interventions |
| 32 | delivery notes | `delivery_notes`, `delivery_note_items` |
| 33–36 | projets / SAV | `projects`, `project_documents`, `sav_*`, bucket `citymo-projects` |

**Si seules 3 migrations ont été exécutées en prod** → **32 tables manquantes** → listes vides / `relation does not exist`.

---

## Audit par module

Légende statut **Prod = Localhost** :
- ✅ **OUI** — même code + Supabase requis
- ⚠️ **PARTIEL** — UI OK, données ou sous-fonctions manquantes
- ❌ **NON** — pas de persistance Supabase (UI mock / mémoire)
- 🔧 **INFRA** — dépend config Vercel / SQL / Edge Function

---

### Organisation interne

| Écran | Route `App.jsx` | Stockage localhost | Table(s) Supabase | Migré ? | Prod = Local ? |
|-------|-----------------|-------------------|-------------------|---------|----------------|
| Tableau de bord | `dashboard` | Express `api.js` + `internalDashboard.js` | `internal_*`, `prospects`, `crm_devis`, `crm_factures` (partiel) | Si SQL OK | ⚠️ KPIs Express vides sur Vercel |
| Tâches | `taches` | Supabase | `internal_tasks` | Seed non | ✅ |
| Rendez-vous | `rendezvous` | Supabase | `internal_appointments` | Seed non | ✅ |

**Manques :** Dashboard appelle encore `getInvoices`, `getProjects`, etc. via Express → **tableaux vides en prod** sans serveur Express.

---

### Ressources Humaines

| Écran | Stockage | Table(s) | Seeds prod | Prod = Local ? |
|-------|----------|----------|------------|----------------|
| Départements | **`src/data/departments.js`** (statique) | `departments` en DB mais **non lu** | 9 en SQL | ⚠️ Liste UI ≠ table DB |
| Employés | Supabase | `employees` | `20260527140000` (25 UPSERT) | ✅ si SQL + seed |
| Demande de congé | Supabase | `leaves` + join `employees` | Non | ✅ |
| Edge email congé | Supabase Function | — | 🔧 `notify-leave-request` à déployer + `RESEND_*` | ⚠️ |

**Fichiers :** `src/services/rh/employees.js`, `leaves.js`, `hooks/useEmployees.js`, `useLeaves.js`, `components/RH.jsx`, `Conges.jsx`

**Permissions :** RLS `leaves` (own + admin via `profiles.role` / super-admin migration)

---

### Employés externes (Ouvriers)

| Écran | Stockage | Table(s) | Storage | Prod = Local ? |
|-------|----------|----------|---------|----------------|
| Ouvriers | Supabase | `workers`, `worker_documents` | `citymo-workers` | ✅ |
| Présence | Supabase | `attendance` | — | ✅ (fallback SQL si join échoue) |
| Heures supp. | Supabase | `overtime` | — | ✅ |
| Paiement hebdo | Supabase | `payroll` | — | ✅ |

**OCR CIN :** `ocr.js` → `/api/ocr/moroccan-cin` ; résultat → `workers` + Storage.

| Composant | Infra prod |
|-----------|------------|
| Scan CIN | 🔧 `MINDEE_API_KEY`, `MINDEE_MODEL_ID` (Vercel) ; sinon Tesseract navigateur |

**Ancien nom incorrect :** `leave_requests` → **`leaves`** ; `presence_workers` → **`attendance`** ; `weekly_payments` → **`payroll`**

---

### Commercial / Marketing

| Écran | Table Supabase | Seed | Prod = Local ? |
|-------|----------------|------|----------------|
| Prospects | `prospects` | Non | ✅ |
| Devis en attente | `devis` | Non | ✅ (≠ `crm_devis`) |
| Planning commercial | `planning_commercial` | Non | ⚠️ un flux CR via Express legacy |
| Actions marketing | `actions_marketing` | Non | ✅ |
| Compte rendu | `comptes_rendus` | Non | ✅ |
| Dépenses | `depenses` | Non | ✅ |
| Propositions | `propositions_marketing` | Non | ✅ |

**Fichiers :** `src/services/commercial/*`, `src/hooks/use*.js`, `src/components/commercial/*`

**Non routé :** `Marketing.jsx` (mock in-memory) — **pas dans la nav**

---

### CRM

| Écran | Table(s) | Seed SQL | Prod = Local ? |
|-------|----------|----------|----------------|
| Clients | `clients` | Oui si vide | ✅ liste ; ⚠️ détail client (projets/devis/factures onglets) = **SEED vides** |
| Catégories | `categories` | Oui | ✅ |
| Articles | `articles` | Oui | ✅ |
| Devis | `crm_devis`, `crm_devis_lignes` | Non | ✅ + PDF |
| Factures | `crm_factures`, `crm_facture_lignes`, `crm_facture_paiements` | Non | ✅ + PDF |
| Bon de livraison | `delivery_notes`, `delivery_note_items` | Non | ✅ + PDF |

**Orphelin :** `CRM.jsx` → Express `safeGet` — **non monté** dans `App.jsx`

---

### Logistique

| Écran | Table(s) | Seed | Prod = Local ? |
|-------|----------|------|----------------|
| Véhicules | `vehicles` | 18 véhicules | ✅ |
| Demandes d'intervention | `vehicle_intervention_requests` | Non | ✅ |
| Historique | `vehicle_intervention_history` | Non | ✅ |

**Fichiers :** `Logistique.jsx`, `services/logistique/*`

---

### Projets & SAV

| Écran | Table(s) | Storage | Prod = Local ? |
|-------|----------|---------|----------------|
| Projets | `projects` | — | ✅ |
| Documents projet | `project_documents` | `citymo-projects` | ✅ |
| SAV | `sav_requests` | — | ✅ |
| Comptes rendus SAV | `sav_reports` | `citymo-projects` (médias) | ✅ |

**Legacy :** route `sav` → `SAV.jsx` (mock) — **non dans nav principale**

---

### Documents (GED)

| Écran | Stockage | Tables | Prod = Local ? |
|-------|----------|--------|----------------|
| Mes documents, Partagés, Liens, Corbeille | **React `useState` uniquement** | Aucune | ❌ **Perte au refresh** |

`uploadService.js` existe mais **non utilisé** par le module Documents.

---

### Finance & Trésorerie

| Écran | Stockage | Tables | Prod = Local ? |
|-------|----------|--------|----------------|
| Catégories charge, Charges, Ordres paiement | **useState local** | Aucune | ❌ |

`Comptabilite.jsx` (si accessible) → Express `safeGet`.

---

### Achats

| Écran | Stockage | Tables | Prod = Local ? |
|-------|----------|--------|----------------|
| Demandes, BC, Fournisseurs, Comparaison, Ordres | **useState local** | Aucune | ❌ |

---

### Inventaire & Dépôt

| Écran | Stockage | Tables | Prod = Local ? |
|-------|----------|--------|----------------|
| Catégories stock, Articles, Dépôts, Mouvements, Stocks | **useState local** | Aucune | ❌ |

*(Ne pas confondre avec CRM `articles` / `categories` — tables différentes, module non implémenté.)*

---

### Administration

| Écran | Stockage | Tables | Prod = Local ? |
|-------|----------|--------|----------------|
| Utilisateurs, Rôles, Sauvegardes | **useState local** | `profiles` existe pour **auth** | ❌ UI admin non branchée |

Auth réelle : `profiles` via `src/services/supabase/auth.js`.

---

### OCR / Scan CIN

| Élément | Localhost | Vercel |
|---------|-----------|--------|
| UI | `OuvriersListe.jsx` | Identique |
| API Mindee | `localhost:3000/api` (proxy Vite) ou serverless | `/api/ocr/moroccan-cin` |
| Persistance | `workers` + `citymo-workers` | Identique si Supabase OK |
| Fallback | Tesseract.js client | Identique |

**Variables Vercel requises :** `MINDEE_API_KEY`, `MINDEE_MODEL_ID` (si clé `md_*`), `OCR_PROVIDER=mindee`

---

## Matrice : données manquantes possibles en production

### A. Schéma Supabase (critique)

Exécuter dans SQL Editor :

1. `supabase/AUDIT_SCHEMA_CITYMO.sql` — colonne `MANQUANTE`
2. Si manques → `supabase/RUN_FULL_RESTORE_CITYMO.sql`
3. Re-audit

### B. Seeds / données métier

| Donnée | Script | Comptage attendu |
|--------|--------|----------------|
| Départements | inclus dans RH schema | 9 |
| Employés CITYMO | `20260527140000` ou `RUN_IMPORT_25_EMPLOYEES.sql` | 25 |
| Clients CRM | `20260526000000` | si table vide |
| Catégories / Articles | `20260526010000`, `20260526020000` | si vides |
| Véhicules | `20260527150100` ou `RUN_IMPORT_18_VEHICULES.sql` | 18 |
| Ouvriers, présence, paie | saisie utilisateur | variable |
| Projets, SAV, commercial | saisie utilisateur | variable |

**Données créées uniquement en local dans le navigateur** (Documents, Finance, Achats, Inventaire) : **non migrables** — jamais dans Supabase.

### C. Données localhost dans Supabase non reproductibles automatiquement

Tout enregistrement créé via l'app **après** connexion Supabase est déjà dans **le projet Supabase cloud** (pas sur la machine locale).  
« Localhost » et « Vercel » partagent la **même base** si `VITE_SUPABASE_URL` pointe vers `npddbwsskaojcawaxygh`.

**Exception :** si localhost utilisait un **autre** projet Supabase (.env différent) → export/import manuel requis (pg_dump / CSV).

---

## Fonctionnalités manquantes ou divergentes (code)

| Fonctionnalité | Localhost (code actuel) | Production Vercel | Action |
|----------------|-------------------------|-----------------|--------|
| Liste employés RH | Supabase | Idem si migrations | Appliquer SQL |
| CRUD ouvriers + CIN | Supabase + Storage + OCR | + Mindee env | Config Vercel |
| CRM complet | Supabase | Idem | SQL + seeds |
| Détail client (onglets liés) | **Toujours vide** (SEED) | Idem | Développer requêtes join |
| Dashboard KPIs Express | Partiel si Express up | **Vide** | Migrer vers Supabase |
| Documents GED | Mémoire session | Idem | Implémenter tables + storage |
| Finance / Achats / Inventaire | Mémoire session | Idem | Implémenter schéma + services |
| Admin utilisateurs | Mémoire session | Idem | Brancher `profiles` / Auth admin |
| Email congé | Edge Function | Idem si déployée | `supabase functions deploy` |
| Départements UI | Fichier JS statique | Idem | Option : lire table `departments` |

---

## Routes & API

| Route frontend | Composant | Backend |
|----------------|-----------|---------|
| Tous IDs `NAV` dans `App.jsx` | Voir `PageContent` | Supabase sauf modules ❌ |
| `/api/ocr/moroccan-cin` | OCR | Vercel serverless + `lib/mindeeMoroccanCin.mjs` |
| Express `/api/*` (legacy) | Dashboard, Planning (partiel) | **Non déployé sur Vercel** |

**Vercel :** sans `VITE_API_URL` externe, `resolveApiBaseUrl()` utilise `https://citymologicial.vercel.app/api` → OCR OK si function déployée.

---

## Permissions (RLS)

Politique dominante : **`authenticated`** — accès lecture/écriture pour utilisateurs connectés.

| Table | Politique type |
|-------|----------------|
| `leaves` | own + admin / super-admin |
| `workers` | select/insert/update/delete auth |
| CRM / commercial / logistique / projets | `*_all_auth` |
| Storage | `citymo-workers`, `citymo-projects` — authenticated |

**Manque potentiel :** granularité RBAC par rôle (la plupart des tables = tout auth).  
**Admin UI** ne gère pas les rôles en base.

**Prérequis prod :** utilisateurs dans **Supabase Auth** + ligne **`profiles`** (trigger à vérifier après signup).

---

## Checklist : reproduire localhost sur Vercel (ordre strict)

### Phase 1 — Supabase Production

- [ ] Confirmer projet `npddbwsskaojcawaxygh`
- [ ] Exécuter `AUDIT_SCHEMA_CITYMO.sql`
- [ ] Exécuter `RUN_FULL_RESTORE_CITYMO.sql` si tables manquantes
- [ ] Vérifier buckets `citymo-workers`, `citymo-projects`
- [ ] Re-exécuter audit — **0 table MANQUANTE**
- [ ] Vérifier comptages (`employees` ≥ 25, `vehicles` ≥ 18 si seeds OK)
- [ ] Déployer Edge Function `notify-leave-request` + secrets Resend (optionnel)

### Phase 2 — Vercel Environment

- [ ] `VITE_SUPABASE_URL=https://npddbwsskaojcawaxygh.supabase.co`
- [ ] `VITE_SUPABASE_ANON_KEY=` (clé anon ~208 caractères)
- [ ] `MINDEE_API_KEY`, `MINDEE_MODEL_ID`, `OCR_PROVIDER=mindee`
- [ ] Ne pas pointer vers un autre projet Supabase par erreur
- [ ] Redéployer après changement env

### Phase 3 — Validation fonctionnelle (identique local)

- [ ] Auth login
- [ ] RH → Employés (liste peuplée)
- [ ] Ouvriers → CRUD + scan CIN
- [ ] Présence / Heures sup / Paiement hebdo
- [ ] Commercial (7 écrans)
- [ ] CRM (6 écrans + PDF)
- [ ] Logistique (3 onglets)
- [ ] Projets + SAV + CR SAV
- [ ] Console : aucune `relation does not exist`

### Phase 4 — Écarts acceptés (non bloquants pour parité « métier »)

- [ ] Documents / Finance / Achats / Inventaire / Admin = **non persistés** (identique local)
- [ ] Dashboard KPIs Express = incomplet jusqu'à refactor
- [ ] Détail client CRM onglets liés = vide (identique local)

---

## Scripts SQL utiles (après full restore)

| Script | Usage |
|--------|--------|
| `RUN_IMPORT_25_EMPLOYEES.sql` | Employés |
| `RUN_IMPORT_18_VEHICULES.sql` | Véhicules |
| `RUN_PRESENCE_COMPLET.sql` | Présence / attendance |
| `RUN_VEHICULES_COMPLET.sql` | Logistique |
| `RUN_INTERVENTIONS_COMPLET.sql` | Interventions |
| `RUN_SAV_COMPLETE.sql` | SAV |
| `RUN_DELIVERY_NOTES_COMPLET.sql` | Bons de livraison |

---

## Réponse à « Je ne veux perdre aucune donnée localhost »

1. **Données Supabase** : déjà centralisées — Vercel et localhost lisent la **même URL** → pas de perte si même projet et migrations OK.

2. **Données saisies en local dans Documents / Finance / Achats / Inventaire** : **jamais sauvegardées** — perdues au refresh **même en localhost** → il faut **développement** pour parité future.

3. **Données créées dans modules Supabase** : sauvegardées en cloud — assurer migrations + pas d'ancien build Vercel.

4. **Fichiers Storage** (CIN, photos ouvriers, médias SAV) : vérifier buckets + policies après restore.

5. **Export de secours recommandé** : Supabase Dashboard → Database Backups / export CSV par table avant grosse migration.

---

## Annexe — Tables ↔ modules (référence rapide)

```
RH:           employees, leaves, attendance, payroll, departments*, profiles
Externes:     workers, worker_documents, overtime
Org:          internal_tasks, internal_appointments
Commercial:   prospects, devis, planning_commercial, actions_marketing,
              comptes_rendus, depenses, propositions_marketing
CRM:          clients, categories, articles, crm_devis(+lignes),
              crm_factures(+lignes+paiements), delivery_notes(+items)
Logistique:   vehicles, vehicle_intervention_requests, vehicle_intervention_history
Projets:      projects, project_documents, sav_requests, sav_reports
Storage:      citymo-workers, citymo-projects

* departments en DB ; UI utilise src/data/departments.js
```

---

*Rapport généré par audit statique du dépôt `citymologicial`. Pour l'état réel de Production, exécuter `AUDIT_SCHEMA_CITYMO.sql` sur le projet Supabase et comparer les comptages.*
