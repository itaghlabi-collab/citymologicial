# Audit sécurité Supabase — CITYMO ERP

**Date :** 2026-07-08  
**Script de migration :** `RUN_RLS_SECURITY_COMPLET.sql`  
**À exécuter dans :** Supabase → SQL Editor (une seule fois, ré-exécutable)

---

## 1. Synthèse exécutive

| Indicateur | État actuel (avant migration) | Après migration |
|------------|-------------------------------|-----------------|
| Tables publiques métier | ~105 | ~105 |
| RLS activé partout | **Non** (finance, payroll, workers désactivés par scripts réparation) | **Oui** |
| Policies `USING (true)` | ~85 tables (tout utilisateur connecté = CRUD total) | **0** sur données métier |
| Grants `anon` sur tables sensibles | **Oui** (finance, payroll…) | **Révoqués** |
| RBAC aligné UI ↔ base | **Non** (UI seulement) | **Oui** via `erp_can()` |
| Fonctions SECURITY DEFINER | Plusieurs, certaines trop ouvertes | Durcies + `search_path` fixe |

### Risques critiques identifiés

1. **Scripts `RUN_FINANCE_DEBLOQUER_*` / `RUN_SUPABASE_REPARER`** : RLS désactivé + `GRANT ALL TO anon` → accès non authentifié possible avec la clé anon.
2. **Policies `{table}_all_auth USING (true)`** : tout compte `authenticated` lit/modifie/supprime toutes les données (factures, salaires, caisse…).
3. **`notifications_insert WITH CHECK (true)`** : n'importe quel utilisateur peut créer une notification pour un autre.
4. **Rôles sans permissions seedées** : `chef_projet`, `chef_chantier`, `dg` (partiel) → accès uniquement via legacy ou contournement UI.
5. **SECURITY DEFINER** : `insert_user_notification`, `resolve_notification_recipient` — nécessaires mais doivent rester les seuls chemins d'écriture notifications.

---

## 2. Inventaire des 105 tables publiques

### Légende policies cibles

| Code | Signification |
|------|---------------|
| **MOD** | Policy standard module via `erp_can(action, submodule)` |
| **CUSTOM** | Policy métier spécifique |
| **REF** | Table de référence (lecture élargie) |
| **ADMIN** | Super Admin / ERP Admin uniquement |
| **PUBLIC-RPC** | Pas d'accès direct ; RPC `anon` tokenisé |

### Organisation interne

| Table | Submodule | Policy | Justification |
|-------|-----------|--------|---------------|
| `internal_tasks` | `taches` | CUSTOM | Tâches DG visibles seulement créateur + assigné ; autres via permission `taches` |
| `internal_task_dg_relances` | `taches` | MOD | Relances liées aux tâches DG |
| `internal_appointments` | `rendezvous` | MOD | RDV organisation ; filtrage métier côté app |
| `executive_calendar` | `agenda-direction` | CUSTOM | Déjà restreint DG / direction (`can_read/write_executive_calendar`) |
| `executive_calendar_notifications` | `agenda-direction` | CUSTOM | Notifications agenda = user_id propriétaire |

### RH & personnel

| Table | Submodule | Policy | Justification |
|-------|-----------|--------|---------------|
| `departments` | `departements` | MOD | Référentiel départements |
| `employees` | `employes` | MOD | Fiches employés ; RH avec `employes.voir` |
| `employee_documents` | `employes` | MOD | Documents RH employés |
| `leaves` | `conges` | CUSTOM | Conservé : propre + RH manager (`is_leave_rh_manager`) |
| `attendance` | `presence` | MOD | Pointage chantier |
| `overtime` | `heures-sup` | MOD | Heures supplémentaires |
| `payroll` | `paiement-hebdo` | MOD | Paie ouvriers — sensible, finance/RH |
| `resource_requests` | `demandes-ressources` | MOD | Demandes ressources chantier |
| `resource_request_history` | `demandes-ressources` | MOD | Historique workflow |
| `resource_request_workers` | `demandes-ressources` | MOD | Ouvriers affectés |

### Employés externes / ouvriers

| Table | Submodule | Policy |
|-------|-----------|--------|
| `workers` | `ouvriers` | MOD |
| `worker_documents` | `ouvriers` | MOD |
| `worker_project_assignments` | `ouvriers` | MOD |
| `subcontractors` | `sous-traitants` | MOD |
| `subcontractor_*` (5 tables) | `sous-traitants` | MOD |

### Commercial & CRM

