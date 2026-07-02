-- Exécuter dans Supabase SQL Editor
-- Module Dépenses par projet + seed projets chantier

CREATE TABLE IF NOT EXISTS public.project_expenses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  project_name_raw    TEXT,
  project_match_status TEXT NOT NULL DEFAULT 'matched'
    CHECK (project_match_status IN ('matched', 'needs_manual')),
  date_depense        DATE NOT NULL,
  categorie           TEXT,
  element_depense     TEXT NOT NULL,
  description         TEXT,
  fournisseur         TEXT,
  montant             NUMERIC(14, 2) NOT NULL DEFAULT 0,
  observation         TEXT,
  origine             TEXT NOT NULL DEFAULT 'charge_manuelle'
    CHECK (origine IN ('import_excel', 'achat', 'ordre_paiement', 'charge_manuelle')),
  source_type         TEXT,
  source_id           UUID,
  statut              TEXT NOT NULL DEFAULT 'valide'
    CHECK (statut IN ('valide', 'annule', 'en_attente')),
  payment_order_id    UUID,
  mode_paiement       TEXT,
  document_path       TEXT,
  attachment_url      TEXT,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_expenses_source_unique
  ON public.project_expenses (source_type, source_id)
  WHERE source_id IS NOT NULL AND source_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_expenses_project_id ON public.project_expenses(project_id);
CREATE INDEX IF NOT EXISTS idx_project_expenses_date ON public.project_expenses(date_depense DESC);
CREATE INDEX IF NOT EXISTS idx_project_expenses_origine ON public.project_expenses(origine);
CREATE INDEX IF NOT EXISTS idx_project_expenses_fournisseur ON public.project_expenses(fournisseur);
CREATE INDEX IF NOT EXISTS idx_project_expenses_match ON public.project_expenses(project_match_status);

DROP TRIGGER IF EXISTS project_expenses_updated_at ON public.project_expenses;
CREATE TRIGGER project_expenses_updated_at
  BEFORE UPDATE ON public.project_expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.project_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_expenses_all ON public.project_expenses;
CREATE POLICY project_expenses_all ON public.project_expenses
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.project_expenses TO authenticated;
GRANT ALL ON public.project_expenses TO service_role;

INSERT INTO public.role_permissions (role_id, module_code, submodule_code, action_code, granted)
SELECT r.id, 'finance_tresorerie', 'depenses-par-projet', a.code, true
FROM public.erp_roles r
CROSS JOIN (VALUES ('voir'), ('creer'), ('modifier'), ('supprimer'), ('exporter')) AS a(code)
WHERE r.code IN ('super_admin', 'finance', 'dg')
ON CONFLICT ON CONSTRAINT role_permissions_role_submodule_action_key DO NOTHING;

INSERT INTO public.projects (ref, nom, statut, budget_estime, budget_consomme)
SELECT v.ref, v.nom, 'en_cours', 0, 0
FROM (VALUES
  ('PRJ-CH-LONGOMETAL',       'LONGOMETAL'),
  ('PRJ-CH-BOUSKOURA',        'VILLA BOUSKOURA'),
  ('PRJ-CH-ZOUHAIR',          'VILLA ZOUHAIR DAR BOUAZZA'),
  ('PRJ-CH-BENSOUDA',         'Villa BENSOUDA'),
  ('PRJ-CH-POLO',             'Villa POLO'),
  ('PRJ-CH-NOUACEUR',         'Nouaceur ONDA'),
  ('PRJ-CH-LOGIPARC',         'LOGIPARC'),
  ('PRJ-CH-MARRAKECH',        'VILLA MARRAKECH'),
  ('PRJ-CH-LAMARTINE',        'LAMARTINE'),
  ('PRJ-CH-AERONAUTICA',      'AERONAUTICA RACINE')
) AS v(ref, nom)
WHERE NOT EXISTS (
  SELECT 1 FROM public.projects p
  WHERE upper(trim(p.nom)) = upper(trim(v.nom))
);

SELECT 'project_expenses OK' AS status;
