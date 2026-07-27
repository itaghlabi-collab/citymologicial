-- CITYMO — historique OCR CIN (optionnel, ne pas appliquer en prod sans validation)
-- Table de traçabilité minimale : analyse confirmée / rejetée
-- Ne stocke PAS le texte OCR brut complet.

CREATE TABLE IF NOT EXISTS public.worker_cin_ocr_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid REFERENCES public.workers(id) ON DELETE SET NULL,
  user_id uuid,
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  engine_name text,
  engine_version text,
  confidence_globale text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected')),
  fields_corrected jsonb DEFAULT '[]'::jsonb,
  quality_recto jsonb,
  quality_verso jsonb,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS worker_cin_ocr_logs_worker_idx
  ON public.worker_cin_ocr_logs (worker_id, analyzed_at DESC);

COMMENT ON TABLE public.worker_cin_ocr_logs IS
  'Traçabilité OCR CIN CITYMO (sans contenu OCR brut ni URL publique image).';

ALTER TABLE public.worker_cin_ocr_logs ENABLE ROW LEVEL SECURITY;