| Table | Submodule | Policy |
|-------|-----------|--------|
| `clients` | `clients` | MOD |
| `prospects` | `prospects` | MOD |
| `actions_marketing` | `actions-marketing` | MOD |
| `planning_commercial` | `planning-commercial` | MOD |
| `comptes_rendus` | `compte-rendu-com` | MOD |
| `depenses` | `depenses-com` | MOD |
| `propositions_marketing` | `propositions` | MOD |
| `articles` | `articles` | MOD |
| `categories` | `categories` | MOD |
| `crm_devis` | `devis` | MOD |
| `crm_devis_lignes` | `devis` | MOD |
| `crm_factures` | `factures` | MOD |
| `crm_facture_lignes` | `factures` | MOD |
| `crm_facture_paiements` | `factures` | MOD |
| `crm_archives` | `devis` | MOD |
| `delivery_notes` | `bon-livraison` | MOD |
| `delivery_note_items` | `bon-livraison` | MOD |
| `devis` (legacy) | `devis` | MOD |

### Projets & exploitation

| Table | Submodule | Policy |
|-------|-----------|--------|
| `projects` | `projets` | MOD |
| `project_documents` | `projets` | MOD |
| `project_expenses` | `depenses-par-projet` | MOD |
| `project_material_needs` | `projets` | MOD |
| `project_equipment_needs` | `projets` | MOD |
| `project_staff_needs` | `projets` | MOD |
| `project_staff_need_history` | `projets` | MOD |
| `project_chantier_material_needs` | `projets` | MOD |
| `project_chantier_material_need_lines` | `projets` | MOD |
| `project_planning_*` (4 tables) | `projets` | MOD |
| `sav_requests` | `sav-projets` | MOD |
| `sav_reports` | `cr-sav` | MOD |

### Finance & comptabilité

| Table | Submodule | Policy | Impact si mal configuré |
|-------|-----------|--------|------------------------|
| `finance_transactions` | `feuille-caisse` | MOD | Caisse, sync paiements |
| `cash_monthly_balances` | `feuille-caisse` | MOD | Soldes mensuels |
| `cash_daily_validations` | `feuille-caisse` | MOD | Validation J-1 |
| `daily_cash_reviews` | `feuille-caisse` | MOD | Revue caisse |
| `finance_charges` | `charges` | MOD | Charges |
| `finance_categories` | `categories-charge` | MOD | Catégories |
| `payment_orders` | `ordres-paiement` | MOD | Ordres de paiement |

### Achats

| Table | Submodule | Policy |
|-------|-----------|--------|
| `purchase_suppliers` | `fournisseurs` | MOD |
| `purchase_requests` | `demandes-achat` | MOD |
| `purchase_orders` | `bons-commande` | MOD |
| `purchase_quote_comparisons` | `comparaison-devis` | MOD |
| `purchase_acquisition_orders` | `ordres-achat` | MOD |
| `purchase_request_history` | `demandes-achat` | MOD |
| `purchase_request_quotes` | `demandes-achat` | MOD |
| `achat_*` (legacy, 3 tables) | achats | MOD |
| `charge_categories` (legacy) | `categories-charge` | MOD |

### Inventaire & logistique

| Table | Submodule | Policy |
|-------|-----------|--------|
| `stock_*` (5 tables) | inventaire | MOD |
| `site_material_request*` (3 tables) | `demandes-chantier` | MOD |
| `vehicles` | `vehicules` | MOD |
| `vehicle_*` (4 tables) | logistique | MOD |

### Documents & GED

| Table | Submodule | Policy |
|-------|-----------|--------|
| `document_folders` | `mes-documents` | MOD |
| `documents` | `mes-documents` | MOD |
| `document_shares` | `docs-partages` | MOD |
| `document_public_links` | `liens-publics` | MOD (gestion) + PUBLIC-RPC (lecture) |
| `ged_*` (legacy, 4 tables) | documents | MOD |

### Notifications

| Table | Policy | Justification |
|-------|--------|---------------|
| `notifications` | CUSTOM | Lecture = destinataire ; écriture = RPC SECURITY DEFINER uniquement |
| `whatsapp_notification_log` | CUSTOM | Lecture propre user ; insert via service |

### Administration & système

| Table | Policy | Justification |
|-------|--------|---------------|
| `profiles` | CUSTOM | Propre profil + admin |
| `erp_roles` | REF | Lecture tous auth actifs (nécessaire RBAC UI) |
| `role_permissions` | REF | Idem |
| `user_permission_exceptions` | CUSTOM | Propre + admin |
| `erp_backups` | ADMIN | Super Admin |
| `erp_backup_audit_log` | ADMIN | Super Admin |
| `erp_backup_schedules` | ADMIN | Super Admin |

