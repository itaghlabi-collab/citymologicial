-- Organisation interne — Rendez-vous
-- Coller ce fichier en entier dans Supabase SQL Editor

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.internal_appointments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titre           TEXT NOT NULL,
  client_prospect TEXT,
  responsable     TEXT,
  date_rdv        DATE NOT NULL,
  heure_debut     TIME NOT NULL DEFAULT '09:00',
  heure_fin       TIME,
  lieu            TEXT,
  type_rdv        TEXT NOT NULL DEFAULT 'reunion_interne',
  statut          TEXT NOT NULL DEFAULT 'planifie',
  commentaire     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.internal_appointments ADD COLUMN IF NOT EXISTS titre TEXT;
ALTER TABLE public.internal_appointments ADD COLUMN IF NOT EXISTS client_prospect TEXT;
ALTER TABLE public.internal_appointments ADD COLUMN IF NOT EXISTS responsable TEXT;
ALTER TABLE public.internal_appointments ADD COLUMN IF NOT EXISTS date_rdv DATE;
ALTER TABLE public.internal_appointments ADD COLUMN IF NOT EXISTS heure_debut TIME NOT NULL DEFAULT '09:00';
ALTER TABLE public.internal_appointments ADD COLUMN IF NOT EXISTS heure_fin TIME;
ALTER TABLE public.internal_appointments ADD COLUMN IF NOT EXISTS lieu TEXT;
ALTER TABLE public.internal_appointments ADD COLUMN IF NOT EXISTS type_rdv TEXT NOT NULL DEFAULT 'reunion_interne';
ALTER TABLE public.internal_appointments ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'planifie';
ALTER TABLE public.internal_appointments ADD COLUMN IF NOT EXISTS commentaire TEXT;
ALTER TABLE public.internal_appointments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.internal_appointments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Supprimer les anciennes contraintes AVANT migration des valeurs
ALTER TABLE public.internal_appointments DROP CONSTRAINT IF EXISTS internal_appointments_type_check;
ALTER TABLE public.internal_appointments DROP CONSTRAINT IF EXISTS internal_appointments_statut_check;

-- Migration anciennes valeurs (si table existait avec ancien schéma)
UPDATE public.internal_appointments SET type_rdv = 'appel'            WHERE type_rdv = 'call';
UPDATE public.internal_appointments SET type_rdv = 'visite_client'   WHERE type_rdv = 'visit';
UPDATE public.internal_appointments SET type_rdv = 'reunion_interne' WHERE type_rdv = 'meeting';
UPDATE public.internal_appointments SET type_rdv = 'commercial'      WHERE type_rdv = 'sign';

ALTER TABLE public.internal_appointments
  ADD CONSTRAINT internal_appointments_type_check
  CHECK (type_rdv IN ('appel', 'visite_client', 'reunion_interne', 'chantier', 'commercial', 'autre'));

ALTER TABLE public.internal_appointments
  ADD CONSTRAINT internal_appointments_statut_check
  CHECK (statut IN ('planifie', 'termine', 'annule', 'reporte'));

DROP TRIGGER IF EXISTS internal_appointments_updated_at ON public.internal_appointments;
CREATE TRIGGER internal_appointments_updated_at
  BEFORE UPDATE ON public.internal_appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_internal_appointments_date ON public.internal_appointments(date_rdv);
CREATE INDEX IF NOT EXISTS idx_internal_appointments_responsable ON public.internal_appointments(responsable);
CREATE INDEX IF NOT EXISTS idx_internal_appointments_statut ON public.internal_appointments(statut);
CREATE INDEX IF NOT EXISTS idx_internal_appointments_type ON public.internal_appointments(type_rdv);
CREATE INDEX IF NOT EXISTS idx_internal_appointments_created_at ON public.internal_appointments(created_at DESC);

ALTER TABLE public.internal_appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS internal_appointments_all_auth ON public.internal_appointments;
CREATE POLICY internal_appointments_all_auth ON public.internal_appointments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.internal_appointments TO authenticated;
GRANT ALL ON public.internal_appointments TO service_role;
