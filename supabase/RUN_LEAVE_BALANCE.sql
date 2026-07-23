-- CITYMO — Droits au congé (reliquat, snapshot, jours fériés)
-- Additive / isolé — ne casse pas les demandes ni les salariés existants.
-- Exécuter dans Supabase → SQL Editor → Run

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Paramètres solde sur employees ───────────────────────────────────────────
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS conges_jours_annuels NUMERIC(6, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conges_reliquat NUMERIC(6, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conges_annee_ref INTEGER,
  ADD COLUMN IF NOT EXISTS conges_jours_travailles NUMERIC(8, 2);

-- ── Calendrier jours fériés ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.public_holidays (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date        DATE NOT NULL,
  label       TEXT NOT NULL,
  pays        TEXT NOT NULL DEFAULT 'MA',
  actif       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT public_holidays_date_unique UNIQUE (date)
);

CREATE INDEX IF NOT EXISTS idx_public_holidays_date
  ON public.public_holidays (date)
  WHERE actif = TRUE;

ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_holidays_select ON public.public_holidays;
CREATE POLICY public_holidays_select ON public.public_holidays
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS public_holidays_write ON public.public_holidays;
CREATE POLICY public_holidays_write ON public.public_holidays
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.public_holidays TO authenticated, service_role;

-- Seed minimal 2026 (idempotent) — calendrier RH, pas hardcodé dans le front
INSERT INTO public.public_holidays (date, label, pays, actif)
SELECT v.date::date, v.label, 'MA', TRUE
FROM (VALUES
  ('2026-01-01', 'Nouvel An'),
  ('2026-01-11', 'Manifeste de l''Indépendance'),
  ('2026-05-01', 'Fête du Travail'),
  ('2026-07-30', 'Fête du Trône'),
  ('2026-08-14', 'Oued Ed-Dahab'),
  ('2026-08-20', 'Révolution du Roi et du Peuple'),
  ('2026-08-21', 'Fête de la Jeunesse'),
  ('2026-11-06', 'Marche Verte'),
  ('2026-11-18', 'Fête de l''Indépendance')
) AS v(date, label)
ON CONFLICT (date) DO NOTHING;

-- ── Snapshot + traçabilité sur leaves ────────────────────────────────────────
ALTER TABLE public.leaves
  ADD COLUMN IF NOT EXISTS consumes_balance BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS balance_snapshot_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS snap_jours_travailles NUMERIC(8, 2),
  ADD COLUMN IF NOT EXISTS snap_jours_feries NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS snap_reliquat_ancien NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS snap_droit_acquis NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS snap_jours_consommes NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS snap_solde_disponible NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS snap_jours_accordes NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS snap_reliquat_nouveau NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS snap_feries_detail TEXT,
  ADD COLUMN IF NOT EXISTS snap_regle_calcul TEXT,
  ADD COLUMN IF NOT EXISTS balance_debited BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS balance_restored BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS override_balance BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS override_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS override_reason TEXT;

-- Élargir CHECK statut (Annule) sans casser les lignes existantes
DO $$
BEGIN
  ALTER TABLE public.leaves DROP CONSTRAINT IF EXISTS leaves_statut_check;
  ALTER TABLE public.leaves
    ADD CONSTRAINT leaves_statut_check
    CHECK (statut IN ('En attente', 'Approuve', 'Refuse', 'Annule'));
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'leaves statut check: %', SQLERRM;
END $$;

-- ── Ledger mouvements (anti double débit / crédit) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.leave_balance_movements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_id     UUID REFERENCES public.leaves(id) ON DELETE SET NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('debit_approve', 'credit_cancel', 'adjust_manual', 'year_carry')),
  days         NUMERIC(6, 2) NOT NULL,
  annee_ref    INTEGER,
  note         TEXT,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT leave_balance_movements_leave_kind_unique UNIQUE (leave_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_leave_balance_movements_employee
  ON public.leave_balance_movements (employee_id, created_at DESC);

ALTER TABLE public.leave_balance_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leave_balance_movements_all ON public.leave_balance_movements;
CREATE POLICY leave_balance_movements_all ON public.leave_balance_movements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.leave_balance_movements TO authenticated, service_role;

SELECT 'leave_balance schema OK' AS status;
