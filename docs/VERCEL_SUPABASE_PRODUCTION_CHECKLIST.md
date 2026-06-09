# Checklist — Parité localhost / Vercel / Supabase Production

Projet Supabase : **npddbwsskaojcawaxygh**  
URL : `https://npddbwsskaojcawaxygh.supabase.co`

---

## Étape A — Supabase SQL (15 min)

Dans **Supabase → SQL Editor**, exécuter dans l’ordre :

1. `supabase/AUDIT_SCHEMA_CITYMO.sql`  
   → Aucune ligne `MANQUANTE` attendue (35+ tables selon version).

2. Si des tables manquent :  
   `supabase/RUN_FULL_RESTORE_CITYMO.sql`  
   (idempotent, ~5–10 min)

3. Nouvelles tables Finance / Achats / Inventaire / GED :  
   `supabase/migrations/20260604120000_finance_achats_inventaire_ged.sql`  
   (après pull du dernier `main`)

4. Re-exécuter `AUDIT_SCHEMA_CITYMO.sql` — tout en `OK`.

5. Vérifier les comptages (NOTICE dans l’audit) :
   - `employees` ≥ 25 (si seed appliqué)
   - `vehicles` ≥ 18
   - `clients` > 0 (seed CRM)

---

## Étape B — Variables Vercel (Production)

| Variable | Obligatoire | Valeur / note |
|----------|-------------|---------------|
| `VITE_SUPABASE_URL` | Oui | `https://npddbwsskaojcawaxygh.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Oui | Clé **anon** complète (~208 car.) depuis Dashboard → API |
| `MINDEE_API_KEY` | OCR CIN | `md_...` ou `re_...` |
| `MINDEE_MODEL_ID` | Si clé `md_*` | UUID modèle International ID |
| `OCR_PROVIDER` | OCR | `mindee` |
| `VITE_API_URL` | Non | Laisser vide → l’app utilise `https://<domaine>/api` |

Après modification : **Redeploy** le projet Vercel.

---

## Étape C — Storage Supabase

Dashboard → Storage → buckets présents :

- [ ] `citymo-workers` (CIN / photos ouvriers)
- [ ] `citymo-projects` (projets / SAV)
- [ ] `citymo-documents` (GED — après migration GED)

---

## Étape D — Edge Function congés (optionnel)

```bash
supabase secrets set RESEND_API_KEY=re_xxx LEAVE_NOTIFY_TO=email@citymo.ma
supabase functions deploy notify-leave-request
```

---

## Étape E — Tests fonctionnels Vercel (identiques local)

| Module | Test |
|--------|------|
| Auth | Login / logout |
| RH | Employés liste |
| Externes | Ouvriers + scan CIN + présence |
| Commercial | Prospects, devis attente, planning |
| CRM | Clients, articles, devis, factures, BL |
| Logistique | 3 onglets véhicules / interventions |
| Projets | Projets, SAV, CR SAV |
| Finance | Catégories charge + charges (Supabase) |
| Achats | Fournisseurs (Supabase) |
| Console | Pas de `relation does not exist` |

---

## Script local de vérification

```bash
chmod +x scripts/production-readiness.sh
./scripts/production-readiness.sh
```

Vérifie : migrations présentes, fichiers services/hooks, variables `.env` locales (si fichier existe).

---

## En cas d’écart localhost vs Vercel

| Symptôme | Cause probable |
|----------|----------------|
| Listes vides partout | Migrations SQL non appliquées en prod |
| Seulement quelques modules vides | Tables ciblées manquantes |
| Données local mais pas Vercel | `.env` pointe vers un autre projet Supabase en local |
| OCR mauvais sur Vercel | `MINDEE_*` absent → Tesseract seul |
| Documents perdus au refresh | Normal avant branchement GED Supabase |

Rapport complet : `supabase/MIGRATION_AUDIT_REPORT.md`
