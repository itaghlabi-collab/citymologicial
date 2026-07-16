-- =============================================================================
-- CITYMO — Rollback push_subscriptions
-- À exécuter UNIQUEMENT si l'étape 2 doit être annulée.
-- Ne touche PAS public.notifications ni d'autres tables.
-- =============================================================================

DROP TRIGGER IF EXISTS push_subscriptions_updated_at ON public.push_subscriptions;

DROP POLICY IF EXISTS push_subscriptions_select_own ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_insert_own ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_update_own ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_delete_own ON public.push_subscriptions;

DROP TABLE IF EXISTS public.push_subscriptions;

-- Ne PAS supprimer public.set_updated_at() : utilisée par d'autres tables.

NOTIFY pgrst, 'reload schema';
