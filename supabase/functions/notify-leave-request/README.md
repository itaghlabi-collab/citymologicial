# notify-leave-request — Email Resend (Congés CITYMO)

Envoie un email HTML au Super Admin (`selim.moumni@citymo.ma`) à chaque nouvelle demande de congé.

## 1. Créer un compte Resend

1. [https://resend.com](https://resend.com) → créer un compte
2. **API Keys** → **Create API Key** → copier la clé (`re_...`)

### Test sans domaine personnalisé

- Expéditeur par défaut : `CITYMO Congés <onboarding@resend.dev>`
- En mode test Resend, les emails ne partent **que vers l’adresse du compte Resend** sauf si vous avez vérifié un domaine

### Production (recommandé)

1. Resend → **Domains** → ajouter `citymo.ma`
2. Configurer les enregistrements DNS (SPF, DKIM)
3. Une fois vérifié, définir :
   ```
   LEAVE_NOTIFY_FROM=CITYMO Congés <conges@citymo.ma>
   ```

## 2. Où mettre RESEND_API_KEY

**Jamais dans `.env` frontend ni `VITE_*`.**

### Option A — Supabase Dashboard (sans CLI)

1. [Supabase Dashboard](https://supabase.com/dashboard) → projet **npddbwsskaojcawaxygh**
2. **Edge Functions** → **Secrets**
3. Ajouter :

| Secret | Valeur |
|--------|--------|
| `RESEND_API_KEY` | `re_xxxxxxxx` |
| `LEAVE_NOTIFY_TO` | `selim.moumni@citymo.ma` |
| `LEAVE_NOTIFY_FROM` | `CITYMO Congés <conges@citymo.ma>` ou `CITYMO Congés <onboarding@resend.dev>` |
| `LEAVE_APP_URL` | (optionnel) URL de l’app pour le bouton CTA |

### Option B — Supabase CLI

```bash
npm install -g supabase
supabase login
supabase link --project-ref npddbwsskaojcawaxygh

supabase secrets set \
  RESEND_API_KEY=re_VOTRE_CLE \
  LEAVE_NOTIFY_TO=selim.moumni@citymo.ma \
  LEAVE_NOTIFY_FROM="CITYMO Congés <onboarding@resend.dev>"
```

## 3. Déployer l’Edge Function

```bash
cd /chemin/vers/citymologicial
supabase functions deploy notify-leave-request
```

Vérifier dans Dashboard → **Edge Functions** que `notify-leave-request` est **Active**.

## 4. Tester l’envoi réel

### Depuis l’app (recommandé)

1. `npm run dev` → se connecter avec un compte Supabase
2. Module **Congés** → **Nouvelle demande** → remplir et soumettre
3. Vérifier :
   - Console navigateur : `[CITYMO] notify-leave-request OK`
   - Dashboard Supabase → **Edge Functions** → **Logs** de `notify-leave-request`
   - Boîte mail `selim.moumni@citymo.ma` (ou compte Resend en mode test)

### Invoke manuel (curl)

Récupérer un JWT utilisateur connecté (DevTools → Application → `citymo-supabase-auth`), puis :

```bash
curl -i "https://npddbwsskaojcawaxygh.supabase.co/functions/v1/notify-leave-request" \
  -H "Authorization: Bearer VOTRE_JWT_UTILISATEUR" \
  -H "apikey: VOTRE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "notifyTo": "selim.moumni@citymo.ma",
    "leave": {
      "id": "test-uuid",
      "employe_label": "Ahmed Benali",
      "type": "Conge annuel",
      "date_debut": "2026-06-01",
      "date_fin": "2026-06-05",
      "date_retour": "2026-06-06",
      "jours": 4,
      "raison": "Test Resend",
      "statut": "En attente"
    }
  }'
```

Réponse attendue : `{"ok":true,"to":"...","resendId":"..."}`

## 5. Dépannage

| Symptôme | Cause probable |
|----------|----------------|
| `simulated: true` dans la réponse | `RESEND_API_KEY` non défini côté Supabase |
| Resend 403 / domain | Domaine non vérifié — utiliser `onboarding@resend.dev` ou vérifier `citymo.ma` |
| 401 Unauthorized | JWT absent ou expiré — se reconnecter à l’app |
| Email non reçu | Spam ; mode test Resend (destinataire = email du compte Resend) |
| Function not found | `supabase functions deploy notify-leave-request` non exécuté |

## Architecture

```
Conges.jsx → createLeave() → notifySuperAdminLeaveRequest()
  → supabase.functions.invoke('notify-leave-request')
    → Edge Function (secrets Resend)
      → API Resend → selim.moumni@citymo.ma
```

L’échec email **ne bloque pas** la création de la demande (fire-and-forget + fallback `console.log`).
