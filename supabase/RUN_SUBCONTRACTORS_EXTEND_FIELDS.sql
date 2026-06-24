-- CITYMO — Extension fiche sous-traitant (ville, IF, RC, patente, RIB)
-- Idempotent — SQL Editor → Run

ALTER TABLE public.subcontractors ADD COLUMN IF NOT EXISTS ville TEXT;
ALTER TABLE public.subcontractors ADD COLUMN IF NOT EXISTS numero_if TEXT;
ALTER TABLE public.subcontractors ADD COLUMN IF NOT EXISTS rc TEXT;
ALTER TABLE public.subcontractors ADD COLUMN IF NOT EXISTS patente TEXT;
ALTER TABLE public.subcontractors ADD COLUMN IF NOT EXISTS rib TEXT;

CREATE INDEX IF NOT EXISTS idx_subcontractors_ville ON public.subcontractors (ville);
CREATE INDEX IF NOT EXISTS idx_subcontractors_fonction ON public.subcontractors (fonction);
