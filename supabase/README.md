# CITYMO — Supabase migrations

## Apply RH schema

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **SQL Editor**.
2. Paste and run `migrations/20260525000000_rh_schema.sql`.
3. Create an app user: **Authentication** → **Users** → **Add user** (email + password).
4. Optional: set user metadata `nom`, `role`, `initiales` for the sidebar profile.

## Login

The React app uses `signInWithPassword` with the Supabase user you created.
RLS requires an **authenticated** session for `employees` CRUD.

## Env (project root)

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```
