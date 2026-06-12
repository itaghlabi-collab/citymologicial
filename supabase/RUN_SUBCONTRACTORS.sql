-- =============================================================================
-- CITYMO — Sous-traitants : fiche globale + affectations projet + prestations + paiements
-- Supabase SQL Editor → coller tout → Run
-- Idempotent : CREATE IF NOT EXISTS, pas de DROP/TRUNCATE/DELETE de données
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

-- ─── 1. Fiche sous-traitant (globale, sans project_id obligatoire) ───────────
CREATE TABLE IF NOT EXISTS public.subcontractors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prenom          TEXT,
  nom             TEXT NOT NULL,
  raison_sociale  TEXT,
  fonction        TEXT,
  numero_cin      TEXT,
  passeport       TEXT,
  telephone       TEXT,
  email           TEXT,
  adresse         TEXT,
  ice             TEXT,
  statut          TEXT NOT NULL DEFAULT 'actif'
    CHECK (statut IN ('actif', 'inactif', 'suspendu', 'archive')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.subcontractors DROP COLUMN IF EXISTS project_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subcontractors_numero_cin
  ON public.subcontractors (UPPER(TRIM(numero_cin)))
  WHERE numero_cin IS NOT NULL AND TRIM(numero_cin) <> '';

CREATE INDEX IF NOT EXISTS idx_subcontractors_nom ON public.subcontractors (nom, prenom);
CREATE INDEX IF NOT EXISTS idx_subcontractors_statut ON public.subcontractors (statut);

DROP TRIGGER IF EXISTS subcontractors_updated_at ON public.subcontractors;
CREATE TRIGGER subcontractors_updated_at
  BEFORE UPDATE ON public.subcontractors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Documents sous-traitant ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subcontractor_documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id  UUID NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
  doc_type          TEXT DEFAULT 'other',
  file_name         TEXT,
  storage_path      TEXT,
  mime_type         TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subcontractor_documents_sub_id
  ON public.subcontractor_documents (subcontractor_id);

-- ─── 2. Affectations projet ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subcontractor_project_assignments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id    UUID NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
  project_id          UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  project_ref         TEXT,
  project_name        TEXT,
  start_date          DATE,
  end_date            DATE,
  role                TEXT,
  remuneration_type   TEXT
    CHECK (remuneration_type IS NULL OR remuneration_type IN (
      'À la tâche', 'Au m²', 'Au ml', 'Au forfait', 'Par service', 'Autre'
    )),
  unit_type           TEXT
    CHECK (unit_type IS NULL OR unit_type IN (
      'tâche', 'm²', 'ml', 'unité', 'forfait', 'jour', 'heure'
    )),
  unit_price          NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  estimated_quantity  NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (estimated_quantity >= 0),
  estimated_total     NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (estimated_total >= 0),
  status              TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'terminée', 'suspendue', 'annulée')),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spa_subcontractor ON public.subcontractor_project_assignments (subcontractor_id);
CREATE INDEX IF NOT EXISTS idx_spa_project ON public.subcontractor_project_assignments (project_id);
CREATE INDEX IF NOT EXISTS idx_spa_status ON public.subcontractor_project_assignments (status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_spa_sub_project_unique
  ON public.subcontractor_project_assignments (subcontractor_id, project_id)
  WHERE project_id IS NOT NULL;

DROP TRIGGER IF EXISTS spa_updated_at ON public.subcontractor_project_assignments;
CREATE TRIGGER spa_updated_at
  BEFORE UPDATE ON public.subcontractor_project_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 3. Prestations réalisées ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subcontractor_services (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id     UUID NOT NULL REFERENCES public.subcontractor_project_assignments(id) ON DELETE CASCADE,
  subcontractor_id  UUID NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
  project_id        UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  service_date      DATE,
  description       TEXT,
  quantity          NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit_type         TEXT,
  unit_price        NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  total_amount      NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'validated', 'rejected', 'paid')),
  validated_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  validated_at      TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_services_assignment ON public.subcontractor_services (assignment_id);
CREATE INDEX IF NOT EXISTS idx_sub_services_sub ON public.subcontractor_services (subcontractor_id);
CREATE INDEX IF NOT EXISTS idx_sub_services_project ON public.subcontractor_services (project_id);
CREATE INDEX IF NOT EXISTS idx_sub_services_date ON public.subcontractor_services (service_date DESC);