---

## 3. Modèle RBAC retenu

### Fonctions centrales (migration)

| Fonction | Rôle |
|----------|------|
| `erp_auth_ok()` | Utilisateur connecté + profil `actif` |
| `erp_legacy_access()` | Comptes sans `role_id` (rétrocompatibilité app) |
| `erp_can(action, submodule)` | Super Admin OR ERP Admin OR legacy OR `has_submodule_permission` |
| `has_submodule_permission(user, submodule, action)` | Rôle + exceptions utilisateur |
| `is_super_admin()` | Super Admin |
| `is_erp_admin()` | Super Admin + rôles `est_admin` |
| `is_leave_rh_manager()` | RH congés |

### Matrice rôles → permissions (seed complété par migration)

| Rôle | Accès |
|------|-------|
| **Super Admin** | Tout (`est_admin` + seed complet) |
| **DG** | Lecture toutes rubriques + valider/exporter stratégique |
| **RH** | RH + employés externes + congés |
| **Finance / Comptabilité** | Finance & trésorerie |
| **Commercial** | CRM + commercial marketing |
| **Achats** | Module achats |
| **Magasinier / Logistique** | Logistique + inventaire |
| **Chef de projet** | Projets, tâches, RDV, dashboard, demandes chantier |
| **Chef de chantier** | Projets, présence, demandes chantier, tâches (lecture) |
| **Employé** | Dashboard, tâches, congés, mes documents |

---

## 4. Impacts fonctionnels à valider après migration

| Module | Test recommandé |
|--------|-----------------|
| **Notifications** | Créer tâche → son + notif destinataire (RPC, pas insert direct) |
| **RH / Congés** | Employé crée congé ; RH valide |
| **Devis → Facture** | Commercial convertit devis |
| **Feuille de caisse** | Finance saisit + valide J-1 |
| **Achats** | Workflow demande → BC |
| **Projets** | Chef de projet crée besoin matériel |
| **Inventaire** | Magasinier mouvement stock |
| **Documents publics** | Lien `/share/{token}` sans login |
| **Administration** | Super Admin gère utilisateurs |
| **Dashboard** | KPIs visibles selon rôle |

### Comptes sans `role_id`

L'app accorde encore l'accès UI complet (`legacy: true` dans `permissions.js`).  
La migration conserve `erp_legacy_access()` pour **ne pas casser** les comptes non migrés vers `role_id`.  
**Recommandation :** lier tous les profils à un `role_id` dans Administration → Utilisateurs.

---

## 5. SECURITY DEFINER — durcissement

| Fonction | Grant | Mesure |
|----------|-------|--------|
| `get_document_public_link` | anon, authenticated | OK — token uniquement, pas de liste |
| `verify_document_public_link` | anon, authenticated | OK — mot de passe optionnel |
| `insert_user_notification` | authenticated | OK — seul chemin insert notifications |
| `upsert_user_notification` | authenticated | OK — anti-doublon |
| `resolve_notification_recipient` | authenticated | OK — lecture profiles nécessaire métier |
| `list_super_admin_dg_user_ids` | authenticated | OK — IDs uniquement |
| `handle_new_user` | trigger | OK |
| `sync_profile_role_from_erp` | trigger | OK |
| `trg_notify_internal_*` | trigger | OK |
| `get_public_table_names` | service_role only | OK |

**Révoqué pour anon :** tous les grants table `anon` sur données métier.

---

## 6. Security Advisor — résultat attendu

| Alert | Statut |
|-------|--------|
| RLS disabled in public | ✅ Corrigé |
| Policy exists RLS disabled | ✅ Corrigé |
| Table accessible by anon | ✅ Révoqué (sauf RPC public docs) |
| Function search_path mutable | ✅ `SET search_path = public` sur toutes les DEFINER |
| Permissive RLS policy (USING true) | ✅ Supprimé sur métier |

**Avertissements justifiés restants :**
- `get_document_public_link` / `verify_document_public_link` granted to `anon` (accès public documentaire par token).
- `erp_legacy_access()` pour comptes sans rôle (transition).

---

## 7. Ordre d'exécution

1. **Sauvegarde** base Supabase (Administration → Sauvegardes)
2. Exécuter `RUN_RLS_SECURITY_COMPLET.sql`
3. Vérifier requêtes de contrôle en fin de script
4. Tester modules listés §4
5. Lier tous les utilisateurs à un `role_id`
6. Quand tous les comptes ont un rôle : désactiver `erp_legacy_access()` (optionnel, commenté en fin de script)
