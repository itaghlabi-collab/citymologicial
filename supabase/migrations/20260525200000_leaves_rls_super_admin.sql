-- CITYMO — Congés : created_by, Super Admin, RLS granulaire
-- Exécuter dans Supabase SQL Editor après 20260525000000_rh_schema.sql

-- ─── Colonne auteur demande ─────────────────────────────────────────────────
ALTER TABLE public.leaves
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leaves_created_by ON public.leaves(created_by);

-- ─── Super Admin Selim Moumni ───────────────────────────────────────────────
INSERT INTO public.profiles (id, nom, email, role, initiales)
SELECT
  id,
  'Selim Moumni',
  email,
  'super_admin',
  'SM'
FROM auth.users
WHERE lower(email) = lower('selim.moumni@citymo.ma')
ON CONFLICT (id) DO UPDATE SET
  nom = EXCLUDED.nom,
  email = EXCLUDED.email,
  role = 'super_admin',
  initiales = 'SM';

UPDATE public.profiles
SET
  role = 'super_admin',
  nom = 'Selim Moumni',
  initiales = 'SM'
WHERE lower(email) = lower('selim.moumni@citymo.ma');

-- ─── Helper RLS ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND (
        lower(role) = 'super_admin'
        OR lower(email) = lower('selim.moumni@citymo.ma')
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- ─── RLS leaves (remplace leaves_all_auth) ──────────────────────────────────
DROP POLICY IF EXISTS leaves_all_auth ON public.leaves;

DROP POLICY IF EXISTS leaves_select_own ON public.leaves;
CREATE POLICY leaves_select_own ON public.leaves
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS leaves_select_admin ON public.leaves;
CREATE POLICY leaves_select_admin ON public.leaves
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS leaves_insert_auth ON public.leaves;
CREATE POLICY leaves_insert_auth ON public.leaves
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND statut = 'En attente'
  );

DROP POLICY IF EXISTS leaves_update_own ON public.leaves;
CREATE POLICY leaves_update_own ON public.leaves
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND statut = 'En attente')
  WITH CHECK (created_by = auth.uid() AND statut = 'En attente');

DROP POLICY IF EXISTS leaves_update_admin ON public.leaves;
CREATE POLICY leaves_update_admin ON public.leaves
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS leaves_delete_own ON public.leaves;
CREATE POLICY leaves_delete_own ON public.leaves
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() AND statut = 'En attente');

DROP POLICY IF EXISTS leaves_delete_admin ON public.leaves;
CREATE POLICY leaves_delete_admin ON public.leaves
  FOR DELETE TO authenticated
  USING (public.is_super_admin());
