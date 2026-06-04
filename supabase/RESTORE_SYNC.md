# CITYMO — Synchronisation local / Vercel / Supabase

## Diagnostic : pourquoi les données « disparaissent » sur Vercel

**Ce n’est en général pas une perte de données Supabase**, mais une **désynchronisation double** :

### 1. Frontend Vercel ≠ code local (cause principale)

Sur `main` (déployé par Vercel), il manquait jusqu’ici :

- **33 migrations** sur 36 (`supabase/migrations/` non commitées)
- **~100 fichiers** services/hooks Supabase (`useClients`, `useWorkers`, CRM, etc.)
- Composants branchés **mock / état local** sur GitHub, **Supabase** en local

Résultat : même URL Supabase correcte, l’app Vercel n’appelait pas les bonnes tables.

### 2. Base Supabase production incomplète

Si seules les 3 premières migrations ont été exécutées dans le SQL Editor :

- `20260525000000_rh_schema.sql`
- `20260525000001_profiles_insert_policy.sql`
- `20260525200000_leaves_rls_super_admin.sql`

…alors **tables CRM, workers, véhicules, projets, etc. n’existent pas** → listes vides ou erreurs RLS.

### 3. Vérification projet Supabase

L’app doit utiliser **exclusivement** :

`https://npddbwsskaojcawaxygh.supabase.co`

Variables Vercel : `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (clé anon ~208 caractères).

---

## Noms de tables (référence code ↔ votre liste)

| Vous avez écrit | Nom réel dans le code |
|-----------------|----------------------|
| `leave_requests` | `leaves` |
| `devis_en_attente` | `devis` (commercial) |
| `presence_workers` | `attendance` |
| `weekly_payments` | `payroll` |
| `worker_equipment` | champs sur `workers` (pointure, casque, etc.) — pas de table séparée |
| `marketing_actions` | `actions_marketing` |
| `propositions` | `propositions_marketing` |
| devis CRM | `crm_devis` + `crm_devis_lignes` |
| factures CRM | `crm_factures` + `crm_facture_lignes` + `crm_facture_paiements` |

---

## Fichiers SQL à exécuter (ordre)

1. **`AUDIT_SCHEMA_CITYMO.sql`** — état actuel (tables manquantes, comptages)
2. **`RUN_FULL_RESTORE_CITYMO.sql`** — **tout le schéma + seeds** (idempotent, ~3000 lignes)
3. Ré-exécuter **`AUDIT_SCHEMA_CITYMO.sql`** — valider

Scripts optionnels (si besoin ciblé, après le full restore) :

- `RUN_IMPORT_25_EMPLOYEES.sql`
- `RUN_IMPORT_18_VEHICULES.sql`
- `RUN_PRESENCE_COMPLET.sql`, `RUN_SAV_COMPLETE.sql`, etc.

---

## Seeds inclus dans les migrations

| Module | Fichier migration | Données |
|--------|-------------------|---------|
| RH départements | `20260525000000_rh_schema.sql` | 9 départements |
| Employés | `20260527140000_reseed_employees_citymo_safe.sql` | 25 employés UPSERT |
| CRM clients | `20260526000000_clients.sql` | clients si table vide |
| Catégories | `20260526010000_categories.sql` | arbre catégories |
| Articles | `20260526020000_articles.sql` | catalogue articles |
| Véhicules | `20260527150100_seed_logistique_vehicles.sql` | 18 véhicules UPSERT |

---

## Tests Vercel après déploiement

- [ ] Login Supabase OK
- [ ] RH → Employés (liste 25+)
- [ ] Ouvriers → CRUD + scan CIN
- [ ] Présence / Heures sup / Paiement hebdo
- [ ] Commercial → Prospects, Devis attente, Planning…
- [ ] CRM → Clients, Articles, Devis, Factures, BL + PDF
- [ ] Logistique → Véhicules, Interventions, Historique (3 onglets sidebar)
- [ ] Projets → Liste, SAV, CR SAV
- [ ] Console : pas d’erreur `relation does not exist`

---

## OCR / Scan CIN

Le scan CIN côté front reste dans le repo ; l’OCR Mindee passe par le **serveur Express** (`server/`), pas par Vercel. En production Vercel, configurer `VITE_API_URL` vers l’API OCR hébergée si besoin.
