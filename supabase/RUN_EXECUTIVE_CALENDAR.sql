-- =============================================================================
-- CITYMO — Agenda de Direction (executive_calendar)
-- Coller dans Supabase → SQL Editor → Run (idempotent, sans DROP/TRUNCATE/DELETE)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

-- ── Helpers rôles ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (
        lower(role) IN ('super_admin', 'super admin')
        OR lower(email) IN (lower('selim.moumni@citymo.ma'), lower('selim.moumni@gmail.com'))
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.normalize_profile_role(p_role TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(trim(regexp_replace(
    translate(coalesce(p_role, ''), 'éèêëàâäùûüôöîïç', 'eeeeaaauuuooiic'),
    '\s+', ' ', 'g'
  )));
$$;

CREATE OR REPLACE FUNCTION public.can_read_executive_calendar()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_super_admin()
    OR public.normalize_profile_role(p.role) IN (
      'admin', 'administrateur', 'super admin', 'super_admin',
      'assistante de direction', 'assistante direction',
      'directeur general', 'directeur_general', 'dg'
    )
    OR lower(coalesce(p.email, '')) = lower('selim.moumni@citymo.ma')
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.can_write_executive_calendar()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_super_admin()
    OR public.normalize_profile_role(p.role) IN (
      'admin', 'administrateur', 'super admin', 'super_admin',
      'assistante de direction', 'assistante direction',
      'directeur general', 'directeur_general', 'dg'
    )
    OR lower(coalesce(p.email, '')) = lower('selim.moumni@citymo.ma')
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.can_read_executive_calendar() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_executive_calendar() TO authenticated;

-- ── Table principale ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.executive_calendar (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  description     TEXT,
  start_datetime  TIMESTAMPTZ NOT NULL,
  end_datetime    TIMESTAMPTZ NOT NULL,
  location        TEXT,
  event_type      TEXT NOT NULL DEFAULT 'autre',
  status          TEXT NOT NULL DEFAULT 'prevu',
  priority        TEXT NOT NULL DEFAULT 'normale',
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.executive_calendar ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.executive_calendar ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.executive_calendar ADD COLUMN IF NOT EXISTS start_datetime TIMESTAMPTZ;
ALTER TABLE public.executive_calendar ADD COLUMN IF NOT EXISTS end_datetime TIMESTAMPTZ;
ALTER TABLE public.executive_calendar ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE public.executive_calendar ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT 'autre';
ALTER TABLE public.executive_calendar ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'prevu';
ALTER TABLE public.executive_calendar ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normale';
ALTER TABLE public.executive_calendar ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Liaisons futures (sans contrainte FK pour ne pas casser si tables absentes)
ALTER TABLE public.executive_calendar ADD COLUMN IF NOT EXISTS prospect_id UUID;
ALTER TABLE public.executive_calendar ADD COLUMN IF NOT EXISTS client_id UUID;
ALTER TABLE public.executive_calendar ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE public.executive_calendar ADD COLUMN IF NOT EXISTS chantier_id UUID;

ALTER TABLE public.executive_calendar DROP CONSTRAINT IF EXISTS executive_calendar_event_type_check;
ALTER TABLE public.executive_calendar
  ADD CONSTRAINT executive_calendar_event_type_check CHECK (event_type IN (
    'rdv_client', 'reunion_interne', 'reunion_chantier', 'deplacement', 'visite_chantier',
    'reunion_fournisseur', 'reunion_partenaire', 'appel_important', 'personnel', 'bloque', 'autre'
  ));

ALTER TABLE public.executive_calendar DROP CONSTRAINT IF EXISTS executive_calendar_status_check;
ALTER TABLE public.executive_calendar
  ADD CONSTRAINT executive_calendar_status_check CHECK (status IN (
    'prevu', 'confirme', 'reporte', 'annule', 'realise'
  ));

ALTER TABLE public.executive_calendar DROP CONSTRAINT IF EXISTS executive_calendar_priority_check;
ALTER TABLE public.executive_calendar
  ADD CONSTRAINT executive_calendar_priority_check CHECK (priority IN (
    'haute', 'normale', 'faible'
  ));

CREATE INDEX IF NOT EXISTS idx_executive_calendar_start ON public.executive_calendar (start_datetime);
CREATE INDEX IF NOT EXISTS idx_executive_calendar_end ON public.executive_calendar (end_datetime);
CREATE INDEX IF NOT EXISTS idx_executive_calendar_type ON public.executive_calendar (event_type);
CREATE INDEX IF NOT EXISTS idx_executive_calendar_status ON public.executive_calendar (status);
CREATE INDEX IF NOT EXISTS idx_executive_calendar_priority ON public.executive_calendar (priority);

DROP TRIGGER IF EXISTS executive_calendar_updated_at ON public.executive_calendar;
CREATE TRIGGER executive_calendar_updated_at
  BEFORE UPDATE ON public.executive_calendar
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Notifications ERP ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.executive_calendar_notifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES public.executive_calendar(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('24h', '1h')),
  notify_at         TIMESTAMPTZ NOT NULL,
  sent_at           TIMESTAMPTZ,
  read_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exec_cal_notif_unique
  ON public.executive_calendar_notifications (event_id, user_id, notification_type);

CREATE INDEX IF NOT EXISTS idx_exec_cal_notif_user_pending
  ON public.executive_calendar_notifications (user_id, notify_at)
  WHERE read_at IS NULL;

-- ── RLS executive_calendar ────────────────────────────────────────────────────
ALTER TABLE public.executive_calendar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS executive_calendar_select ON public.executive_calendar;
DROP POLICY IF EXISTS executive_calendar_insert ON public.executive_calendar;
DROP POLICY IF EXISTS executive_calendar_update ON public.executive_calendar;
DROP POLICY IF EXISTS executive_calendar_delete ON public.executive_calendar;

CREATE POLICY executive_calendar_select ON public.executive_calendar
  FOR SELECT TO authenticated USING (public.can_read_executive_calendar());

CREATE POLICY executive_calendar_insert ON public.executive_calendar
  FOR INSERT TO authenticated WITH CHECK (public.can_write_executive_calendar());

CREATE POLICY executive_calendar_update ON public.executive_calendar
  FOR UPDATE TO authenticated
  USING (public.can_write_executive_calendar())
  WITH CHECK (public.can_write_executive_calendar());

CREATE POLICY executive_calendar_delete ON public.executive_calendar
  FOR DELETE TO authenticated USING (public.can_write_executive_calendar());

GRANT ALL ON public.executive_calendar TO authenticated, service_role;

-- ── RLS notifications ───────────────────────────────────────────────────────
ALTER TABLE public.executive_calendar_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exec_cal_notif_select ON public.executive_calendar_notifications;
DROP POLICY IF EXISTS exec_cal_notif_insert ON public.executive_calendar_notifications;
DROP POLICY IF EXISTS exec_cal_notif_update ON public.executive_calendar_notifications;

CREATE POLICY exec_cal_notif_select ON public.executive_calendar_notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.can_read_executive_calendar());

CREATE POLICY exec_cal_notif_insert ON public.executive_calendar_notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_write_executive_calendar());

CREATE POLICY exec_cal_notif_update ON public.executive_calendar_notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT ALL ON public.executive_calendar_notifications TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT COUNT(*)::int AS events_count FROM public.executive_calendar;