CREATE OR REPLACE FUNCTION public.subcontractor_service_calc_total()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.total_amount := ROUND(COALESCE(NEW.quantity, 0) * COALESCE(NEW.unit_price, 0), 2);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS sub_services_calc_total ON public.subcontractor_services;
CREATE TRIGGER sub_services_calc_total
  BEFORE INSERT OR UPDATE OF quantity, unit_price ON public.subcontractor_services
  FOR EACH ROW EXECUTE FUNCTION public.subcontractor_service_calc_total();

DROP TRIGGER IF EXISTS sub_services_updated_at ON public.subcontractor_services;
CREATE TRIGGER sub_services_updated_at
  BEFORE UPDATE ON public.subcontractor_services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 4. Paiements ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subcontractor_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id  UUID NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
  project_id        UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  assignment_id     UUID REFERENCES public.subcontractor_project_assignments(id) ON DELETE SET NULL,
  payment_date      DATE NOT NULL,
  amount            NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  payment_method    TEXT
    CHECK (payment_method IS NULL OR payment_method IN ('espèces', 'virement', 'chèque', 'autre')),
  reference         TEXT,
  description       TEXT,
  paid_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'paid'
    CHECK (status IN ('paid', 'pending', 'cancelled')),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_payments_sub ON public.subcontractor_payments (subcontractor_id);
CREATE INDEX IF NOT EXISTS idx_sub_payments_project ON public.subcontractor_payments (project_id);
CREATE INDEX IF NOT EXISTS idx_sub_payments_assignment ON public.subcontractor_payments (assignment_id);
CREATE INDEX IF NOT EXISTS idx_sub_payments_date ON public.subcontractor_payments (payment_date DESC);

DROP TRIGGER IF EXISTS sub_payments_updated_at ON public.subcontractor_payments;
CREATE TRIGGER sub_payments_updated_at
  BEFORE UPDATE ON public.subcontractor_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 5. Vue soldes par sous-traitant / projet ────────────────────────────────
CREATE OR REPLACE VIEW public.subcontractor_project_balances AS
SELECT
  a.subcontractor_id,
  TRIM(COALESCE(s.prenom, '') || ' ' || COALESCE(s.nom, '')) AS subcontractor_name,
  a.project_id,
  COALESCE(p.nom, a.project_name, '—') AS project_name,
  a.id AS assignment_id,
  a.remuneration_type,
  COALESCE(svc_agg.total_services_amount, 0)::NUMERIC(14, 2) AS total_services_amount,
  COALESCE(pay_agg.total_paid_amount, 0)::NUMERIC(14, 2) AS total_paid_amount,
  (COALESCE(svc_agg.total_services_amount, 0) - COALESCE(pay_agg.total_paid_amount, 0))::NUMERIC(14, 2) AS remaining_amount,
  CASE
    WHEN COALESCE(pay_agg.total_paid_amount, 0) = 0 THEN 'non payé'
    WHEN (COALESCE(svc_agg.total_services_amount, 0) - COALESCE(pay_agg.total_paid_amount, 0)) > 0 THEN 'partiellement payé'
    ELSE 'payé'
  END AS payment_status
