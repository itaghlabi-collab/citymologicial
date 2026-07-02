-- Exécuter dans Supabase SQL Editor
-- Crée la table crm_archives + permissions RBAC pour CRM > Archives

CREATE TABLE IF NOT EXISTS public.crm_archives (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name           TEXT NOT NULL,
  storage_path        TEXT NOT NULL,
  file_size           BIGINT,
  mime_type           TEXT NOT NULL DEFAULT 'application/pdf',
  doc_type            TEXT NOT NULL DEFAULT 'devis'
    CHECK (doc_type IN ('devis', 'facture')),
  reference           TEXT,
  date_document       DATE,
  intitule            TEXT,
  client_id           UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_detected_name TEXT,
  client_ice          TEXT,
  client_email        TEXT,
  client_telephone    TEXT,
  total_ht            NUMERIC(14, 2),
  total_tva           NUMERIC(14, 2),
  total_ttc           NUMERIC(14, 2),
  statut              TEXT NOT NULL DEFAULT 'en_attente'
    CHECK (statut IN (
      'en_attente',
      'pret_import',
      'client_a_verifier',
      'doublon',
      'erreur_lecture',
      'importe'
    )),
  match_confidence    TEXT DEFAULT 'none'
    CHECK (match_confidence IN ('high', 'medium', 'low', 'manual', 'none')),
  duplicate_ref       TEXT,
  detection_errors    TEXT,
  extraction_snippet  TEXT,
  imported_at         TIMESTAMPTZ,
  validated_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_archives_statut ON public.crm_archives(statut);
CREATE INDEX IF NOT EXISTS idx_crm_archives_doc_type ON public.crm_archives(doc_type);
CREATE INDEX IF NOT EXISTS idx_crm_archives_client_id ON public.crm_archives(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_archives_reference ON public.crm_archives(reference);
CREATE INDEX IF NOT EXISTS idx_crm_archives_date_document ON public.crm_archives(date_document DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_crm_archives_imported_at ON public.crm_archives(imported_at DESC NULLS LAST);

DROP TRIGGER IF EXISTS crm_archives_updated_at ON public.crm_archives;
CREATE TRIGGER crm_archives_updated_at
  BEFORE UPDATE ON public.crm_archives
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.crm_archives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_archives_all ON public.crm_archives;
CREATE POLICY crm_archives_all ON public.crm_archives
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.role_permissions (role_id, module_code, submodule_code, action_code, granted)
SELECT r.id, 'crm', 'crm-archives', a.code, true
FROM public.erp_roles r
CROSS JOIN (VALUES ('voir'), ('creer'), ('modifier'), ('supprimer')) AS a(code)
WHERE r.nom IN ('super_admin', 'commercial')
ON CONFLICT ON CONSTRAINT role_permissions_role_submodule_action_key DO NOTHING;

ALTER TABLE public.crm_archives ADD COLUMN IF NOT EXISTS devis_reference TEXT;
ALTER TABLE public.crm_archives ADD COLUMN IF NOT EXISTS date_echeance DATE;
CREATE INDEX IF NOT EXISTS idx_crm_archives_devis_reference ON public.crm_archives(devis_reference);
