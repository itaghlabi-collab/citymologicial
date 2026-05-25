# CITYMO — Supabase migrations

## Apply RH schema

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **SQL Editor**.
2. Paste and run `migrations/20260525000000_rh_schema.sql`.
3. Create an app user: **Authentication** → **Users** → **Add user** (email + password).
4. Optional: set user metadata `nom`, `role`, `initiales` for the sidebar profile.
5. Run `migrations/20260525200000_leaves_rls_super_admin.sql` for Congés (RLS + Super Admin).

## Congés — Super Admin & email

- Email principal : `selim.moumni@citymo.ma` → rôle `super_admin` (migration SQL)
- Edge Function email : `supabase/functions/notify-leave-request`
- **Setup Resend complet** : [`functions/notify-leave-request/README.md`](functions/notify-leave-request/README.md)

## Login

The React app uses `signInWithPassword` with the Supabase user you created.
RLS requires an **authenticated** session for `employees` CRUD.

## Env (project root)

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```
