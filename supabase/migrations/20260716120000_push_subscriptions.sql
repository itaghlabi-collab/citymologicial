-- =============================================================================
-- CITYMO — Web Push subscriptions (étape 2)
-- Table sécurisée des abonnements PushSubscription par appareil / utilisateur.
--
-- Ne touche PAS : public.notifications, le SW, ni les événements métier.
-- Service role : bypass RLS pour l'envoi Push futur (côté serveur uniquement).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint         TEXT NOT NULL,
  p256dh           TEXT NOT NULL,
  auth_key         TEXT NOT NULL,
  expiration_time  BIGINT NULL,
  device_name      TEXT NULL,
  browser          TEXT NULL,
  platform         TEXT NULL,
  user_agent       TEXT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at     TIMESTAMPTZ NULL,
  revoked_at       TIMESTAMPTZ NULL,
  CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint)
);

COMMENT ON TABLE public.push_subscriptions IS
  'Abonnements Web Push (PushSubscription) par appareil. Source canal mobile ; public.notifications reste la source de vérité métier.';
COMMENT ON COLUMN public.push_subscriptions.endpoint IS
  'URL Push Service — unique. Upsert futur côté API sur cette colonne.';
COMMENT ON COLUMN public.push_subscriptions.p256dh IS
  'Clé publique client (PushSubscription.getKey("p256dh")) — sensible.';
COMMENT ON COLUMN public.push_subscriptions.auth_key IS
  'Secret auth client (PushSubscription.getKey("auth")) — sensible.';

-- Index
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON public.push_subscriptions (user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id_active
  ON public.push_subscriptions (user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_revoked_at
  ON public.push_subscriptions (revoked_at)
  WHERE revoked_at IS NOT NULL;

-- updated_at automatique (réutilise public.set_updated_at)
DROP TRIGGER IF EXISTS push_subscriptions_updated_at ON public.push_subscriptions;
CREATE TRIGGER push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions FORCE ROW LEVEL SECURITY;

-- Aucun accès anon / public
REVOKE ALL ON TABLE public.push_subscriptions FROM PUBLIC;
REVOKE ALL ON TABLE public.push_subscriptions FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_subscriptions TO authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;

-- Policies : propriétaire uniquement (auth.uid() = user_id)
DROP POLICY IF EXISTS push_subscriptions_select_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_select_own
  ON public.push_subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subscriptions_insert_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_insert_own
  ON public.push_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subscriptions_update_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_update_own
  ON public.push_subscriptions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subscriptions_delete_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_delete_own
  ON public.push_subscriptions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
