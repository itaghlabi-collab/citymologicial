-- LOGISTIQUE — Demandes de récupération (indépendantes du stock et des bons)
-- À exécuter manuellement dans Supabase SQL Editor si la persistance partagée est souhaitée.
-- Ne crée aucune clé étrangère vers les bons / stocks / achats.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.logistics_pickup_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref         TEXT NOT NULL,
  statut      TEXT NOT NULL DEFAULT 'a_organiser',
  bon_id      UUID,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_logistics_pickup_ref ON public.logistics_pickup_requests (ref);
CREATE INDEX IF NOT EXISTS idx_logistics_pickup_statut ON public.logistics_pickup_requests (statut);
CREATE INDEX IF NOT EXISTS idx_logistics_pickup_bon ON public.logistics_pickup_requests (bon_id);

DROP TRIGGER IF EXISTS logistics_pickup_requests_updated_at ON public.logistics_pickup_requests;
CREATE TRIGGER logistics_pickup_requests_updated_at
  BEFORE UPDATE ON public.logistics_pickup_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.logistics_pickup_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS logistics_pickup_requests_all_auth ON public.logistics_pickup_requests;
CREATE POLICY logistics_pickup_requests_all_auth ON public.logistics_pickup_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.logistics_pickup_requests TO authenticated;
GRANT ALL ON public.logistics_pickup_requests TO service_role;
