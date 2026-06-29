-- CITYMO — Workflow Achats (même contenu que RUN_PURCHASE_WORKFLOW.sql)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS requester_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS requester_name TEXT;

ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS selected_quote_id UUID;

ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS acquisition_order_id UUID;

ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS payment_order_id UUID;

ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS commentaires_internes TEXT;

CREATE TABLE IF NOT EXISTS public.purchase_request_quotes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_request_id   UUID NOT NULL REFERENCES public.purchase_requests(id) ON DELETE CASCADE,
  supplier_id           UUID REFERENCES public.purchase_suppliers(id) ON DELETE SET NULL,
  supplier_name         TEXT NOT NULL,
  montant_ht            NUMERIC(14,2) NOT NULL DEFAULT 0,
  tva_rate              NUMERIC(5,2) NOT NULL DEFAULT 20,
  montant_ttc           NUMERIC(14,2) NOT NULL DEFAULT 0,
  delai                 TEXT,
  validite              TEXT,
  conditions_paiement   TEXT,
  garantie              TEXT,
  observations          TEXT,
  attachment_url        TEXT,
  statut                TEXT NOT NULL DEFAULT 'Actif',
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prq_request ON public.purchase_request_quotes (purchase_request_id);
CREATE INDEX IF NOT EXISTS idx_prq_statut ON public.purchase_request_quotes (statut);

CREATE TABLE IF NOT EXISTS public.purchase_request_history (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_request_id   UUID NOT NULL REFERENCES public.purchase_requests(id) ON DELETE CASCADE,
  action                TEXT NOT NULL,
  detail                TEXT,
  user_id               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name             TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prh_request ON public.purchase_request_history (purchase_request_id);

CREATE TABLE IF NOT EXISTS public.purchase_acquisition_orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_oa                TEXT,
  purchase_request_id     UUID REFERENCES public.purchase_requests(id) ON DELETE SET NULL,
  quote_id              UUID REFERENCES public.purchase_request_quotes(id) ON DELETE SET NULL,
  supplier_id           UUID REFERENCES public.purchase_suppliers(id) ON DELETE SET NULL,
  supplier_name         TEXT,
  project_id            UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  project_ref           TEXT,
  project_name          TEXT,
  objet                 TEXT,
  montant_ht            NUMERIC(14,2) NOT NULL DEFAULT 0,
  tva_rate              NUMERIC(5,2) NOT NULL DEFAULT 20,
  montant_ttc           NUMERIC(14,2) NOT NULL DEFAULT 0,
  delai                 TEXT,
  conditions_paiement   TEXT,
  garantie              TEXT,
  mode_paiement         TEXT,
  date_livraison        DATE,
  statut                TEXT NOT NULL DEFAULT 'Brouillon',
  payment_order_id      UUID,
  lines                 JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pao_request ON public.purchase_acquisition_orders (purchase_request_id);
CREATE INDEX IF NOT EXISTS idx_pao_statut ON public.purchase_acquisition_orders (statut);

DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_requests_selected_quote_id_fkey'
  ) THEN
    ALTER TABLE public.purchase_requests
      ADD CONSTRAINT purchase_requests_selected_quote_id_fkey
      FOREIGN KEY (selected_quote_id) REFERENCES public.purchase_request_quotes(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_requests_acquisition_order_id_fkey'
  ) THEN
    ALTER TABLE public.purchase_requests
      ADD CONSTRAINT purchase_requests_acquisition_order_id_fkey
      FOREIGN KEY (acquisition_order_id) REFERENCES public.purchase_acquisition_orders(id) ON DELETE SET NULL;
  END IF;
END $fk$;

ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS purchase_request_id UUID REFERENCES public.purchase_requests(id) ON DELETE SET NULL;

ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS purchase_acquisition_order_id UUID REFERENCES public.purchase_acquisition_orders(id) ON DELETE SET NULL;

UPDATE public.purchase_requests SET statut = 'Soumise' WHERE statut = 'En attente';
UPDATE public.purchase_requests SET statut = 'En étude Achats' WHERE statut = 'En cours';
UPDATE public.purchase_requests SET statut = 'Clôturée' WHERE statut = 'Terminée';

UPDATE public.purchase_requests
SET assigned_employee_name = 'LAILA WOTFI — Chargée d''Achats'
WHERE COALESCE(assigned_employee_name, '') = '';

DROP TRIGGER IF EXISTS purchase_request_quotes_updated_at ON public.purchase_request_quotes;
CREATE TRIGGER purchase_request_quotes_updated_at
  BEFORE UPDATE ON public.purchase_request_quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS purchase_acquisition_orders_updated_at ON public.purchase_acquisition_orders;
CREATE TRIGGER purchase_acquisition_orders_updated_at
  BEFORE UPDATE ON public.purchase_acquisition_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.purchase_request_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_request_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_acquisition_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prq_auth ON public.purchase_request_quotes;
CREATE POLICY prq_auth ON public.purchase_request_quotes FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS prh_auth ON public.purchase_request_history;
CREATE POLICY prh_auth ON public.purchase_request_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS pao_auth ON public.purchase_acquisition_orders;
CREATE POLICY pao_auth ON public.purchase_acquisition_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.purchase_request_quotes TO authenticated, service_role;
GRANT ALL ON public.purchase_request_history TO authenticated, service_role;
GRANT ALL ON public.purchase_acquisition_orders TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