FROM public.subcontractor_project_assignments a
JOIN public.subcontractors s ON s.id = a.subcontractor_id
LEFT JOIN public.projects p ON p.id = a.project_id
LEFT JOIN (
  SELECT assignment_id, SUM(total_amount) AS total_services_amount
  FROM public.subcontractor_services
  WHERE status IN ('pending', 'validated', 'paid')
  GROUP BY assignment_id
) svc_agg ON svc_agg.assignment_id = a.id
LEFT JOIN (
  SELECT assignment_id, SUM(amount) AS total_paid_amount
  FROM public.subcontractor_payments
  WHERE status = 'paid'
  GROUP BY assignment_id
) pay_agg ON pay_agg.assignment_id = a.id;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.subcontractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontractor_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontractor_project_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontractor_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontractor_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subcontractors_auth ON public.subcontractors;
CREATE POLICY subcontractors_auth ON public.subcontractors
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS sub_documents_auth ON public.subcontractor_documents;
CREATE POLICY sub_documents_auth ON public.subcontractor_documents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS spa_auth ON public.subcontractor_project_assignments;
CREATE POLICY spa_auth ON public.subcontractor_project_assignments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS sub_services_auth ON public.subcontractor_services;
CREATE POLICY sub_services_auth ON public.subcontractor_services
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS sub_payments_auth ON public.subcontractor_payments;
CREATE POLICY sub_payments_auth ON public.subcontractor_payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Upsert sous-traitant (seed sécurisé, sans affectation projet auto) ──────
CREATE OR REPLACE FUNCTION public._citymo_upsert_subcontractor(
  p_prenom       TEXT,
  p_nom          TEXT,
  p_fonction     TEXT DEFAULT NULL,
  p_numero_cin   TEXT DEFAULT NULL,
  p_passeport    TEXT DEFAULT NULL,
  p_telephone    TEXT DEFAULT NULL,
  p_email        TEXT DEFAULT NULL,
  p_adresse      TEXT DEFAULT NULL,
  p_raison_sociale TEXT DEFAULT NULL,
  p_ice          TEXT DEFAULT NULL,
  p_statut       TEXT DEFAULT 'actif',
  p_notes        TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE v_id UUID;
  v_cin TEXT;
BEGIN
  v_cin := UPPER(TRIM(COALESCE(p_numero_cin, '')));

  IF v_cin <> '' THEN
    SELECT id INTO v_id FROM public.subcontractors
    WHERE UPPER(TRIM(COALESCE(numero_cin, ''))) = v_cin
    LIMIT 1;

    IF v_id IS NOT NULL THEN
      UPDATE public.subcontractors SET
        prenom = NULLIF(TRIM(p_prenom), ''), nom = TRIM(p_nom),
        raison_sociale = NULLIF(TRIM(p_raison_sociale), ''), fonction = NULLIF(TRIM(p_fonction), ''),
        passeport = NULLIF(TRIM(p_passeport), ''), telephone = NULLIF(TRIM(p_telephone), ''),
        email = NULLIF(TRIM(p_email), ''), adresse = NULLIF(TRIM(p_adresse), ''),
        ice = NULLIF(TRIM(p_ice), ''), statut = COALESCE(NULLIF(TRIM(p_statut), ''), 'actif'),
        notes = NULLIF(TRIM(p_notes), ''), updated_at = NOW()
      WHERE id = v_id;
      RETURN v_id;
    END IF;
  END IF;

  INSERT INTO public.subcontractors (
    prenom, nom, raison_sociale, fonction, numero_cin, passeport,
    telephone, email, adresse, ice, statut, notes
  ) VALUES (
    NULLIF(TRIM(p_prenom), ''), TRIM(p_nom), NULLIF(TRIM(p_raison_sociale), ''),
    NULLIF(TRIM(p_fonction), ''), NULLIF(v_cin, ''), NULLIF(TRIM(p_passeport), ''),
    NULLIF(TRIM(p_telephone), ''), NULLIF(TRIM(p_email), ''), NULLIF(TRIM(p_adresse), ''),
    NULLIF(TRIM(p_ice), ''), COALESCE(NULLIF(TRIM(p_statut), ''), 'actif'), NULLIF(TRIM(p_notes), '')
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Ajoutez vos 10 sous-traitants ici (exemple — remplacez par vos données réelles) :
-- SELECT public._citymo_upsert_subcontractor('Ahmed', 'BENALI', 'Plomberie', 'AB123456', NULL, '06-00-00-00-01', NULL, 'Casablanca', 'ST BENALI SARL', NULL, 'actif', NULL);

NOTIFY pgrst, 'reload schema';

GRANT SELECT ON public.subcontractor_project_balances TO authenticated;

SELECT
  (SELECT COUNT(*)::int FROM public.subcontractors) AS total_subcontractors,
  (SELECT COUNT(*)::int FROM public.subcontractor_project_assignments) AS total_assignments,
  (SELECT COUNT(*)::int FROM public.subcontractor_services) AS total_services,
  (SELECT COUNT(*)::int FROM public.subcontractor_payments) AS total_payments;
