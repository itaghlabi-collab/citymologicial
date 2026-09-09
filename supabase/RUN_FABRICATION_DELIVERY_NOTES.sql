-- =============================================================================
-- CITYMO — Fabrication : Bons de livraison (isolé)
-- Coller dans Supabase → SQL Editor → Run
-- Ne touche PAS delivery_notes (CRM) ni les autres modules.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.fabrication_delivery_notes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero             TEXT NOT NULL UNIQUE,
  date_bl            DATE NOT NULL DEFAULT CURRENT_DATE,
  client_societe     TEXT NOT NULL DEFAULT '',
  destinataire_nom   TEXT NOT NULL DEFAULT '',
  adresse            TEXT NOT NULL DEFAULT '',
  telephone          TEXT NOT NULL DEFAULT '',
  lines              JSONB NOT NULL DEFAULT '[]'::jsonb,
  statut             TEXT NOT NULL DEFAULT 'Brouillon',
  note               TEXT,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fabrication_delivery_notes_statut_check CHECK (
    statut IN ('Brouillon', 'Émis')
  )
);

CREATE INDEX IF NOT EXISTS idx_fab_dn_numero
  ON public.fabrication_delivery_notes (numero);

CREATE INDEX IF NOT EXISTS idx_fab_dn_date
  ON public.fabrication_delivery_notes (date_bl DESC);

CREATE INDEX IF NOT EXISTS idx_fab_dn_created
  ON public.fabrication_delivery_notes (created_at DESC);

DROP TRIGGER IF EXISTS fabrication_delivery_notes_updated_at ON public.fabrication_delivery_notes;
CREATE TRIGGER fabrication_delivery_notes_updated_at
  BEFORE UPDATE ON public.fabrication_delivery_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.fabrication_delivery_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fabrication_delivery_notes_auth ON public.fabrication_delivery_notes;
CREATE POLICY fabrication_delivery_notes_auth ON public.fabrication_delivery_notes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.fabrication_delivery_notes TO authenticated, service_role;

-- Permissions menu (même périmètre que les autres sous-rubriques Fabrication)
DO $$
DECLARE
  r RECORD;
  a TEXT;
  sub TEXT := 'fabrication-bons-livraison';
  acts_full TEXT[] := ARRAY['voir', 'creer', 'modifier', 'supprimer', 'valider', 'exporter'];
  acts_chef TEXT[] := ARRAY['voir', 'creer', 'modifier', 'supprimer', 'exporter'];
BEGIN
  FOR r IN
    SELECT id, code FROM public.erp_roles
    WHERE code IN ('dg', 'chef_projet', 'chef_chantier')
  LOOP
    IF r.code = 'chef_projet' THEN
      FOREACH a IN ARRAY acts_chef LOOP
        INSERT INTO public.role_permissions (role_id, module_code, submodule_code, action_code, granted)
        VALUES (r.id, 'fabrication', sub, a, true)
        ON CONFLICT ON CONSTRAINT role_permissions_role_submodule_action_key DO NOTHING;
      END LOOP;
    ELSE
      FOREACH a IN ARRAY acts_full LOOP
        INSERT INTO public.role_permissions (role_id, module_code, submodule_code, action_code, granted)
        VALUES (r.id, 'fabrication', sub, a, true)
        ON CONFLICT ON CONSTRAINT role_permissions_role_submodule_action_key DO NOTHING;
      END LOOP;
    END IF;
  END LOOP;
END $$;
