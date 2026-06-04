-- ═══════════════════════════════════════════════════════════════════════════
-- CITYMO — RESTAURATION COMPLÈTE SCHÉMA + SEEDS (idempotent)
-- Projet Supabase : https://npddbwsskaojcawaxygh.supabase.co
--
-- RÈGLES :
--   • Aucun DROP TABLE, aucun TRUNCATE, aucune suppression de données
--   • CREATE IF NOT EXISTS, ALTER ADD COLUMN IF NOT EXISTS, UPSERT / ON CONFLICT
--   • Exécuter EN ENTIER dans SQL Editor (peut prendre 1–2 min)
--
-- AVANT : exécuter AUDIT_SCHEMA_CITYMO.sql pour voir l'état actuel
-- APRÈS : ré-exécuter AUDIT_SCHEMA_CITYMO.sql pour valider
--
-- NOTE : le seed employés 20260527130000 est EXCLU (bug CIN dupliqué).
--        Utiliser 20260527140000_reseed_employees_citymo_safe.sql inclus ci-dessous.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT 'CITYMO RESTORE START' AS step, NOW() AS at;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260525000000_rh_schema.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- CITYMO ERP — Phase 2 RH schema (Supabase / PostgreSQL)
-- Run in Supabase SQL Editor or: supabase db push

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Updated_at trigger ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── DEPARTMENTS (system registry, mirrors src/data/departments.js) ─────────
CREATE TABLE IF NOT EXISTS public.departments (
  id          INTEGER PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  nom         TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS departments_updated_at ON public.departments;
CREATE TRIGGER departments_updated_at
  BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.departments (id, code, nom, description) VALUES
  (1, 'COM', 'DEPARTEMENT COMMERCIAL',           'Gestion des ventes, clients et devis'),
  (2, 'RH',  'DEPARTEMENT RESSOURCES HUMAINES',  'Gestion du personnel, recrutement et conges'),
  (3, 'ACH', 'DEPARTEMENT ACHATS',               'Approvisionnement, fournisseurs et commandes'),
  (4, 'MKT', 'DEPARTEMENT MARKETING',            'Communication, marketing et actions commerciales'),
  (5, 'EXP', 'DEPARTEMENT EXPLOITATION',         'Chantiers, ouvriers et suivi terrain'),
  (6, 'CPT', 'DEPARTEMENT COMPTABILITE',         'Finances, tresorerie et charges'),
  (7, 'ADM', 'ADMINISTRATION',                   'Direction, administration et systeme'),
  (8, 'SAV', 'SERVICE APRES VENTE',              'Interventions, SAV et suivi client post-projet'),
  (9, 'LOG', 'LOGISTIQUE',                       'Vehicules, transport et gestion du depot')
ON CONFLICT (id) DO UPDATE SET
  code = EXCLUDED.code,
  nom = EXCLUDED.nom,
  description = EXCLUDED.description;

-- ─── PROFILES (extends auth.users for app session) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nom             TEXT NOT NULL,
  email           TEXT,
  role            TEXT NOT NULL DEFAULT 'commercial',
  initiales       TEXT,
  department_id   INTEGER REFERENCES public.departments(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nom, email, role, initiales)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nom', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'commercial'),
    COALESCE(NEW.raw_user_meta_data->>'initiales', upper(left(split_part(NEW.email, '@', 1), 2)))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── EMPLOYEES (RH module — matches RH.jsx form fields) ─────────────────────
CREATE TABLE IF NOT EXISTS public.employees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firstname       TEXT NOT NULL,
  lastname        TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  poste           TEXT NOT NULL,
  department      TEXT,
  department_id   INTEGER REFERENCES public.departments(id) ON DELETE SET NULL,
  telephone       TEXT,
  salaire         NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (salaire >= 0),
  statut          TEXT NOT NULL DEFAULT 'Actif' CHECK (statut IN ('Actif', 'Conge', 'Inactif')),
  date_embauche   DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS employees_updated_at ON public.employees;
CREATE TRIGGER employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_employees_statut ON public.employees(statut);
CREATE INDEX IF NOT EXISTS idx_employees_department_id ON public.employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_name ON public.employees(lastname, firstname);
CREATE INDEX IF NOT EXISTS idx_employees_created_at ON public.employees(created_at DESC);

-- ─── LEAVES (congés — future Conges.jsx) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leaves (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  employe_label   TEXT,
  type            TEXT NOT NULL DEFAULT 'Conge annuel',
  date_debut      DATE NOT NULL,
  date_fin        DATE NOT NULL,
  date_retour     DATE,
  jours           INTEGER NOT NULL DEFAULT 0 CHECK (jours >= 0),
  raison          TEXT,
  statut          TEXT NOT NULL DEFAULT 'En attente' CHECK (statut IN ('En attente', 'Approuve', 'Refuse')),
  fichier_url     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS leaves_updated_at ON public.leaves;
CREATE TRIGGER leaves_updated_at
  BEFORE UPDATE ON public.leaves
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_leaves_employee_id ON public.leaves(employee_id);
CREATE INDEX IF NOT EXISTS idx_leaves_statut ON public.leaves(statut);
CREATE INDEX IF NOT EXISTS idx_leaves_dates ON public.leaves(date_debut, date_fin);

-- ─── ATTENDANCE (présence — future Presence.jsx) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.attendance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  worker_id       UUID,
  date            DATE NOT NULL,
  statut          TEXT NOT NULL DEFAULT 'present' CHECK (statut IN ('present', 'absent', 'retard', 'conge')),
  heure_entree    TIME,
  heure_sortie    TIME,
  chantier        TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS attendance_updated_at ON public.attendance;
CREATE TRIGGER attendance_updated_at
  BEFORE UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance(date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_employee_id ON public.attendance(employee_id);

-- ─── PAYROLL (paiement hebdo — future PaiementHebdo.jsx) ─────────────────────
CREATE TABLE IF NOT EXISTS public.payroll (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  worker_id       UUID,
  semaine_debut   DATE NOT NULL,
  semaine_fin     DATE NOT NULL,
  heures_normales NUMERIC(8, 2) NOT NULL DEFAULT 0,
  heures_sup      NUMERIC(8, 2) NOT NULL DEFAULT 0,
  montant_brut    NUMERIC(12, 2) NOT NULL DEFAULT 0,
  montant_net     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  statut          TEXT NOT NULL DEFAULT 'Brouillon' CHECK (statut IN ('Brouillon', 'Valide', 'Paye')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS payroll_updated_at ON public.payroll;
CREATE TRIGGER payroll_updated_at
  BEFORE UPDATE ON public.payroll
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_payroll_semaine ON public.payroll(semaine_debut DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_employee_id ON public.payroll(employee_id);

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────────────────────
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;

-- Departments: read-only for authenticated users
DROP POLICY IF EXISTS departments_select_auth ON public.departments;
CREATE POLICY departments_select_auth ON public.departments
  FOR SELECT TO authenticated USING (true);

-- Profiles
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Employees: full CRUD for authenticated
DROP POLICY IF EXISTS employees_select_auth ON public.employees;
CREATE POLICY employees_select_auth ON public.employees
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS employees_insert_auth ON public.employees;
CREATE POLICY employees_insert_auth ON public.employees
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS employees_update_auth ON public.employees;
CREATE POLICY employees_update_auth ON public.employees
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS employees_delete_auth ON public.employees;
CREATE POLICY employees_delete_auth ON public.employees
  FOR DELETE TO authenticated USING (true);

-- Leaves / attendance / payroll (authenticated — ready for next phases)
DROP POLICY IF EXISTS leaves_all_auth ON public.leaves;
CREATE POLICY leaves_all_auth ON public.leaves
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS attendance_all_auth ON public.attendance;
CREATE POLICY attendance_all_auth ON public.attendance
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS payroll_all_auth ON public.payroll;
CREATE POLICY payroll_all_auth ON public.payroll
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260525000001_profiles_insert_policy.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- CITYMO — Allow authenticated users to create their own profile row
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260525200000_leaves_rls_super_admin.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260525300000_workers_schema.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- CITYMO ERP — Ouvriers / workers (Employés Externes)
-- Run in Supabase SQL Editor or: supabase db push

-- ─── WORKERS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_cin          TEXT UNIQUE,
  prenom              TEXT NOT NULL,
  nom                 TEXT NOT NULL,
  telephone           TEXT,
  fonction            TEXT,
  specialite          TEXT,
  tarif               NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (tarif >= 0),
  experience          TEXT DEFAULT 'intermediaire'
    CHECK (experience IN ('debutant', 'intermediaire', 'confirme', 'expert')),
  date_naissance      DATE,
  lieu_naissance      TEXT,
  adresse             TEXT,
  nationalite         TEXT DEFAULT 'Marocaine',
  etat_civil          TEXT,
  groupe_sanguin      TEXT,
  sexe                TEXT CHECK (sexe IS NULL OR sexe IN ('M', 'F')),
  date_expiration     DATE,
  date_recrutement    DATE,
  statut              TEXT NOT NULL DEFAULT 'actif'
    CHECK (statut IN ('actif', 'en_chantier', 'disponible', 'suspendu', 'archive')),
  disponibilite       TEXT DEFAULT 'oui',
  chantier            TEXT,
  badge               TEXT,
  contact_urgence     TEXT,
  tel_urgence         TEXT,
  relation_urgence    TEXT,
  pointure            TEXT,
  taille_vetement     TEXT,
  taille_gants        TEXT,
  casque              TEXT,
  photo_url           TEXT,
  cin_recto_url       TEXT,
  cin_verso_url       TEXT,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS workers_updated_at ON public.workers;
CREATE TRIGGER workers_updated_at
  BEFORE UPDATE ON public.workers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_workers_numero_cin ON public.workers(numero_cin);
CREATE INDEX IF NOT EXISTS idx_workers_statut ON public.workers(statut);
CREATE INDEX IF NOT EXISTS idx_workers_fonction ON public.workers(fonction);
CREATE INDEX IF NOT EXISTS idx_workers_chantier ON public.workers(chantier);
CREATE INDEX IF NOT EXISTS idx_workers_nom ON public.workers(nom, prenom);

-- ─── WORKER DOCUMENTS (CIN + pièces jointes) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.worker_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id       UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  doc_type        TEXT NOT NULL
    CHECK (doc_type IN ('cin_recto', 'cin_verso', 'photo', 'other')),
  storage_path    TEXT NOT NULL,
  file_name       TEXT,
  mime_type       TEXT,
  file_size       BIGINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worker_documents_worker_id ON public.worker_documents(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_documents_doc_type ON public.worker_documents(doc_type);

-- ─── FK attendance / payroll → workers ──────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_worker_id_fkey'
  ) THEN
    ALTER TABLE public.attendance
      ADD CONSTRAINT attendance_worker_id_fkey
      FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payroll_worker_id_fkey'
  ) THEN
    ALTER TABLE public.payroll
      ADD CONSTRAINT payroll_worker_id_fkey
      FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── RLS workers ────────────────────────────────────────────────────────────
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workers_select_auth ON public.workers;
CREATE POLICY workers_select_auth ON public.workers
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS workers_insert_auth ON public.workers;
CREATE POLICY workers_insert_auth ON public.workers
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS workers_update_auth ON public.workers;
CREATE POLICY workers_update_auth ON public.workers
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS workers_delete_auth ON public.workers;
CREATE POLICY workers_delete_auth ON public.workers
  FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS worker_documents_select_auth ON public.worker_documents;
CREATE POLICY worker_documents_select_auth ON public.worker_documents
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS worker_documents_insert_auth ON public.worker_documents;
CREATE POLICY worker_documents_insert_auth ON public.worker_documents
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS worker_documents_update_auth ON public.worker_documents;
CREATE POLICY worker_documents_update_auth ON public.worker_documents
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS worker_documents_delete_auth ON public.worker_documents;
CREATE POLICY worker_documents_delete_auth ON public.worker_documents
  FOR DELETE TO authenticated USING (true);

-- ─── STORAGE bucket (privé — signed URLs côté client) ───────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'citymo-workers',
  'citymo-workers',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Authenticated: lecture / écriture dans citymo-workers (paths workers/cin/, workers/photos/)
DROP POLICY IF EXISTS citymo_workers_select ON storage.objects;
CREATE POLICY citymo_workers_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'citymo-workers');

DROP POLICY IF EXISTS citymo_workers_insert ON storage.objects;
CREATE POLICY citymo_workers_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'citymo-workers');

DROP POLICY IF EXISTS citymo_workers_update ON storage.objects;
CREATE POLICY citymo_workers_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'citymo-workers')
  WITH CHECK (bucket_id = 'citymo-workers');

DROP POLICY IF EXISTS citymo_workers_delete ON storage.objects;
CREATE POLICY citymo_workers_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'citymo-workers');

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260525400000_attendance_workers.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Présence ouvriers — alignement statuts UI + index worker_id
-- Exécuter après 20260525000000_rh_schema.sql et 20260525300000_workers_schema.sql

ALTER TABLE public.attendance
  DROP CONSTRAINT IF EXISTS attendance_statut_check;

ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_statut_check
  CHECK (statut IN ('present', 'absent', 'retard', 'demi_journee', 'conge'));

CREATE INDEX IF NOT EXISTS idx_attendance_worker_id ON public.attendance(worker_id);
CREATE INDEX IF NOT EXISTS idx_attendance_chantier ON public.attendance(chantier);
CREATE INDEX IF NOT EXISTS idx_attendance_statut ON public.attendance(statut);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260525500000_overtime_workers.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Heures supplémentaires ouvriers — table overtime + FK workers
-- Exécuter après 20260525300000_workers_schema.sql

CREATE TABLE IF NOT EXISTS public.overtime (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id       UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  chantier        TEXT,
  heure_debut     TIME,
  heure_fin       TIME,
  nombre_heures   NUMERIC(8, 2) NOT NULL DEFAULT 0 CHECK (nombre_heures >= 0),
  taux_horaire    NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (taux_horaire >= 0),
  montant         NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (montant >= 0),
  motif           TEXT,
  statut          TEXT NOT NULL DEFAULT 'valide'
    CHECK (statut IN ('brouillon', 'valide', 'paye')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS overtime_updated_at ON public.overtime;
CREATE TRIGGER overtime_updated_at
  BEFORE UPDATE ON public.overtime
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_overtime_date ON public.overtime(date DESC);
CREATE INDEX IF NOT EXISTS idx_overtime_worker_id ON public.overtime(worker_id);
CREATE INDEX IF NOT EXISTS idx_overtime_chantier ON public.overtime(chantier);
CREATE INDEX IF NOT EXISTS idx_overtime_statut ON public.overtime(statut);

ALTER TABLE public.overtime ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS overtime_all_auth ON public.overtime;
CREATE POLICY overtime_all_auth ON public.overtime
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260525600000_payroll_workers_extend.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Paiement ouvriers — extension table payroll pour workers externes
-- Exécuter après 20260525300000_workers_schema.sql

ALTER TABLE public.payroll
  ADD COLUMN IF NOT EXISTS chantier TEXT,
  ADD COLUMN IF NOT EXISTS jours_travailles NUMERIC(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tarif_journalier NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tarif_heures_sup NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS montant_heures_sup NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avances NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retenues NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.payroll
  DROP CONSTRAINT IF EXISTS payroll_statut_check;

ALTER TABLE public.payroll
  ADD CONSTRAINT payroll_statut_check
  CHECK (statut IN ('Brouillon', 'Valide', 'En attente', 'Paye'));

CREATE INDEX IF NOT EXISTS idx_payroll_worker_id ON public.payroll(worker_id);
CREATE INDEX IF NOT EXISTS idx_payroll_chantier ON public.payroll(chantier);
CREATE INDEX IF NOT EXISTS idx_payroll_statut ON public.payroll(statut);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260525700000_prospects.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Prospects — module Commercial / Marketing
-- Coller ce fichier en entier dans Supabase SQL Editor

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.prospects (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type                 TEXT NOT NULL CHECK (type IN ('particulier', 'btob')),
  nom                  TEXT NOT NULL,
  prenom               TEXT,
  prenom_interlocuteur TEXT,
  nom_interlocuteur    TEXT,
  email                TEXT,
  telephone            TEXT,
  fonction             TEXT,
  secteur              TEXT,
  niveau_decisionnel   TEXT,
  type_projet          TEXT NOT NULL,
  source               TEXT,
  action               TEXT,
  commentaire          TEXT,
  statut               TEXT NOT NULL DEFAULT 'nouveau'
    CHECK (statut IN ('nouveau', 'en_cours', 'converti', 'perdu')),
  budget               NUMERIC(12, 2),
  ville                TEXT,
  date_contact         DATE,
  prochain_suivi       DATE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Colonnes si table créée partiellement
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS prenom_interlocuteur TEXT;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS nom_interlocuteur TEXT;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'nouveau';
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS budget NUMERIC(12, 2);
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS ville TEXT;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS date_contact DATE;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS prochain_suivi DATE;

ALTER TABLE public.prospects DROP CONSTRAINT IF EXISTS prospects_statut_check;
ALTER TABLE public.prospects
  ADD CONSTRAINT prospects_statut_check
  CHECK (statut IN ('nouveau', 'en_cours', 'converti', 'perdu'));

DROP TRIGGER IF EXISTS prospects_updated_at ON public.prospects;
CREATE TRIGGER prospects_updated_at
  BEFORE UPDATE ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_prospects_type ON public.prospects(type);
CREATE INDEX IF NOT EXISTS idx_prospects_statut ON public.prospects(statut);
CREATE INDEX IF NOT EXISTS idx_prospects_source ON public.prospects(source);
CREATE INDEX IF NOT EXISTS idx_prospects_ville ON public.prospects(ville);
CREATE INDEX IF NOT EXISTS idx_prospects_type_projet ON public.prospects(type_projet);
CREATE INDEX IF NOT EXISTS idx_prospects_date_contact ON public.prospects(date_contact DESC);
CREATE INDEX IF NOT EXISTS idx_prospects_created_at ON public.prospects(created_at DESC);

ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prospects_all_auth ON public.prospects;
CREATE POLICY prospects_all_auth ON public.prospects
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.prospects TO authenticated;
GRANT ALL ON public.prospects TO service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260525800000_devis.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Devis en attente — module Commercial / Marketing
-- Coller ce fichier en entier dans Supabase SQL Editor
-- Prérequis : table public.prospects (20260525700000_prospects.sql)

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.devis (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero          TEXT UNIQUE,
  prospect_id     UUID,
  type_projet     TEXT NOT NULL,
  source          TEXT NOT NULL,
  montant_estime  NUMERIC(12, 2),
  statut          TEXT NOT NULL DEFAULT 'en_attente',
  commentaire     TEXT,
  date_relance    DATE,
  assigne_id      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Colonnes si table créée partiellement
ALTER TABLE public.devis ADD COLUMN IF NOT EXISTS numero TEXT;
ALTER TABLE public.devis ADD COLUMN IF NOT EXISTS prospect_id UUID;
ALTER TABLE public.devis ADD COLUMN IF NOT EXISTS montant_estime NUMERIC(12, 2);
ALTER TABLE public.devis ADD COLUMN IF NOT EXISTS date_relance DATE;
ALTER TABLE public.devis ADD COLUMN IF NOT EXISTS assigne_id UUID;

ALTER TABLE public.devis DROP CONSTRAINT IF EXISTS devis_statut_check;
ALTER TABLE public.devis
  ADD CONSTRAINT devis_statut_check
  CHECK (statut IN ('en_attente', 'en_cours', 'realise', 'refuse'));

-- FK prospect_id → prospects (si table prospects existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'devis_prospect_id_fkey'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'prospects'
    ) THEN
      ALTER TABLE public.devis
        ADD CONSTRAINT devis_prospect_id_fkey
        FOREIGN KEY (prospect_id) REFERENCES public.prospects(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

DROP TRIGGER IF EXISTS devis_updated_at ON public.devis;
CREATE TRIGGER devis_updated_at
  BEFORE UPDATE ON public.devis
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_devis_prospect_id ON public.devis(prospect_id);
CREATE INDEX IF NOT EXISTS idx_devis_statut ON public.devis(statut);
CREATE INDEX IF NOT EXISTS idx_devis_type_projet ON public.devis(type_projet);
CREATE INDEX IF NOT EXISTS idx_devis_source ON public.devis(source);
CREATE INDEX IF NOT EXISTS idx_devis_montant ON public.devis(montant_estime);
CREATE INDEX IF NOT EXISTS idx_devis_date_relance ON public.devis(date_relance DESC);
CREATE INDEX IF NOT EXISTS idx_devis_created_at ON public.devis(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_devis_numero ON public.devis(numero);

ALTER TABLE public.devis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS devis_all_auth ON public.devis;
CREATE POLICY devis_all_auth ON public.devis
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.devis TO authenticated;
GRANT ALL ON public.devis TO service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260525900000_planning_commercial.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Planning commercial — rendez-vous (prevu + terrain)
-- Coller ce fichier en entier dans Supabase SQL Editor
-- Prérequis : public.prospects (20260525700000_prospects.sql)

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.planning_commercial (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rdv_type            TEXT NOT NULL DEFAULT 'prevu'
    CHECK (rdv_type IN ('prevu', 'rapide')),
  titre               TEXT NOT NULL,
  type_rdv            TEXT,
  date                DATE NOT NULL,
  heure               TIME,
  lieu                TEXT,
  prospect_id         UUID,
  type_projet         TEXT,
  secteur             TEXT,
  societe             TEXT,
  statut              TEXT NOT NULL DEFAULT 'planifie'
    CHECK (statut IN ('planifie', 'confirme', 'realise', 'annule', 'reporte')),
  priorite            TEXT NOT NULL DEFAULT 'normale'
    CHECK (priorite IN ('basse', 'normale', 'haute')),
  responsable         TEXT,
  assigne_id          UUID,
  notes               TEXT,
  actions_suivantes   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.planning_commercial ADD COLUMN IF NOT EXISTS rdv_type TEXT NOT NULL DEFAULT 'prevu';
ALTER TABLE public.planning_commercial ADD COLUMN IF NOT EXISTS type_rdv TEXT;
ALTER TABLE public.planning_commercial ADD COLUMN IF NOT EXISTS heure TIME;
ALTER TABLE public.planning_commercial ADD COLUMN IF NOT EXISTS type_projet TEXT;
ALTER TABLE public.planning_commercial ADD COLUMN IF NOT EXISTS secteur TEXT;
ALTER TABLE public.planning_commercial ADD COLUMN IF NOT EXISTS societe TEXT;
ALTER TABLE public.planning_commercial ADD COLUMN IF NOT EXISTS priorite TEXT NOT NULL DEFAULT 'normale';
ALTER TABLE public.planning_commercial ADD COLUMN IF NOT EXISTS responsable TEXT;
ALTER TABLE public.planning_commercial ADD COLUMN IF NOT EXISTS assigne_id UUID;
ALTER TABLE public.planning_commercial ADD COLUMN IF NOT EXISTS actions_suivantes TEXT;

ALTER TABLE public.planning_commercial DROP CONSTRAINT IF EXISTS planning_commercial_rdv_type_check;
ALTER TABLE public.planning_commercial
  ADD CONSTRAINT planning_commercial_rdv_type_check
  CHECK (rdv_type IN ('prevu', 'rapide'));

ALTER TABLE public.planning_commercial DROP CONSTRAINT IF EXISTS planning_commercial_statut_check;
ALTER TABLE public.planning_commercial
  ADD CONSTRAINT planning_commercial_statut_check
  CHECK (statut IN ('planifie', 'confirme', 'realise', 'annule', 'reporte'));

ALTER TABLE public.planning_commercial DROP CONSTRAINT IF EXISTS planning_commercial_priorite_check;
ALTER TABLE public.planning_commercial
  ADD CONSTRAINT planning_commercial_priorite_check
  CHECK (priorite IN ('basse', 'normale', 'haute'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'planning_commercial_prospect_id_fkey'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'prospects'
    ) THEN
      ALTER TABLE public.planning_commercial
        ADD CONSTRAINT planning_commercial_prospect_id_fkey
        FOREIGN KEY (prospect_id) REFERENCES public.prospects(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

DROP TRIGGER IF EXISTS planning_commercial_updated_at ON public.planning_commercial;
CREATE TRIGGER planning_commercial_updated_at
  BEFORE UPDATE ON public.planning_commercial
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_planning_commercial_date ON public.planning_commercial(date DESC);
CREATE INDEX IF NOT EXISTS idx_planning_commercial_statut ON public.planning_commercial(statut);
CREATE INDEX IF NOT EXISTS idx_planning_commercial_rdv_type ON public.planning_commercial(rdv_type);
CREATE INDEX IF NOT EXISTS idx_planning_commercial_prospect_id ON public.planning_commercial(prospect_id);
CREATE INDEX IF NOT EXISTS idx_planning_commercial_type_rdv ON public.planning_commercial(type_rdv);
CREATE INDEX IF NOT EXISTS idx_planning_commercial_responsable ON public.planning_commercial(responsable);
CREATE INDEX IF NOT EXISTS idx_planning_commercial_created_at ON public.planning_commercial(created_at DESC);

ALTER TABLE public.planning_commercial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS planning_commercial_all_auth ON public.planning_commercial;
CREATE POLICY planning_commercial_all_auth ON public.planning_commercial
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.planning_commercial TO authenticated;
GRANT ALL ON public.planning_commercial TO service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260525910000_actions_marketing.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Actions marketing / campagnes
-- Prérequis : aucun (table autonome)

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.actions_marketing (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titre           TEXT NOT NULL,
  type            TEXT NOT NULL,
  canal           TEXT NOT NULL DEFAULT 'meta',
  budget          NUMERIC(14, 2) NOT NULL DEFAULT 0,
  date_debut      DATE,
  date_fin        DATE,
  priorite        TEXT NOT NULL DEFAULT 'normale',
  statut          TEXT NOT NULL DEFAULT 'en_attente',
  description     TEXT,
  objectif        TEXT,
  responsable     TEXT,
  leads_generes   INTEGER NOT NULL DEFAULT 0,
  commentaire     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.actions_marketing ADD COLUMN IF NOT EXISTS date_fin DATE;
ALTER TABLE public.actions_marketing ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.actions_marketing ADD COLUMN IF NOT EXISTS objectif TEXT;
ALTER TABLE public.actions_marketing ADD COLUMN IF NOT EXISTS responsable TEXT;
ALTER TABLE public.actions_marketing ADD COLUMN IF NOT EXISTS leads_generes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.actions_marketing ADD COLUMN IF NOT EXISTS commentaire TEXT;

ALTER TABLE public.actions_marketing DROP CONSTRAINT IF EXISTS actions_marketing_canal_check;
ALTER TABLE public.actions_marketing
  ADD CONSTRAINT actions_marketing_canal_check
  CHECK (canal IN ('meta', 'google', 'tiktok', 'offline', 'email', 'autre'));

ALTER TABLE public.actions_marketing DROP CONSTRAINT IF EXISTS actions_marketing_priorite_check;
ALTER TABLE public.actions_marketing
  ADD CONSTRAINT actions_marketing_priorite_check
  CHECK (priorite IN ('haute', 'normale', 'basse'));

ALTER TABLE public.actions_marketing DROP CONSTRAINT IF EXISTS actions_marketing_statut_check;
ALTER TABLE public.actions_marketing
  ADD CONSTRAINT actions_marketing_statut_check
  CHECK (statut IN ('en_attente', 'en_cours', 'valide', 'termine', 'annule'));

DROP TRIGGER IF EXISTS actions_marketing_updated_at ON public.actions_marketing;
CREATE TRIGGER actions_marketing_updated_at
  BEFORE UPDATE ON public.actions_marketing
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_actions_marketing_statut ON public.actions_marketing(statut);
CREATE INDEX IF NOT EXISTS idx_actions_marketing_canal ON public.actions_marketing(canal);
CREATE INDEX IF NOT EXISTS idx_actions_marketing_type ON public.actions_marketing(type);
CREATE INDEX IF NOT EXISTS idx_actions_marketing_date_debut ON public.actions_marketing(date_debut DESC);
CREATE INDEX IF NOT EXISTS idx_actions_marketing_responsable ON public.actions_marketing(responsable);
CREATE INDEX IF NOT EXISTS idx_actions_marketing_created_at ON public.actions_marketing(created_at DESC);

ALTER TABLE public.actions_marketing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS actions_marketing_all_auth ON public.actions_marketing;
CREATE POLICY actions_marketing_all_auth ON public.actions_marketing
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.actions_marketing TO authenticated;
GRANT ALL ON public.actions_marketing TO service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260525920000_comptes_rendus.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Comptes rendus commerciaux (visites, RDV, réunions chantier)
-- Prérequis : public.prospects, public.planning_commercial (FK optionnelles)

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.comptes_rendus (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titre               TEXT,
  planning_rdv_id     UUID,
  prospect_id         UUID,
  date                DATE NOT NULL,
  resume              TEXT NOT NULL,
  decision            TEXT,
  prochaine_action    TEXT,
  responsable         TEXT,
  chantier_projet     TEXT,
  type_visite         TEXT,
  besoins_client      TEXT,
  problemes_detectes  TEXT,
  statut_suivi        TEXT NOT NULL DEFAULT 'en_attente',
  documents_url       TEXT,
  assigne_id          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.comptes_rendus ADD COLUMN IF NOT EXISTS titre TEXT;
ALTER TABLE public.comptes_rendus ADD COLUMN IF NOT EXISTS planning_rdv_id UUID;
ALTER TABLE public.comptes_rendus ADD COLUMN IF NOT EXISTS responsable TEXT;
ALTER TABLE public.comptes_rendus ADD COLUMN IF NOT EXISTS chantier_projet TEXT;
ALTER TABLE public.comptes_rendus ADD COLUMN IF NOT EXISTS type_visite TEXT;
ALTER TABLE public.comptes_rendus ADD COLUMN IF NOT EXISTS besoins_client TEXT;
ALTER TABLE public.comptes_rendus ADD COLUMN IF NOT EXISTS problemes_detectes TEXT;
ALTER TABLE public.comptes_rendus ADD COLUMN IF NOT EXISTS statut_suivi TEXT NOT NULL DEFAULT 'en_attente';
ALTER TABLE public.comptes_rendus ADD COLUMN IF NOT EXISTS documents_url TEXT;
ALTER TABLE public.comptes_rendus ADD COLUMN IF NOT EXISTS assigne_id UUID;

ALTER TABLE public.comptes_rendus DROP CONSTRAINT IF EXISTS comptes_rendus_statut_suivi_check;
ALTER TABLE public.comptes_rendus
  ADD CONSTRAINT comptes_rendus_statut_suivi_check
  CHECK (statut_suivi IN ('en_attente', 'en_cours', 'cloture'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comptes_rendus_prospect_id_fkey'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'prospects'
    ) THEN
      ALTER TABLE public.comptes_rendus
        ADD CONSTRAINT comptes_rendus_prospect_id_fkey
        FOREIGN KEY (prospect_id) REFERENCES public.prospects(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comptes_rendus_planning_rdv_id_fkey'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'planning_commercial'
    ) THEN
      ALTER TABLE public.comptes_rendus
        ADD CONSTRAINT comptes_rendus_planning_rdv_id_fkey
        FOREIGN KEY (planning_rdv_id) REFERENCES public.planning_commercial(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

DROP TRIGGER IF EXISTS comptes_rendus_updated_at ON public.comptes_rendus;
CREATE TRIGGER comptes_rendus_updated_at
  BEFORE UPDATE ON public.comptes_rendus
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_comptes_rendus_date ON public.comptes_rendus(date DESC);
CREATE INDEX IF NOT EXISTS idx_comptes_rendus_prospect_id ON public.comptes_rendus(prospect_id);
CREATE INDEX IF NOT EXISTS idx_comptes_rendus_planning_rdv_id ON public.comptes_rendus(planning_rdv_id);
CREATE INDEX IF NOT EXISTS idx_comptes_rendus_responsable ON public.comptes_rendus(responsable);
CREATE INDEX IF NOT EXISTS idx_comptes_rendus_statut_suivi ON public.comptes_rendus(statut_suivi);
CREATE INDEX IF NOT EXISTS idx_comptes_rendus_chantier_projet ON public.comptes_rendus(chantier_projet);
CREATE INDEX IF NOT EXISTS idx_comptes_rendus_created_at ON public.comptes_rendus(created_at DESC);

ALTER TABLE public.comptes_rendus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comptes_rendus_all_auth ON public.comptes_rendus;
CREATE POLICY comptes_rendus_all_auth ON public.comptes_rendus
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.comptes_rendus TO authenticated;
GRANT ALL ON public.comptes_rendus TO service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260525930000_depenses.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Dépenses commerciales / marketing
-- Prérequis : aucun (table autonome)

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.depenses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intitule            TEXT NOT NULL,
  type                TEXT NOT NULL DEFAULT 'marketing',
  montant             NUMERIC(14, 2) NOT NULL DEFAULT 0,
  date                DATE NOT NULL,
  reference           TEXT,
  commentaire         TEXT,
  fournisseur         TEXT,
  projet_campagne     TEXT,
  responsable         TEXT,
  mode_paiement       TEXT,
  justificatif_url    TEXT,
  statut_validation   TEXT NOT NULL DEFAULT 'en_attente',
  reference_id        UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.depenses ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE public.depenses ADD COLUMN IF NOT EXISTS fournisseur TEXT;
ALTER TABLE public.depenses ADD COLUMN IF NOT EXISTS projet_campagne TEXT;
ALTER TABLE public.depenses ADD COLUMN IF NOT EXISTS responsable TEXT;
ALTER TABLE public.depenses ADD COLUMN IF NOT EXISTS mode_paiement TEXT;
ALTER TABLE public.depenses ADD COLUMN IF NOT EXISTS justificatif_url TEXT;
ALTER TABLE public.depenses ADD COLUMN IF NOT EXISTS statut_validation TEXT NOT NULL DEFAULT 'en_attente';
ALTER TABLE public.depenses ADD COLUMN IF NOT EXISTS reference_id UUID;

ALTER TABLE public.depenses DROP CONSTRAINT IF EXISTS depenses_type_check;
ALTER TABLE public.depenses
  ADD CONSTRAINT depenses_type_check
  CHECK (type IN ('marketing', 'commercial', 'evenement', 'deplacement', 'materiel', 'autre'));

ALTER TABLE public.depenses DROP CONSTRAINT IF EXISTS depenses_statut_validation_check;
ALTER TABLE public.depenses
  ADD CONSTRAINT depenses_statut_validation_check
  CHECK (statut_validation IN ('en_attente', 'valide', 'refuse'));

DROP TRIGGER IF EXISTS depenses_updated_at ON public.depenses;
CREATE TRIGGER depenses_updated_at
  BEFORE UPDATE ON public.depenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_depenses_type ON public.depenses(type);
CREATE INDEX IF NOT EXISTS idx_depenses_date ON public.depenses(date DESC);
CREATE INDEX IF NOT EXISTS idx_depenses_responsable ON public.depenses(responsable);
CREATE INDEX IF NOT EXISTS idx_depenses_projet_campagne ON public.depenses(projet_campagne);
CREATE INDEX IF NOT EXISTS idx_depenses_statut_validation ON public.depenses(statut_validation);
CREATE INDEX IF NOT EXISTS idx_depenses_created_at ON public.depenses(created_at DESC);

ALTER TABLE public.depenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS depenses_all_auth ON public.depenses;
CREATE POLICY depenses_all_auth ON public.depenses
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.depenses TO authenticated;
GRANT ALL ON public.depenses TO service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260525940000_propositions_marketing.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Propositions marketing / commerciales
-- Prérequis : public.prospects (FK optionnelle)

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.propositions_marketing (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titre           TEXT NOT NULL,
  prospect_id     UUID,
  type_projet     TEXT,
  objectif        TEXT,
  description     TEXT,
  budget_estime   NUMERIC(14, 2) NOT NULL DEFAULT 0,
  statut          TEXT NOT NULL DEFAULT 'brouillon',
  responsable     TEXT,
  commentaire     TEXT,
  date_envoi      DATE,
  date_relance    DATE,
  document_url    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.propositions_marketing ADD COLUMN IF NOT EXISTS type_projet TEXT;
ALTER TABLE public.propositions_marketing ADD COLUMN IF NOT EXISTS responsable TEXT;
ALTER TABLE public.propositions_marketing ADD COLUMN IF NOT EXISTS commentaire TEXT;
ALTER TABLE public.propositions_marketing ADD COLUMN IF NOT EXISTS date_envoi DATE;
ALTER TABLE public.propositions_marketing ADD COLUMN IF NOT EXISTS date_relance DATE;
ALTER TABLE public.propositions_marketing ADD COLUMN IF NOT EXISTS document_url TEXT;

ALTER TABLE public.propositions_marketing DROP CONSTRAINT IF EXISTS propositions_marketing_statut_check;
ALTER TABLE public.propositions_marketing
  ADD CONSTRAINT propositions_marketing_statut_check
  CHECK (statut IN ('brouillon', 'envoye', 'valide', 'refuse', 'en_revision'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'propositions_marketing_prospect_id_fkey'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'prospects'
    ) THEN
      ALTER TABLE public.propositions_marketing
        ADD CONSTRAINT propositions_marketing_prospect_id_fkey
        FOREIGN KEY (prospect_id) REFERENCES public.prospects(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

DROP TRIGGER IF EXISTS propositions_marketing_updated_at ON public.propositions_marketing;
CREATE TRIGGER propositions_marketing_updated_at
  BEFORE UPDATE ON public.propositions_marketing
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_propositions_marketing_statut ON public.propositions_marketing(statut);
CREATE INDEX IF NOT EXISTS idx_propositions_marketing_prospect_id ON public.propositions_marketing(prospect_id);
CREATE INDEX IF NOT EXISTS idx_propositions_marketing_type_projet ON public.propositions_marketing(type_projet);
CREATE INDEX IF NOT EXISTS idx_propositions_marketing_responsable ON public.propositions_marketing(responsable);
CREATE INDEX IF NOT EXISTS idx_propositions_marketing_date_envoi ON public.propositions_marketing(date_envoi DESC);
CREATE INDEX IF NOT EXISTS idx_propositions_marketing_date_relance ON public.propositions_marketing(date_relance DESC);
CREATE INDEX IF NOT EXISTS idx_propositions_marketing_created_at ON public.propositions_marketing(created_at DESC);

ALTER TABLE public.propositions_marketing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS propositions_marketing_all_auth ON public.propositions_marketing;
CREATE POLICY propositions_marketing_all_auth ON public.propositions_marketing
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.propositions_marketing TO authenticated;
GRANT ALL ON public.propositions_marketing TO service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260525940100_propositions_marketing_fields.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Propositions marketing — champs dédiés (marque/compte, type proposition)
-- À exécuter après 20260525940000_propositions_marketing.sql

ALTER TABLE public.propositions_marketing ADD COLUMN IF NOT EXISTS marque_compte TEXT;
ALTER TABLE public.propositions_marketing ADD COLUMN IF NOT EXISTS type_proposition TEXT;

CREATE INDEX IF NOT EXISTS idx_propositions_marketing_marque_compte ON public.propositions_marketing(marque_compte);
CREATE INDEX IF NOT EXISTS idx_propositions_marketing_type_proposition ON public.propositions_marketing(type_proposition);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260526000000_clients.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- CRM Clients
-- Seed CITYMO uniquement si la table est vide

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.clients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom         TEXT NOT NULL,
  prenom      TEXT,
  email       TEXT,
  telephone   TEXT,
  ice         TEXT,
  responsable TEXT,
  adresse     TEXT,
  ville       TEXT,
  secteur     TEXT,
  statut      TEXT NOT NULL DEFAULT 'actif',
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS prenom TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS ice TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS responsable TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS adresse TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS secteur TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_statut_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_statut_check
  CHECK (statut IN ('actif', 'en_attente', 'important', 'archive'));

DROP TRIGGER IF EXISTS clients_updated_at ON public.clients;
CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_clients_nom ON public.clients(nom);
CREATE INDEX IF NOT EXISTS idx_clients_statut ON public.clients(statut);
CREATE INDEX IF NOT EXISTS idx_clients_responsable ON public.clients(responsable);
CREATE INDEX IF NOT EXISTS idx_clients_ville ON public.clients(ville);
CREATE INDEX IF NOT EXISTS idx_clients_ice ON public.clients(ice);
CREATE INDEX IF NOT EXISTS idx_clients_email ON public.clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_created_at ON public.clients(created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_nom_unique ON public.clients (lower(trim(nom)));
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_ice_unique
  ON public.clients (ice) WHERE ice IS NOT NULL AND trim(ice) <> '';

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clients_all_auth ON public.clients;
CREATE POLICY clients_all_auth ON public.clients
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;

-- Données initiales CITYMO (si table vide)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clients LIMIT 1) THEN
    INSERT INTO public.clients (nom, email, telephone, ice, responsable, statut) VALUES
      ('YOUNESS LARHOUILIE', NULL, NULL, NULL, NULL, 'actif'),
      ('SONASID', NULL, NULL, NULL, 'ANASS DEBBAGH', 'actif'),
      ('Mr GUESSOUS', NULL, NULL, NULL, NULL, 'actif'),
      ('Mr SALIM HOMRI', NULL, NULL, NULL, NULL, 'actif'),
      ('Mr/Mme BENSOUDA', NULL, NULL, NULL, NULL, 'actif'),
      ('UNIVERS MOTORS', NULL, NULL, NULL, NULL, 'actif'),
      ('WYCON', NULL, NULL, NULL, 'Mr Redouane Zaim', 'actif'),
      ('LOGIC TRANSPORT', 'logic-transport@hotmail.com', '05 22 51 08 84', '001527221000024', NULL, 'actif'),
      ('MGM FOOD', NULL, NULL, '003269698000085', 'Mme Sanaa Mamoumi', 'actif'),
      ('GLOBAL EXPRESS COURRIER (GLOBEX)', 'm.akkous@globexfedex.com', NULL, '001526968000065', 'Mme Milouda Akkous', 'actif'),
      ('DREAM DONUTS AND COFFEE', 'mohamed.m@mgmfoods.ma', NULL, '002552365000086', 'Mr Mohamed Mamoumi', 'actif'),
      ('CHIC CORNER', 'redouane.zaim@chic-corner.ma', NULL, '003519402000062', 'Mr Redouane Zaim', 'actif'),
      ('RASMAL GESTION', NULL, NULL, '003427396000054', 'Mr Redouane Zaim', 'actif'),
      ('SHOPAL', NULL, NULL, '003628971000005', 'Mr Redouane Zaim', 'actif'),
      ('AKOR FOOD', 'contact@baristas.ma', NULL, '000089197000094', 'Mr Madrouh Mohammed', 'actif'),
      ('MED AFRICA LOGISTICS', 'contact@medafrica-log.com', '05 20 41 20 19', '000230731000088', 'Mr Zouhair Amoudi', 'actif'),
      ('ESSILOR LUXOTTICA MAROC', 'fatimazahra.erraoui@ma.essilor.com', NULL, '000029532000073', 'Mr David Dias', 'actif');
  END IF;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260526010000_categories.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- CRM Catégories articles
-- Champs : id, nom, parent_id, slug, created_at, updated_at
-- Seed CITYMO idempotent (ON CONFLICT slug DO NOTHING)

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom        TEXT NOT NULL,
  parent_id  UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  slug       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT categories_slug_unique UNIQUE (slug)
);

ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS categories_updated_at ON public.categories;
CREATE TRIGGER categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_categories_nom ON public.categories(nom);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON public.categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_created_at ON public.categories(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_nom_lower_unique ON public.categories (lower(trim(nom)));

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS categories_all_auth ON public.categories;
CREATE POLICY categories_all_auth ON public.categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;

-- ── Niveau 1 : catégories racines CITYMO ──
INSERT INTO public.categories (nom, parent_id, slug) VALUES
  ('Gros oeuvre', NULL, 'gros-oeuvre'),
  ('Second oeuvre', NULL, 'second-oeuvre'),
  ('Finitions', NULL, 'finitions'),
  ('Equipements techniques', NULL, 'equipements-techniques'),
  ('Demolition et preparation chantier', NULL, 'demolition-preparation'),
  ('Securite et videosurveillance', NULL, 'securite-videosurveillance')
ON CONFLICT (slug) DO NOTHING;

-- ── Niveau 2 : sous-catégories CITYMO ──
INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Maconnerie et structure', c.id, 'maconnerie-structure'
FROM public.categories c WHERE c.slug = 'gros-oeuvre'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Plomberie', c.id, 'plomberie'
FROM public.categories c WHERE c.slug = 'second-oeuvre'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Electricite', c.id, 'electricite'
FROM public.categories c WHERE c.slug = 'second-oeuvre'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Platrerie et plafonds BA13', c.id, 'platrerie-plafonds-ba13'
FROM public.categories c WHERE c.slug = 'second-oeuvre'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Menuiserie aluminium', c.id, 'menuiserie-aluminium'
FROM public.categories c WHERE c.slug = 'second-oeuvre'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Sanitaires', c.id, 'sanitaires'
FROM public.categories c WHERE c.slug = 'second-oeuvre'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Cloisons vitrees', c.id, 'cloisons-vitrees'
FROM public.categories c WHERE c.slug = 'second-oeuvre'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Carrelage', c.id, 'carrelage'
FROM public.categories c WHERE c.slug = 'finitions'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Parquet et revetements sol', c.id, 'parquet-revetements-sol'
FROM public.categories c WHERE c.slug = 'finitions'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Marbre et pierre', c.id, 'marbre-pierre'
FROM public.categories c WHERE c.slug = 'finitions'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Peinture et papier peint', c.id, 'peinture-papier-peint'
FROM public.categories c WHERE c.slug = 'finitions'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Faux plafonds Armstrong', c.id, 'faux-plafonds-armstrong'
FROM public.categories c WHERE c.slug = 'finitions'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Enduits et talochage', c.id, 'enduits-talochage'
FROM public.categories c WHERE c.slug = 'finitions'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Climatisation', c.id, 'climatisation'
FROM public.categories c WHERE c.slug = 'equipements-techniques'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Eclairage LED', c.id, 'eclairage-led'
FROM public.categories c WHERE c.slug = 'equipements-techniques'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Depose et demolition', c.id, 'depose-demolition'
FROM public.categories c WHERE c.slug = 'demolition-preparation'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Nettoyage chantier', c.id, 'nettoyage-chantier'
FROM public.categories c WHERE c.slug = 'demolition-preparation'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Videosurveillance HIKVISION', c.id, 'videosurveillance-hikvision'
FROM public.categories c WHERE c.slug = 'securite-videosurveillance'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Controle d''acces', c.id, 'controle-acces'
FROM public.categories c WHERE c.slug = 'securite-videosurveillance'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (nom, parent_id, slug)
SELECT 'Reseau informatique', c.id, 'reseau-informatique'
FROM public.categories c WHERE c.slug = 'securite-videosurveillance'
ON CONFLICT (slug) DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260526020000_articles.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- CRM Articles
-- Champs : id, nom, prix, unite, remise, statut, categorie_id, created_at, updated_at
-- Seed CITYMO idempotent (ON CONFLICT nom DO NOTHING)

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.articles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom          TEXT NOT NULL,
  prix         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  unite        TEXT NOT NULL DEFAULT 'unite',
  remise       NUMERIC(5, 2) NOT NULL DEFAULT 0,
  statut       TEXT NOT NULL DEFAULT 'actif',
  categorie_id UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT articles_nom_unique UNIQUE (nom)
);

ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS remise NUMERIC(5, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'actif';
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS categorie_id UUID;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.articles DROP CONSTRAINT IF EXISTS articles_statut_check;
ALTER TABLE public.articles
  ADD CONSTRAINT articles_statut_check
  CHECK (statut IN ('actif', 'inactif', 'archive'));

DROP TRIGGER IF EXISTS articles_updated_at ON public.articles;
CREATE TRIGGER articles_updated_at
  BEFORE UPDATE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_articles_nom ON public.articles(nom);
CREATE INDEX IF NOT EXISTS idx_articles_statut ON public.articles(statut);
CREATE INDEX IF NOT EXISTS idx_articles_categorie_id ON public.articles(categorie_id);
CREATE INDEX IF NOT EXISTS idx_articles_created_at ON public.articles(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_nom_lower_unique ON public.articles (lower(trim(nom)));

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS articles_all_auth ON public.articles;
CREATE POLICY articles_all_auth ON public.articles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.articles TO authenticated;
GRANT ALL ON public.articles TO service_role;

-- Données initiales CITYMO
INSERT INTO public.articles (nom, prix, unite, remise, statut) VALUES
  ('Installation électrique', 250, 'm2', 0, 'actif'),
  ('Installation plomberie', 250, 'm2', 0, 'actif'),
  ('Clapet de Zoning gainable', 1500, 'unite', 0, 'actif'),
  ('Panels Led Encastré 60*60', 400, 'unite', 0, 'actif'),
  ('Lavabo de Salle de Bain', 2000, 'unite', 0, 'actif'),
  ('Toilette Suspendue pour Salle de bain', 4500, 'unite', 0, 'actif'),
  ('Plinthe en Carrelage', 120, 'ml', 0, 'actif'),
  ('Dalle Post tension', 2500, 'm2', 0, 'actif'),
  ('Réajustement Dalle plancher haut 4ème', 52600, 'unite', 0, 'actif'),
  ('Garde corps métallique escalier', 1000, 'ml', 0, 'actif'),
  ('Article exceptionnel', 1, 'unite', 0, 'actif'),
  ('Panels Led 60*60', 4, 'ml', 0, 'actif'),
  ('Terminale de contrôle d''accès HIKVISION', 4500, 'unite', 0, 'actif'),
  ('Installation et mise en marche', 12000, 'unite', 0, 'actif'),
  ('Câblage Catg 6 UTP', 6, 'unite', 0, 'actif'),
  ('Switch Smart Poe 16 port Fast Ethernet', 2300, 'unite', 0, 'actif'),
  ('HDD 6To', 3760, 'unite', 0, 'actif'),
  ('NVR 64 Voix HIKVISION 8 SATA', 11000, 'unite', 0, 'actif'),
  ('Caméras 6MP HIK VISION', 1190, 'unite', 0, 'actif'),
  ('Talochage Industriel', 120, 'm2', 0, 'actif'),
  ('Enduit au mortier', 200, 'm2', 0, 'actif'),
  ('Armstrong T15 Fine Line', 250, 'm2', 0, 'actif'),
  ('Revêtement en Marbre PERLATINO 30×60', 800, 'm2', 0, 'actif'),
  ('Plinthe Parquet Contrecollé', 110, 'ml', 0, 'actif'),
  ('Plinthe Parquet Stratifié', 90, 'ml', 0, 'actif'),
  ('Plinthe Parquet Massif', 120, 'ml', 0, 'actif'),
  ('Revêtement en Parquet Contrecollé', 1100, 'm2', 0, 'actif'),
  ('Revêtement en Parquet Stratifié', 450, 'm2', 0, 'actif'),
  ('Revêtement en Parquet Massif', 1200, 'm2', 0, 'actif'),
  ('Dépose Sanitaires existantes', 140, 'unite', 0, 'actif'),
  ('Décapage Plafond et évacuation', 60, 'm2', 0, 'actif'),
  ('Démolition Mur en Briques et évacuation', 60, 'm2', 0, 'actif'),
  ('Dépose des Fenêtres', 120, 'unite', 0, 'actif'),
  ('Décapage du Revêtement Mural', 40, 'm2', 0, 'actif'),
  ('Décapage du Revêtement de Sol', 35, 'm2', 0, 'actif'),
  ('Nettoyage Chantier', 40, 'm2', 0, 'actif'),
  ('Climatiseur Gainable Inverter 24000 BTU', 31000, 'unite', 0, 'actif'),
  ('Climatiseur Gainable Inverter 36000 BTU', 38000, 'unite', 0, 'actif'),
  ('Climatiseur Mural Split 12000', 6700, 'unite', 0, 'actif'),
  ('Climatiseur Mural Split 9000', 6000, 'unite', 0, 'actif'),
  ('Réalisation Mur d''acrotère', 600, 'm', 0, 'actif'),
  ('Réalisation Mur de Clôture', 600, 'm2', 0, 'actif'),
  ('Réalisation Escalier en Béton Armé', 0, 'm3', 0, 'actif'),
  ('Mur en Brique de 20cm', 450, 'm2', 0, 'actif'),
  ('Mur en Brique de 15cm', 400, 'm2', 0, 'actif'),
  ('Mur en Brique de 7cm', 350, 'm2', 0, 'actif'),
  ('Fenêtre Oscillo-Battant en Aluminium', 2500, 'unite', 0, 'actif'),
  ('Cloison Vitrée en Verre Trempé', 2200, 'm2', 0, 'actif'),
  ('Porte en Aluminium', 3500, 'unite', 0, 'actif'),
  ('Cloison Chassis Fixe en Aluminium Série 8000', 2000, 'm2', 0, 'actif'),
  ('Fenêtre Coulissante en Aluminium Série 9000', 2000, 'm2', 0, 'actif'),
  ('Fourniture et Pose Papier Peint', 400, 'm2', 0, 'actif'),
  ('Fourniture Revêtement Carrelage 30×30', 300, 'm2', 0, 'actif'),
  ('Fourniture Revêtement Carrelage 30×60', 350, 'm2', 0, 'actif'),
  ('Fourniture Revêtement Carrelage 60×60', 350, 'm2', 0, 'actif'),
  ('Fourniture Revêtement Carrelage 120×60', 450, 'm2', 0, 'actif'),
  ('Pose Revêtement Carrelage 60×60 Mural', 230, 'm2', 0, 'actif'),
  ('Pose Revêtement Carrelage 30×60 Mural', 230, 'm2', 0, 'actif'),
  ('Pose Revêtement carrelage 120×60 Mural', 230, 'm2', 0, 'actif'),
  ('Pose Revêtement Carrelage 30×60 Sol', 200, 'm2', 0, 'actif'),
  ('Pose Revêtement Carrelage 60×30 Mural', 230, 'm2', 0, 'actif'),
  ('Pose Revêtement Carrelage 30×30 Sol', 200, 'm2', 0, 'actif'),
  ('Pose Revêtement Carrelage 60×60 Sol', 200, 'm2', 0, 'actif'),
  ('Pose Revêtement Carrelage 120×60 Sol', 200, 'm2', 0, 'actif'),
  ('Cloison BA13 Double Face Standard', 420, 'm2', 0, 'actif'),
  ('Cloison BA13 Double Face Hydrophobe', 400, 'm2', 0, 'actif'),
  ('Joint Creux BA13 LED', 200, 'm', 0, 'actif'),
  ('Joint Creux BA13 10/15/10', 160, 'ml', 0, 'actif'),
  ('Joint Creux BA13 5/15/10', 150, 'ml', 0, 'actif'),
  ('Plafond BA13 Hydrophobe', 320, 'm2', 0, 'actif'),
  ('Plafond BA13 Standard', 320, 'm2', 0, 'actif'),
  ('Cloison BA13 Hydrophobe', 350, 'm2', 0, 'actif'),
  ('Cloison BA13 Standard', 320, 'm2', 0, 'actif')
ON CONFLICT (nom) DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260526021000_articles_categories_link.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Liaison articles ↔ categories
-- Ajoute FK si la colonne existe sans contrainte (idempotent)

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS categorie_id UUID;

CREATE INDEX IF NOT EXISTS idx_articles_categorie_id ON public.articles(categorie_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'articles_categorie_id_fkey'
      AND conrelid = 'public.articles'::regclass
  ) THEN
    ALTER TABLE public.articles
      ADD CONSTRAINT articles_categorie_id_fkey
      FOREIGN KEY (categorie_id)
      REFERENCES public.categories(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260526030000_crm_devis.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- CRM Devis (module CRM — distinct de public.devis commercial/prospects)
-- Tables : crm_devis, crm_devis_lignes

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.crm_devis (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference           TEXT NOT NULL,
  titre               TEXT NOT NULL,
  statut              TEXT NOT NULL DEFAULT 'brouillon',
  date_creation       DATE NOT NULL DEFAULT CURRENT_DATE,
  date_validite       DATE,
  commercial          TEXT,
  type_projet         TEXT,
  client_id           UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  modalites_paiement  TEXT,
  conditions          TEXT,
  notes_internes      TEXT,
  total_ht            NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_tva           NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_ttc           NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_devis_reference_unique UNIQUE (reference)
);

ALTER TABLE public.crm_devis ADD COLUMN IF NOT EXISTS commercial TEXT;
ALTER TABLE public.crm_devis ADD COLUMN IF NOT EXISTS modalites_paiement TEXT;
ALTER TABLE public.crm_devis ADD COLUMN IF NOT EXISTS conditions TEXT;
ALTER TABLE public.crm_devis ADD COLUMN IF NOT EXISTS notes_internes TEXT;
ALTER TABLE public.crm_devis ADD COLUMN IF NOT EXISTS total_ht NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.crm_devis ADD COLUMN IF NOT EXISTS total_tva NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.crm_devis ADD COLUMN IF NOT EXISTS total_ttc NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.crm_devis DROP CONSTRAINT IF EXISTS crm_devis_statut_check;
ALTER TABLE public.crm_devis
  ADD CONSTRAINT crm_devis_statut_check
  CHECK (statut IN ('brouillon', 'envoye', 'valide', 'refuse', 'expire', 'en_attente'));

DROP TRIGGER IF EXISTS crm_devis_updated_at ON public.crm_devis;
CREATE TRIGGER crm_devis_updated_at
  BEFORE UPDATE ON public.crm_devis
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_crm_devis_client_id ON public.crm_devis(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_devis_statut ON public.crm_devis(statut);
CREATE INDEX IF NOT EXISTS idx_crm_devis_reference ON public.crm_devis(reference);
CREATE INDEX IF NOT EXISTS idx_crm_devis_date_creation ON public.crm_devis(date_creation DESC);
CREATE INDEX IF NOT EXISTS idx_crm_devis_created_at ON public.crm_devis(created_at DESC);

CREATE TABLE IF NOT EXISTS public.crm_devis_lignes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_id      UUID NOT NULL REFERENCES public.crm_devis(id) ON DELETE CASCADE,
  ordre         INTEGER NOT NULL DEFAULT 0,
  type          TEXT NOT NULL DEFAULT 'article',
  designation   TEXT,
  description   TEXT,
  article_id    UUID REFERENCES public.articles(id) ON DELETE SET NULL,
  categorie_id  UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  quantite      NUMERIC(12, 3) NOT NULL DEFAULT 1,
  unite         TEXT NOT NULL DEFAULT 'unite',
  prix_ht       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  remise        NUMERIC(5, 2) NOT NULL DEFAULT 0,
  tva           NUMERIC(5, 2) NOT NULL DEFAULT 20,
  total_ht      NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.crm_devis_lignes ADD COLUMN IF NOT EXISTS ordre INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.crm_devis_lignes ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'article';
ALTER TABLE public.crm_devis_lignes ADD COLUMN IF NOT EXISTS total_ht NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.crm_devis_lignes DROP CONSTRAINT IF EXISTS crm_devis_lignes_type_check;
ALTER TABLE public.crm_devis_lignes
  ADD CONSTRAINT crm_devis_lignes_type_check
  CHECK (type IN ('article', 'titre', 'sous_titre', 'note'));

DROP TRIGGER IF EXISTS crm_devis_lignes_updated_at ON public.crm_devis_lignes;
CREATE TRIGGER crm_devis_lignes_updated_at
  BEFORE UPDATE ON public.crm_devis_lignes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_crm_devis_lignes_devis_id ON public.crm_devis_lignes(devis_id);
CREATE INDEX IF NOT EXISTS idx_crm_devis_lignes_article_id ON public.crm_devis_lignes(article_id);
CREATE INDEX IF NOT EXISTS idx_crm_devis_lignes_categorie_id ON public.crm_devis_lignes(categorie_id);
CREATE INDEX IF NOT EXISTS idx_crm_devis_lignes_ordre ON public.crm_devis_lignes(devis_id, ordre);

ALTER TABLE public.crm_devis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_devis_lignes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_devis_all_auth ON public.crm_devis;
CREATE POLICY crm_devis_all_auth ON public.crm_devis
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS crm_devis_lignes_all_auth ON public.crm_devis_lignes;
CREATE POLICY crm_devis_lignes_all_auth ON public.crm_devis_lignes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.crm_devis TO authenticated;
GRANT ALL ON public.crm_devis TO service_role;
GRANT ALL ON public.crm_devis_lignes TO authenticated;
GRANT ALL ON public.crm_devis_lignes TO service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260526040000_factures.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- CRM Factures (module CRM — tables crm_factures / crm_facture_lignes)
-- devis_id → crm_devis (devis CRM)

CREATE TABLE IF NOT EXISTS public.crm_factures (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero              TEXT NOT NULL,
  titre               TEXT NOT NULL,
  statut              TEXT NOT NULL DEFAULT 'brouillon',
  date_emission       DATE NOT NULL DEFAULT CURRENT_DATE,
  date_echeance       DATE,
  commercial          TEXT,
  type_projet         TEXT,
  client_id           UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  devis_id            UUID REFERENCES public.crm_devis(id) ON DELETE SET NULL,
  modalites_paiement  TEXT,
  conditions          TEXT,
  notes_internes      TEXT,
  acompte_montant     NUMERIC(14, 2) NOT NULL DEFAULT 0,
  acompte_type        TEXT NOT NULL DEFAULT 'fixe',
  total_ht            NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_tva           NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_ttc           NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_paye          NUMERIC(14, 2) NOT NULL DEFAULT 0,
  reste_a_payer       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_factures_numero_unique UNIQUE (numero)
);

ALTER TABLE public.crm_factures ADD COLUMN IF NOT EXISTS devis_id UUID REFERENCES public.crm_devis(id) ON DELETE SET NULL;
ALTER TABLE public.crm_factures ADD COLUMN IF NOT EXISTS acompte_montant NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.crm_factures ADD COLUMN IF NOT EXISTS acompte_type TEXT NOT NULL DEFAULT 'fixe';
ALTER TABLE public.crm_factures ADD COLUMN IF NOT EXISTS total_paye NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.crm_factures ADD COLUMN IF NOT EXISTS reste_a_payer NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.crm_factures DROP CONSTRAINT IF EXISTS crm_factures_statut_check;
ALTER TABLE public.crm_factures
  ADD CONSTRAINT crm_factures_statut_check
  CHECK (statut IN (
    'brouillon', 'envoyee', 'payee', 'partiellement_payee',
    'impayee', 'en_retard', 'annulee'
  ));

ALTER TABLE public.crm_factures DROP CONSTRAINT IF EXISTS crm_factures_acompte_type_check;
ALTER TABLE public.crm_factures
  ADD CONSTRAINT crm_factures_acompte_type_check
  CHECK (acompte_type IN ('fixe', 'pct'));

DROP TRIGGER IF EXISTS crm_factures_updated_at ON public.crm_factures;
CREATE TRIGGER crm_factures_updated_at
  BEFORE UPDATE ON public.crm_factures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_crm_factures_client_id ON public.crm_factures(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_factures_devis_id ON public.crm_factures(devis_id);
CREATE INDEX IF NOT EXISTS idx_crm_factures_statut ON public.crm_factures(statut);
CREATE INDEX IF NOT EXISTS idx_crm_factures_numero ON public.crm_factures(numero);
CREATE INDEX IF NOT EXISTS idx_crm_factures_date_emission ON public.crm_factures(date_emission DESC);
CREATE INDEX IF NOT EXISTS idx_crm_factures_total_ttc ON public.crm_factures(total_ttc);
CREATE INDEX IF NOT EXISTS idx_crm_factures_created_at ON public.crm_factures(created_at DESC);

CREATE TABLE IF NOT EXISTS public.crm_facture_lignes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id    UUID NOT NULL REFERENCES public.crm_factures(id) ON DELETE CASCADE,
  ordre         INTEGER NOT NULL DEFAULT 0,
  type          TEXT NOT NULL DEFAULT 'article',
  designation   TEXT,
  description   TEXT,
  article_id    UUID REFERENCES public.articles(id) ON DELETE SET NULL,
  categorie_id  UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  quantite      NUMERIC(12, 3) NOT NULL DEFAULT 1,
  unite         TEXT NOT NULL DEFAULT 'unite',
  prix_ht       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  remise        NUMERIC(5, 2) NOT NULL DEFAULT 0,
  tva           NUMERIC(5, 2) NOT NULL DEFAULT 20,
  total_ht      NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.crm_facture_lignes DROP CONSTRAINT IF EXISTS crm_facture_lignes_type_check;
ALTER TABLE public.crm_facture_lignes
  ADD CONSTRAINT crm_facture_lignes_type_check
  CHECK (type IN ('article', 'titre', 'sous_titre', 'note'));

DROP TRIGGER IF EXISTS crm_facture_lignes_updated_at ON public.crm_facture_lignes;
CREATE TRIGGER crm_facture_lignes_updated_at
  BEFORE UPDATE ON public.crm_facture_lignes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_crm_facture_lignes_facture_id ON public.crm_facture_lignes(facture_id);
CREATE INDEX IF NOT EXISTS idx_crm_facture_lignes_article_id ON public.crm_facture_lignes(article_id);
CREATE INDEX IF NOT EXISTS idx_crm_facture_lignes_ordre ON public.crm_facture_lignes(facture_id, ordre);

CREATE TABLE IF NOT EXISTS public.crm_facture_paiements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id    UUID NOT NULL REFERENCES public.crm_factures(id) ON DELETE CASCADE,
  montant       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  date_paiement DATE NOT NULL DEFAULT CURRENT_DATE,
  mode          TEXT NOT NULL DEFAULT 'virement',
  reference     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_facture_paiements_facture_id ON public.crm_facture_paiements(facture_id);

ALTER TABLE public.crm_factures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_facture_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_facture_paiements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_factures_all_auth ON public.crm_factures;
CREATE POLICY crm_factures_all_auth ON public.crm_factures
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS crm_facture_lignes_all_auth ON public.crm_facture_lignes;
CREATE POLICY crm_facture_lignes_all_auth ON public.crm_facture_lignes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS crm_facture_paiements_all_auth ON public.crm_facture_paiements;
CREATE POLICY crm_facture_paiements_all_auth ON public.crm_facture_paiements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.crm_factures TO authenticated;
GRANT ALL ON public.crm_factures TO service_role;
GRANT ALL ON public.crm_facture_lignes TO authenticated;
GRANT ALL ON public.crm_facture_lignes TO service_role;
GRANT ALL ON public.crm_facture_paiements TO authenticated;
GRANT ALL ON public.crm_facture_paiements TO service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260526041000_crm_factures_acompte.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- CRM Factures — colonnes facture d'acompte
ALTER TABLE public.crm_factures ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'facture';
ALTER TABLE public.crm_factures ADD COLUMN IF NOT EXISTS pourcentage_acompte NUMERIC(5, 2);
ALTER TABLE public.crm_factures ADD COLUMN IF NOT EXISTS devise TEXT DEFAULT 'MAD';
ALTER TABLE public.crm_factures ADD COLUMN IF NOT EXISTS devis_reste_apres NUMERIC(14, 2);

ALTER TABLE public.crm_factures DROP CONSTRAINT IF EXISTS crm_factures_type_check;
ALTER TABLE public.crm_factures
  ADD CONSTRAINT crm_factures_type_check
  CHECK (type IN ('facture', 'acompte'));

CREATE INDEX IF NOT EXISTS idx_crm_factures_type ON public.crm_factures(type);
CREATE INDEX IF NOT EXISTS idx_crm_factures_devis_acompte ON public.crm_factures(devis_id, type);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260526100000_internal_tasks.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Organisation interne — Tâches à faire
-- Coller ce fichier en entier dans Supabase SQL Editor

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.internal_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titre           TEXT NOT NULL,
  description     TEXT,
  priorite        TEXT NOT NULL DEFAULT 'normale',
  statut          TEXT NOT NULL DEFAULT 'a_faire',
  responsable     TEXT,
  date_echeance   DATE,
  module_lie      TEXT,
  commentaire     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Colonnes si table créée partiellement
ALTER TABLE public.internal_tasks ADD COLUMN IF NOT EXISTS titre TEXT;
ALTER TABLE public.internal_tasks ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.internal_tasks ADD COLUMN IF NOT EXISTS priorite TEXT NOT NULL DEFAULT 'normale';
ALTER TABLE public.internal_tasks ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'a_faire';
ALTER TABLE public.internal_tasks ADD COLUMN IF NOT EXISTS responsable TEXT;
ALTER TABLE public.internal_tasks ADD COLUMN IF NOT EXISTS date_echeance DATE;
ALTER TABLE public.internal_tasks ADD COLUMN IF NOT EXISTS module_lie TEXT;
ALTER TABLE public.internal_tasks ADD COLUMN IF NOT EXISTS commentaire TEXT;
ALTER TABLE public.internal_tasks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.internal_tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Migration anciennes valeurs (si table existait avec ancien schéma)
UPDATE public.internal_tasks SET statut = 'a_faire'   WHERE statut = 'todo';
UPDATE public.internal_tasks SET statut = 'en_cours'  WHERE statut = 'inprogress';
UPDATE public.internal_tasks SET statut = 'terminee'  WHERE statut = 'done';

ALTER TABLE public.internal_tasks DROP CONSTRAINT IF EXISTS internal_tasks_priorite_check;
ALTER TABLE public.internal_tasks
  ADD CONSTRAINT internal_tasks_priorite_check
  CHECK (priorite IN ('basse', 'normale', 'haute', 'urgente'));

ALTER TABLE public.internal_tasks DROP CONSTRAINT IF EXISTS internal_tasks_statut_check;
ALTER TABLE public.internal_tasks
  ADD CONSTRAINT internal_tasks_statut_check
  CHECK (statut IN ('a_faire', 'en_cours', 'terminee'));

DROP TRIGGER IF EXISTS internal_tasks_updated_at ON public.internal_tasks;
CREATE TRIGGER internal_tasks_updated_at
  BEFORE UPDATE ON public.internal_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_internal_tasks_statut ON public.internal_tasks(statut);
CREATE INDEX IF NOT EXISTS idx_internal_tasks_priorite ON public.internal_tasks(priorite);
CREATE INDEX IF NOT EXISTS idx_internal_tasks_responsable ON public.internal_tasks(responsable);
CREATE INDEX IF NOT EXISTS idx_internal_tasks_date_echeance ON public.internal_tasks(date_echeance);
CREATE INDEX IF NOT EXISTS idx_internal_tasks_created_at ON public.internal_tasks(created_at DESC);

ALTER TABLE public.internal_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS internal_tasks_all_auth ON public.internal_tasks;
CREATE POLICY internal_tasks_all_auth ON public.internal_tasks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.internal_tasks TO authenticated;
GRANT ALL ON public.internal_tasks TO service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260526110000_internal_appointments.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260527120000_employees_extended_fields.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- RH Employés — champs étendus (adresse, CIN, CNSS, RIB, banque, situation familiale)
-- Exécuter dans Supabase → SQL Editor ou : supabase db push

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS adresse TEXT,
  ADD COLUMN IF NOT EXISTS numero_cin TEXT,
  ADD COLUMN IF NOT EXISTS cnss TEXT,
  ADD COLUMN IF NOT EXISTS rib TEXT,
  ADD COLUMN IF NOT EXISTS banque TEXT,
  ADD COLUMN IF NOT EXISTS situation_familiale TEXT;

COMMENT ON COLUMN public.employees.adresse IS 'Adresse postale';
COMMENT ON COLUMN public.employees.numero_cin IS 'Numéro CIN marocain';
COMMENT ON COLUMN public.employees.cnss IS 'Numéro CNSS';
COMMENT ON COLUMN public.employees.rib IS 'Relevé d''identité bancaire';
COMMENT ON COLUMN public.employees.banque IS 'Banque';
COMMENT ON COLUMN public.employees.situation_familiale IS 'Situation familiale (célibataire, marié, etc.)';

-- CIN unique si renseigné (évite doublons import)
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_numero_cin_unique
  ON public.employees (numero_cin)
  WHERE numero_cin IS NOT NULL AND TRIM(numero_cin) <> '';

-- Recherche / filtre téléphone
CREATE INDEX IF NOT EXISTS idx_employees_telephone ON public.employees (telephone)
  WHERE telephone IS NOT NULL AND TRIM(telephone) <> '';
-- SKIP (unsafe bulk seed): 20260527130000_seed_employees_citymo.sql — see 20260527140000_reseed_employees_citymo_safe.sql

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260527140000_reseed_employees_citymo_safe.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ═══════════════════════════════════════════════════════════════════════════
-- RESEED RH — 25 employés CITYMO (idempotent, sans échec du lot entier)
-- Cause du bug précédent : INSERT groupé → violation unique sur numero_cin
-- (ex. BE884115 déjà sur i.taghlabi@citymo.ma) annule les 25 lignes.
-- Prérequis : 20260527120000_employees_extended_fields.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Compte RH existant : enrichir sans changer l’email métier
UPDATE public.employees SET
  firstname = 'IMANE',
  lastname = 'TAGHLABI',
  poste = 'Responsable Marketing',
  department = NULL,
  department_id = NULL,
  telephone = '06-20-55-05-42',
  date_embauche = '2025-09-25',
  adresse = '5 RUE TANTAN APT 8 BOURGOGNE CASABLANCA',
  numero_cin = 'BE884115',
  cnss = '134141300',
  rib = '230 780 2589222211010200 67',
  banque = 'CIH',
  situation_familiale = 'Célibataire',
  updated_at = NOW()
WHERE LOWER(email) = 'i.taghlabi@citymo.ma'
   OR UPPER(TRIM(COALESCE(numero_cin, ''))) = 'BE884115';

-- Helper : upsert par CIN (conflit email/CIN gérés séparément)
CREATE OR REPLACE FUNCTION public._citymo_upsert_employee(
  p_firstname TEXT,
  p_lastname TEXT,
  p_email TEXT,
  p_poste TEXT,
  p_telephone TEXT,
  p_date_embauche DATE,
  p_adresse TEXT,
  p_numero_cin TEXT,
  p_cnss TEXT,
  p_rib TEXT,
  p_banque TEXT,
  p_situation_familiale TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_numero_cin IS NOT NULL AND TRIM(p_numero_cin) <> '' THEN
    INSERT INTO public.employees (
      firstname, lastname, email, poste, department, department_id,
      telephone, salaire, statut, date_embauche,
      adresse, numero_cin, cnss, rib, banque, situation_familiale
    ) VALUES (
      p_firstname, p_lastname, LOWER(p_email), p_poste, NULL, NULL,
      p_telephone, 0, 'Actif', p_date_embauche,
      p_adresse, UPPER(TRIM(p_numero_cin)), p_cnss, p_rib, p_banque, p_situation_familiale
    )
    ON CONFLICT (numero_cin)
    WHERE numero_cin IS NOT NULL AND TRIM(numero_cin) <> ''
    DO UPDATE SET
      firstname = EXCLUDED.firstname,
      lastname = EXCLUDED.lastname,
      poste = EXCLUDED.poste,
      department = NULL,
      department_id = NULL,
      telephone = EXCLUDED.telephone,
      date_embauche = EXCLUDED.date_embauche,
      adresse = EXCLUDED.adresse,
      cnss = EXCLUDED.cnss,
      rib = EXCLUDED.rib,
      banque = EXCLUDED.banque,
      situation_familiale = EXCLUDED.situation_familiale,
      updated_at = NOW();
    RETURN;
  END IF;

  INSERT INTO public.employees (
    firstname, lastname, email, poste, department, department_id,
    telephone, salaire, statut, date_embauche,
    adresse, numero_cin, cnss, rib, banque, situation_familiale
  ) VALUES (
    p_firstname, p_lastname, LOWER(p_email), p_poste, NULL, NULL,
    p_telephone, 0, 'Actif', p_date_embauche,
    p_adresse, NULL, p_cnss, p_rib, p_banque, p_situation_familiale
  )
  ON CONFLICT (email) DO UPDATE SET
    firstname = EXCLUDED.firstname,
    lastname = EXCLUDED.lastname,
    poste = EXCLUDED.poste,
    department = NULL,
    department_id = NULL,
    telephone = EXCLUDED.telephone,
    date_embauche = EXCLUDED.date_embauche,
    adresse = EXCLUDED.adresse,
    numero_cin = EXCLUDED.numero_cin,
    cnss = EXCLUDED.cnss,
    rib = EXCLUDED.rib,
    banque = EXCLUDED.banque,
    situation_familiale = EXCLUDED.situation_familiale,
    updated_at = NOW();
END;
$$;

SELECT public._citymo_upsert_employee('Chaimaa','EL FALLAH GRINI','bb115904@employes.citymo.local','Assistante de direction','06-33-90-29-44','2025-02-04','RES ARSAT BERNOUSSI GH2 IMM 9 ETG 3 NR 6 BERNOUSSI CASA','BB115904','148407401','007 780 0000865300310001 86','AWB','Célibataire');
SELECT public._citymo_upsert_employee('Mohamed','AIT LAMKADEM','ee54555@employes.citymo.local','Chauffeur','07-61-77-79-73','2025-09-01','RUE DES OUDAYAS NO 71 LA VILLETTE H M CASA','EE54555','188849454','022 780 0001550027847410 74','SAHAM BANK','Marié');
SELECT public._citymo_upsert_employee('Otman','SABER','wb217978@employes.citymo.local','Menuisière','06-19-33-52-99','2025-09-01','DR OULED LBAHLOUL OULD BRAHIM LEBSSABESS MNIAA BEN AHMED','WB217978','162166344','230 629 6586592211020300 84','CIH','Célibataire');
SELECT public._citymo_upsert_employee('Abdelhak','ELKHOUMRI','j386372@employes.citymo.local','Chef de chantier','06-66-67-06-15','2025-09-01','DR BOUJEMAA NR 61 AHL LOUGHLAM CASABLANCA','J386372','188392065','190 780 2111100111290003 96','BANQUE POPULAIRE','Marié');
SELECT public._citymo_upsert_employee('Jihane','ELOUADOUD','ba21889@employes.citymo.local','Techniciene BTP','06-48-61-58-10','2025-09-22','14 BLOC 28 SID OTHMANE CASABLANCA','BA21889','119360850','011 780 0000732000048223 37','BMCEMAMC','Célibataire');
SELECT public._citymo_upsert_employee('IMANE','TAGHLABI','i.taghlabi@citymo.ma','Responsable Marketing','06-20-55-05-42','2025-09-25','5 RUE TANTAN APT 8 BOURGOGNE CASABLANCA','BE884115','134141300','230 780 2589222211010200 67','CIH','Célibataire');
SELECT public._citymo_upsert_employee('HAMZA','ABID','bk619171@employes.citymo.local','Chef de chantier','06-07-29-54-55','2025-10-13','DR ABBED LAHRECH OULAD AZZOUZ DAR BOUAZZA CASA','BK619171','152674527','230 792 2901144211031100 81','CIH','Célibataire');
SELECT public._citymo_upsert_employee('AZZEDDINE','EL FANNANE','bk404974@employes.citymo.local','Chef de chantier','06-69-76-24-45','2025-10-14','LISSASFA 3 BLOC E NR 220 CASA','BK404974','147612082','007 780 0006709000308252 25','AWB','Marié');
SELECT public._citymo_upsert_employee('HASSAN','LAGHOUIBA','bk310903@employes.citymo.local','Chauffeur','06-66-88-52-94','2025-10-23','DOUAR OLD ABBOU OLD AISSA OLD AZZOUZ NOUACEUR CASA','BK310903','110265669','190 780 2111101679690006 39','BP','Marié');
SELECT public._citymo_upsert_employee('LAILA','WOTFI','bb47180@employes.citymo.local','Enployer polyvalent','06-12-62-19-30','2025-11-12','BLOC 201 NR 49 BERNOUSSI CASABLANCA','BB47180','147614492','022 780 0000790029686665 74','SAHAM BANK','Marié');
SELECT public._citymo_upsert_employee('LHOU','HEZGUIT','ua12994@employes.citymo.local','SAV',NULL,'2025-09-01','DR EL KHEYAYTA','UA12994','924620720','833 780 0000000366350408 36','BARID CASH','Marié');
SELECT public._citymo_upsert_employee('SAID','HSINA','bh288165@employes.citymo.local','COURCIER',NULL,'2025-11-01','HAY MASSIRA 02 RUE 23 NO 07 CASABLANCA','BH288165','180280268','190 780 2111127879760000 28','BP','Marié');
SELECT public._citymo_upsert_employee('MOUHCINE','EL MOUTTAKI','bk728676@employes.citymo.local','Chauffeur','06-69-27-47-34','2025-12-02','LISSASFA DR EL OUZAZNA QUARTIER INDUSTRIEL CASABLANCA','BK728676',NULL,'007 780 0006952000302763 48','AWB','Célibataire');
SELECT public._citymo_upsert_employee('TAOUFIK','EL HAKIMY','bk690554@employes.citymo.local','Chauffeur','06-12-77-08-94','2025-12-02','HAY NASSIM DR LOUZAZNA RTE 1077 CASA','BK690554',NULL,'190 780 2111114118910000 25','BP','Marié');
SELECT public._citymo_upsert_employee('Nourddine','FATIHI','wa183274@employes.citymo.local','Chef de chantier','06-91-82-67-17','2026-01-21','LOT EL WAHDA NR 24 SOUALEM BERRECHID','WA183274','101341693','007 780 0003755000306948 83','AWB','Célibataire');
SELECT public._citymo_upsert_employee('LHSSEN','BEN AICHA','bk108176@employes.citymo.local','RH','06-63-48-04-15','2026-01-26','134 LOT EL WAHDA BERRCHID','BK108176',NULL,'230 629 3253720211020300 38','CIH','Marié');
SELECT public._citymo_upsert_employee('ABDELKHALEK','JERRAR','bk603582@employes.citymo.local','MAGASINIER','06-90-63-89-93','2026-03-11','DR OLD KHADDOU LAHRECH OLD AZZOUZ DAR BOUAZZA NOUACEUR CASA','BK603582','103312813','190 792 2111109406530007 36','BMCEMAMC','Célibataire');
SELECT public._citymo_upsert_employee('MOHAMMED','ZAANOUN','bf9861@employes.citymo.local','Chef de chantier','06-60-08-37-53','2026-02-09','LOT PARC ERRAHMA GH 1 IMM 2 NR 23 ERRAHMA 02 DAR BOUAZZA NOUACEUR CASA','BF9861','101199465','022 780 0003550028210381 74','SAHAM BANK','Célibataire');
SELECT public._citymo_upsert_employee('OTHMANE','RSAIM','bb128160@employes.citymo.local','Chef de chantier','06-03-31-54-25','2026-02-13','BC 130 NR 19 BERNOUSSI CASA','BB128160','174100427','007 780 0003763000309800 23','AWB','Célibataire');
SELECT public._citymo_upsert_employee('HIBA','BARKAOUI','bh650129@employes.citymo.local','Employer polyvalente','07-04-16-06-80','2026-03-06','DERB KOUDIA RUE 14 N 60 C D CASA','BH650129','NON AFFILIEÉ','021 780 0000053001298992 53','CDM','Célibataire');
SELECT public._citymo_upsert_employee('MEKSSI','MOHAMMED','bl93598@employes.citymo.local','COMPTABLE','06-17-86-02-33','2026-04-01','2 RUE 19 HABOUS CASABLANCA','BL93598','136023399','022780 0000580010489066 74','SAHAM BANK','Célibataire');
SELECT public._citymo_upsert_employee('MAROUAN','TOUIMI','bb96317@employes.citymo.local','COURSIER','06-69-10-29-27','2026-05-21','BLOC 11 NR15 BERNOUSSI CASABLANCA','BB96317','NON AFFILIEÉ','007 780 0003098000307750 89','AWB','Marié');
SELECT public._citymo_upsert_employee('EL WARDI','KHALID','bk300700@employes.citymo.local','Menuisière',NULL,NULL,'ALINA DEV','BK300700','191113250','190 629 2111145340660005 61','BP',NULL);
SELECT public._citymo_upsert_employee('MORAD','ABIDINE','morad.abidine@employes.citymo.local','Menuisière',NULL,'2026-01-21','ALINA DEV',NULL,NULL,NULL,NULL,NULL);
SELECT public._citymo_upsert_employee('NABIL','LAKHDAR','bh225151@employes.citymo.local','Chauffeur',NULL,'2026-01-26','LOT EL WAHDA NR 04 SOUALEM BERRECHID','BH225151','961397431','820 780 2611182890058482 26','WAFACASH','Marié');

DROP FUNCTION public._citymo_upsert_employee(
  TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
);

COMMIT;

SELECT COUNT(*) AS total_employes FROM public.employees;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260527150000_logistique_vehicles.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ═══════════════════════════════════════════════════════════════════════════
-- LOGISTIQUE — Flotte véhicules (module Véhicules CITYMO)
-- Coller dans Supabase → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.vehicles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicule            TEXT,
  matricule_ww        TEXT,
  matricule           TEXT NOT NULL,
  type                TEXT,
  marque              TEXT,
  modele              TEXT,
  annee               INTEGER,
  couleur             TEXT,
  chauffeur           TEXT,
  departement         TEXT,
  responsable         TEXT,
  statut              TEXT NOT NULL DEFAULT 'disponible',
  assurance           TEXT,
  date_exp_assurance  DATE,
  visite_technique    TEXT,
  date_exp_visite     DATE,
  carte_grise         TEXT,
  km_actuel           NUMERIC(12, 2),
  carburant           TEXT,
  consommation        NUMERIC(8, 2),
  observations        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS vehicule TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS matricule_ww TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS matricule TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS marque TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS modele TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS annee INTEGER;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS couleur TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS chauffeur TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS departement TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS responsable TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'disponible';
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS assurance TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS date_exp_assurance DATE;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS visite_technique TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS date_exp_visite DATE;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS carte_grise TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS km_actuel NUMERIC(12, 2);
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS carburant TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS consommation NUMERIC(8, 2);
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS observations TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_statut_check;
ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_statut_check
  CHECK (statut IN ('disponible', 'affecte', 'intervention', 'hors_service', 'maintenance'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_matricule_unique
  ON public.vehicles (matricule);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_matricule_ww_unique
  ON public.vehicles (matricule_ww)
  WHERE matricule_ww IS NOT NULL AND TRIM(matricule_ww) <> '';

CREATE INDEX IF NOT EXISTS idx_vehicles_statut ON public.vehicles (statut);
CREATE INDEX IF NOT EXISTS idx_vehicles_type ON public.vehicles (type);
CREATE INDEX IF NOT EXISTS idx_vehicles_chauffeur ON public.vehicles (chauffeur);
CREATE INDEX IF NOT EXISTS idx_vehicles_created_at ON public.vehicles (created_at DESC);

DROP TRIGGER IF EXISTS vehicles_updated_at ON public.vehicles;
CREATE TRIGGER vehicles_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vehicles_all_auth ON public.vehicles;
CREATE POLICY vehicles_all_auth ON public.vehicles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260527150100_seed_logistique_vehicles.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ═══════════════════════════════════════════════════════════════════════════
-- SEED — 18 véhicules CITYMO (idempotent)
-- Prérequis : 20260527150000_logistique_vehicles.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public._citymo_upsert_vehicle(
  p_vehicule TEXT,
  p_matricule_ww TEXT,
  p_matricule TEXT,
  p_type TEXT,
  p_marque TEXT,
  p_modele TEXT,
  p_chauffeur TEXT,
  p_statut TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_mat TEXT := UPPER(TRIM(p_matricule));
  v_ww TEXT := NULLIF(UPPER(TRIM(COALESCE(p_matricule_ww, ''))), '');
BEGIN
  IF v_mat IS NULL OR v_mat = '' THEN
    RAISE EXCEPTION 'matricule requis';
  END IF;

  INSERT INTO public.vehicles (
    vehicule, matricule_ww, matricule, type, marque, modele, chauffeur, statut
  ) VALUES (
    NULLIF(TRIM(p_vehicule), ''),
    v_ww,
    v_mat,
    NULLIF(TRIM(p_type), ''),
    NULLIF(TRIM(p_marque), ''),
    NULLIF(TRIM(p_modele), ''),
    NULLIF(TRIM(p_chauffeur), ''),
    COALESCE(NULLIF(TRIM(p_statut), ''), 'disponible')
  )
  ON CONFLICT (matricule) DO UPDATE SET
    vehicule = EXCLUDED.vehicule,
    matricule_ww = COALESCE(EXCLUDED.matricule_ww, vehicles.matricule_ww),
    type = EXCLUDED.type,
    marque = EXCLUDED.marque,
    modele = EXCLUDED.modele,
    chauffeur = EXCLUDED.chauffeur,
    statut = EXCLUDED.statut,
    updated_at = NOW();
END;
$$;

SELECT public._citymo_upsert_vehicle('RENAULT EXPRESS','WW583662','97155-T-6','Fourgon','RENAULT','EXPRESS','LHOU HEZGHIT','affecte');
SELECT public._citymo_upsert_vehicle('OPEL','WW451463','91735-T-6',NULL,'OPEL',NULL,NULL,'disponible');
SELECT public._citymo_upsert_vehicle('RENAULT EXPRESS','WW583663','97156-T-6','Fourgon','RENAULT','EXPRESS','MOHAMMED ZAANOUN','affecte');
SELECT public._citymo_upsert_vehicle('RENAULT EXPRESS','WW441502','83399-T-6','Fourgon','RENAULT','EXPRESS',NULL,'disponible');
SELECT public._citymo_upsert_vehicle('RENAULT EXPRESS','WW711071','12853-Y-6','Fourgon','RENAULT','EXPRESS','AZZEDDINE EL FANNANE','affecte');
SELECT public._citymo_upsert_vehicle('H100','WW687257','12346-Y-6',NULL,'H100',NULL,'MOUHCINE EL MOUTTAKI','affecte');
SELECT public._citymo_upsert_vehicle('RENAULT EXPRESS','WW711070','12852-Y-6','Fourgon','RENAULT','EXPRESS','Abdelhak ELKHOUMRI','affecte');
SELECT public._citymo_upsert_vehicle('RENAULT EXPRESS','WW238961','58674-T-6','Fourgon','RENAULT','EXPRESS','OTHMANE RSAIM','affecte');
SELECT public._citymo_upsert_vehicle('KIA','WW705598','16611-Y-6',NULL,'KIA',NULL,'TOUFIK EL KAKIMI','affecte');
SELECT public._citymo_upsert_vehicle('FORDE','WW733171','19699-Y-6',NULL,'FORDE',NULL,'HASSAN LAGHOUIBA','affecte');
SELECT public._citymo_upsert_vehicle('DACIA DUSTER','WW803739','22340-Y-6',NULL,'DACIA','DUSTER','NOURDINE FATIHI','affecte');
SELECT public._citymo_upsert_vehicle('DACIA DUSTER','WW803740','22341-Y-6',NULL,'DACIA','DUSTER',NULL,'disponible');
SELECT public._citymo_upsert_vehicle('RENAULT TRAFIC','WW803383','21881-Y-6','Fourgon','RENAULT','TRAFIC','NABIL LAKHDAR','affecte');
SELECT public._citymo_upsert_vehicle('RENAULT EXPRESS','WW803386','22505-Y-6','Fourgon','RENAULT','EXPRESS',NULL,'disponible');
SELECT public._citymo_upsert_vehicle('RENAULT EXPRESS','WW803387','22141-Y-6','Fourgon','RENAULT','EXPRESS','HAMZA ABID','affecte');
SELECT public._citymo_upsert_vehicle('DACIA LOGAN','WW803457','23948-Y-6',NULL,'DACIA','LOGAN','LHSSEN BENAICHA','affecte');
SELECT public._citymo_upsert_vehicle('MOTO SYM',NULL,'72-041148','Scooter','MOTO','SYM','MOHAMMED AIT LEMKADEM','affecte');
SELECT public._citymo_upsert_vehicle('MOTO KYMCO',NULL,'LU2U60050S54','Scooter','MOTO','KYMCO','SAID HSINA','affecte');

DROP FUNCTION public._citymo_upsert_vehicle(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

COMMIT;

SELECT COUNT(*) AS total_vehicules FROM public.vehicles;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260527160000_vehicle_intervention_requests.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ═══════════════════════════════════════════════════════════════════════════
-- LOGISTIQUE — Demandes d'intervention véhicules
-- Prérequis : table public.vehicles (20260527150000_logistique_vehicles.sql)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.vehicle_intervention_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref                   TEXT NOT NULL UNIQUE,
  vehicle_id            UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  matricule             TEXT,
  vehicule_label        TEXT,
  chauffeur             TEXT,
  departement           TEXT,
  type_intervention     TEXT NOT NULL,
  description           TEXT,
  priorite              TEXT NOT NULL DEFAULT 'normale',
  date_demande          DATE,
  date_prevue           DATE,
  statut                TEXT NOT NULL DEFAULT 'en_attente',
  cout_estime           NUMERIC(12, 2),
  garage                TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS ref TEXT;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS vehicle_id UUID;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS matricule TEXT;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS vehicule_label TEXT;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS chauffeur TEXT;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS departement TEXT;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS type_intervention TEXT;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS priorite TEXT NOT NULL DEFAULT 'normale';
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS date_demande DATE;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS date_prevue DATE;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'en_attente';
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS cout_estime NUMERIC(12, 2);
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS garage TEXT;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.vehicle_intervention_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.vehicle_intervention_requests DROP CONSTRAINT IF EXISTS vehicle_intervention_requests_priorite_check;
ALTER TABLE public.vehicle_intervention_requests
  ADD CONSTRAINT vehicle_intervention_requests_priorite_check
  CHECK (priorite IN ('faible', 'normale', 'urgente', 'critique', 'basse', 'haute'));

ALTER TABLE public.vehicle_intervention_requests DROP CONSTRAINT IF EXISTS vehicle_intervention_requests_statut_check;
ALTER TABLE public.vehicle_intervention_requests
  ADD CONSTRAINT vehicle_intervention_requests_statut_check
  CHECK (statut IN ('en_attente', 'diagnostic', 'en_cours', 'termine', 'annule'));

CREATE INDEX IF NOT EXISTS idx_vir_vehicle_id ON public.vehicle_intervention_requests(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vir_matricule ON public.vehicle_intervention_requests(matricule);
CREATE INDEX IF NOT EXISTS idx_vir_chauffeur ON public.vehicle_intervention_requests(chauffeur);
CREATE INDEX IF NOT EXISTS idx_vir_statut ON public.vehicle_intervention_requests(statut);
CREATE INDEX IF NOT EXISTS idx_vir_priorite ON public.vehicle_intervention_requests(priorite);
CREATE INDEX IF NOT EXISTS idx_vir_date_demande ON public.vehicle_intervention_requests(date_demande DESC);
CREATE INDEX IF NOT EXISTS idx_vir_created_at ON public.vehicle_intervention_requests(created_at DESC);

DROP TRIGGER IF EXISTS vehicle_intervention_requests_updated_at ON public.vehicle_intervention_requests;
CREATE TRIGGER vehicle_intervention_requests_updated_at
  BEFORE UPDATE ON public.vehicle_intervention_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.vehicle_intervention_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vehicle_intervention_requests_all_auth ON public.vehicle_intervention_requests;
CREATE POLICY vehicle_intervention_requests_all_auth ON public.vehicle_intervention_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.vehicle_intervention_requests TO authenticated;
GRANT ALL ON public.vehicle_intervention_requests TO service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260527170000_vehicle_intervention_history.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ═══════════════════════════════════════════════════════════════════════════
-- LOGISTIQUE — Historique interventions véhicules (clôturées)
-- Prérequis : 20260527160000_vehicle_intervention_requests.sql
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.vehicle_intervention_history (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id            UUID UNIQUE REFERENCES public.vehicle_intervention_requests(id) ON DELETE CASCADE,
  ref                   TEXT NOT NULL,
  vehicle_id            UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  matricule             TEXT,
  vehicule_label        TEXT,
  chauffeur             TEXT,
  type_intervention     TEXT,
  description           TEXT,
  priorite              TEXT,
  date_demande          DATE,
  date_intervention     DATE,
  date_fin              DATE,
  cout_final            NUMERIC(12, 2),
  prestataire           TEXT,
  observation_finale    TEXT,
  statut                TEXT NOT NULL DEFAULT 'termine',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS request_id UUID;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS ref TEXT;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS vehicle_id UUID;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS matricule TEXT;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS vehicule_label TEXT;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS chauffeur TEXT;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS type_intervention TEXT;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS priorite TEXT;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS date_demande DATE;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS date_intervention DATE;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS date_fin DATE;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS cout_final NUMERIC(12, 2);
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS prestataire TEXT;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS observation_finale TEXT;
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'termine';
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.vehicle_intervention_history ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.vehicle_intervention_history DROP CONSTRAINT IF EXISTS vehicle_intervention_history_statut_check;
ALTER TABLE public.vehicle_intervention_history
  ADD CONSTRAINT vehicle_intervention_history_statut_check
  CHECK (statut IN ('termine', 'annule'));

CREATE INDEX IF NOT EXISTS idx_vih_request_id ON public.vehicle_intervention_history(request_id);
CREATE INDEX IF NOT EXISTS idx_vih_vehicle_id ON public.vehicle_intervention_history(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vih_matricule ON public.vehicle_intervention_history(matricule);
CREATE INDEX IF NOT EXISTS idx_vih_chauffeur ON public.vehicle_intervention_history(chauffeur);
CREATE INDEX IF NOT EXISTS idx_vih_type ON public.vehicle_intervention_history(type_intervention);
CREATE INDEX IF NOT EXISTS idx_vih_date_fin ON public.vehicle_intervention_history(date_fin DESC);
CREATE INDEX IF NOT EXISTS idx_vih_created_at ON public.vehicle_intervention_history(created_at DESC);

DROP TRIGGER IF EXISTS vehicle_intervention_history_updated_at ON public.vehicle_intervention_history;
CREATE TRIGGER vehicle_intervention_history_updated_at
  BEFORE UPDATE ON public.vehicle_intervention_history
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.vehicle_intervention_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vehicle_intervention_history_all_auth ON public.vehicle_intervention_history;
CREATE POLICY vehicle_intervention_history_all_auth ON public.vehicle_intervention_history
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.vehicle_intervention_history TO authenticated;
GRANT ALL ON public.vehicle_intervention_history TO service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260528030000_crm_delivery_notes.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- CRM Bons de livraison — delivery_notes / delivery_note_items

CREATE TABLE IF NOT EXISTS public.delivery_notes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero              TEXT NOT NULL,
  statut              TEXT NOT NULL DEFAULT 'brouillon',
  client_id           UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_nom          TEXT,
  adresse_livraison   TEXT,
  date_livraison      DATE NOT NULL DEFAULT CURRENT_DATE,
  date_echeance       DATE,
  commercial          TEXT,
  prepare_par         TEXT,
  projet              TEXT,
  devis_id            UUID REFERENCES public.crm_devis(id) ON DELETE SET NULL,
  facture_id          UUID REFERENCES public.crm_factures(id) ON DELETE SET NULL,
  devis_reference     TEXT,
  facture_reference   TEXT,
  contact_reception   TEXT,
  tel_reception       TEXT,
  remarques           TEXT,
  notes_internes      TEXT,
  signature_client    TEXT,
  date_validation     DATE,
  est_facture         BOOLEAN NOT NULL DEFAULT FALSE,
  pct_livre           NUMERIC(6, 2) NOT NULL DEFAULT 0,
  total_articles      INTEGER NOT NULL DEFAULT 0,
  total_commandees    NUMERIC(14, 3) NOT NULL DEFAULT 0,
  total_livrees       NUMERIC(14, 3) NOT NULL DEFAULT 0,
  total_restantes     NUMERIC(14, 3) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT delivery_notes_numero_unique UNIQUE (numero)
);

ALTER TABLE public.delivery_notes ADD COLUMN IF NOT EXISTS prepare_par TEXT;
ALTER TABLE public.delivery_notes ADD COLUMN IF NOT EXISTS devis_reference TEXT;
ALTER TABLE public.delivery_notes ADD COLUMN IF NOT EXISTS facture_reference TEXT;

ALTER TABLE public.delivery_notes DROP CONSTRAINT IF EXISTS delivery_notes_statut_check;
ALTER TABLE public.delivery_notes
  ADD CONSTRAINT delivery_notes_statut_check
  CHECK (statut IN (
    'brouillon', 'preparation', 'en_attente', 'livre',
    'partiellement_livre', 'facture', 'annule'
  ));

DROP TRIGGER IF EXISTS delivery_notes_updated_at ON public.delivery_notes;
CREATE TRIGGER delivery_notes_updated_at
  BEFORE UPDATE ON public.delivery_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_delivery_notes_client_id ON public.delivery_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_statut ON public.delivery_notes(statut);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_numero ON public.delivery_notes(numero);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_date_livraison ON public.delivery_notes(date_livraison DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_devis_id ON public.delivery_notes(devis_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_facture_id ON public.delivery_notes(facture_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_created_at ON public.delivery_notes(created_at DESC);

CREATE TABLE IF NOT EXISTS public.delivery_note_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_note_id      UUID NOT NULL REFERENCES public.delivery_notes(id) ON DELETE CASCADE,
  ordre                 INTEGER NOT NULL DEFAULT 0,
  article_id            UUID REFERENCES public.articles(id) ON DELETE SET NULL,
  categorie_id          UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  designation           TEXT,
  description           TEXT,
  unite                 TEXT NOT NULL DEFAULT 'unite',
  quantite_commandee    NUMERIC(14, 3) NOT NULL DEFAULT 1,
  quantite_livree       NUMERIC(14, 3) NOT NULL DEFAULT 0,
  quantite_restante     NUMERIC(14, 3) NOT NULL DEFAULT 0,
  remarque              TEXT,
  statut_ligne          TEXT NOT NULL DEFAULT 'a_livrer',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.delivery_note_items ADD COLUMN IF NOT EXISTS remarque TEXT;

ALTER TABLE public.delivery_note_items DROP CONSTRAINT IF EXISTS delivery_note_items_statut_ligne_check;
ALTER TABLE public.delivery_note_items
  ADD CONSTRAINT delivery_note_items_statut_ligne_check
  CHECK (statut_ligne IN ('a_livrer', 'livre', 'non_livre', 'en_attente'));

DROP TRIGGER IF EXISTS delivery_note_items_updated_at ON public.delivery_note_items;
CREATE TRIGGER delivery_note_items_updated_at
  BEFORE UPDATE ON public.delivery_note_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_delivery_note_items_note_id ON public.delivery_note_items(delivery_note_id);
CREATE INDEX IF NOT EXISTS idx_delivery_note_items_ordre ON public.delivery_note_items(delivery_note_id, ordre);

ALTER TABLE public.delivery_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_note_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS delivery_notes_all_auth ON public.delivery_notes;
CREATE POLICY delivery_notes_all_auth ON public.delivery_notes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS delivery_note_items_all_auth ON public.delivery_note_items;
CREATE POLICY delivery_note_items_all_auth ON public.delivery_note_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.delivery_notes TO authenticated;
GRANT ALL ON public.delivery_notes TO service_role;
GRANT ALL ON public.delivery_note_items TO authenticated;
GRANT ALL ON public.delivery_note_items TO service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260603120000_projects.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Module Projets ERP — public.projects

CREATE TABLE IF NOT EXISTS public.projects (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref                 TEXT NOT NULL,
  nom                 TEXT NOT NULL,
  client_id           UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_nom          TEXT,
  type_projet         TEXT,
  adresse_chantier    TEXT,
  ville               TEXT,
  date_debut          DATE,
  date_fin_prevue     DATE,
  statut              TEXT NOT NULL DEFAULT 'brouillon',
  responsable         TEXT,
  chef_chantier       TEXT,
  budget_estime       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  budget_consomme     NUMERIC(14, 2) NOT NULL DEFAULT 0,
  description         TEXT,
  observations        TEXT,
  devis_id            UUID,
  devis_reference     TEXT,
  facture_id          UUID,
  facture_reference   TEXT,
  priorite            TEXT DEFAULT 'normale',
  avancement          NUMERIC(5, 2) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT projects_ref_unique UNIQUE (ref)
);

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_statut_check;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_statut_check
  CHECK (statut IN ('brouillon', 'en_cours', 'en_pause', 'termine', 'annule'));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crm_devis') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_devis_id_fkey') THEN
      ALTER TABLE public.projects
        ADD CONSTRAINT projects_devis_id_fkey
        FOREIGN KEY (devis_id) REFERENCES public.crm_devis(id) ON DELETE SET NULL;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crm_factures') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_facture_id_fkey') THEN
      ALTER TABLE public.projects
        ADD CONSTRAINT projects_facture_id_fkey
        FOREIGN KEY (facture_id) REFERENCES public.crm_factures(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_projects_client_id ON public.projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_statut ON public.projects(statut);
CREATE INDEX IF NOT EXISTS idx_projects_type_projet ON public.projects(type_projet);
CREATE INDEX IF NOT EXISTS idx_projects_ref ON public.projects(ref);
CREATE INDEX IF NOT EXISTS idx_projects_date_debut ON public.projects(date_debut DESC);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON public.projects(created_at DESC);

DROP TRIGGER IF EXISTS projects_updated_at ON public.projects;
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projects_all_auth ON public.projects;
CREATE POLICY projects_all_auth ON public.projects
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260603130000_project_documents.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Projets — fichiers (project_documents + bucket citymo-projects)

CREATE TABLE IF NOT EXISTS public.project_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  mime_type     TEXT,
  file_size     BIGINT,
  category      TEXT NOT NULL DEFAULT 'autre',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.project_documents DROP CONSTRAINT IF EXISTS project_documents_category_check;
ALTER TABLE public.project_documents
  ADD CONSTRAINT project_documents_category_check
  CHECK (category IN ('plan', 'devis', 'photo', 'contrat', 'autre'));

CREATE INDEX IF NOT EXISTS idx_project_documents_project_id ON public.project_documents(project_id);

ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_documents_all_auth ON public.project_documents;
CREATE POLICY project_documents_all_auth ON public.project_documents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.project_documents TO authenticated;
GRANT ALL ON public.project_documents TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'citymo-projects',
  'citymo-projects',
  false,
  20971520,
  ARRAY[
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS citymo_projects_storage_select ON storage.objects;
CREATE POLICY citymo_projects_storage_select ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'citymo-projects');

DROP POLICY IF EXISTS citymo_projects_storage_insert ON storage.objects;
CREATE POLICY citymo_projects_storage_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'citymo-projects');

DROP POLICY IF EXISTS citymo_projects_storage_delete ON storage.objects;
CREATE POLICY citymo_projects_storage_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'citymo-projects');

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260603140000_sav_requests_reports.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.sav_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref                 TEXT NOT NULL,
  project_id          UUID,
  client_id           UUID,
  client_nom          TEXT,
  projet_nom          TEXT,
  ref_projet          TEXT,
  titre               TEXT,
  type_probleme       TEXT,
  categorie           TEXT,
  priorite            TEXT NOT NULL DEFAULT 'normale',
  statut              TEXT NOT NULL DEFAULT 'nouvelle',
  date_demande        DATE,
  responsable         TEXT,
  contact_client      TEXT,
  localisation        TEXT,
  departement         TEXT,
  date_intervention   DATE,
  description         TEXT,
  observations        TEXT,
  actions_prevues     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS client_id UUID;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS client_nom TEXT;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS projet_nom TEXT;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS ref_projet TEXT;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS titre TEXT;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS type_probleme TEXT;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS categorie TEXT;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS priorite TEXT DEFAULT 'normale';
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS statut TEXT DEFAULT 'nouvelle';
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS date_demande DATE;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS responsable TEXT;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS contact_client TEXT;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS localisation TEXT;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS departement TEXT;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS date_intervention DATE;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS observations TEXT;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS actions_prevues TEXT;
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.sav_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sav_requests_ref_unique') THEN
    ALTER TABLE public.sav_requests ADD CONSTRAINT sav_requests_ref_unique UNIQUE (ref);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sav_requests_project_id_fkey') THEN
      ALTER TABLE public.sav_requests
        ADD CONSTRAINT sav_requests_project_id_fkey
        FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clients') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sav_requests_client_id_fkey') THEN
      ALTER TABLE public.sav_requests
        ADD CONSTRAINT sav_requests_client_id_fkey
        FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

ALTER TABLE public.sav_requests DROP CONSTRAINT IF EXISTS sav_requests_statut_check;
ALTER TABLE public.sav_requests
  ADD CONSTRAINT sav_requests_statut_check
  CHECK (statut IN ('nouvelle', 'en_attente', 'planifiee', 'en_cours', 'terminee', 'cloturee'));

ALTER TABLE public.sav_requests DROP CONSTRAINT IF EXISTS sav_requests_priorite_check;
ALTER TABLE public.sav_requests
  ADD CONSTRAINT sav_requests_priorite_check
  CHECK (priorite IN ('faible', 'normale', 'urgente', 'critique'));

CREATE INDEX IF NOT EXISTS idx_sav_requests_project_id ON public.sav_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_sav_requests_client_id ON public.sav_requests(client_id);
CREATE INDEX IF NOT EXISTS idx_sav_requests_statut ON public.sav_requests(statut);
CREATE INDEX IF NOT EXISTS idx_sav_requests_ref ON public.sav_requests(ref);
CREATE INDEX IF NOT EXISTS idx_sav_requests_date_demande ON public.sav_requests(date_demande DESC);

DROP TRIGGER IF EXISTS sav_requests_updated_at ON public.sav_requests;
CREATE TRIGGER sav_requests_updated_at
  BEFORE UPDATE ON public.sav_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.sav_reports (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref                     TEXT NOT NULL,
  sav_request_id          UUID,
  project_id              UUID,
  client_nom              TEXT,
  projet_nom              TEXT,
  sav_ref                 TEXT,
  intervenant             TEXT,
  date_compte_rendu       DATE,
  resume_intervention     TEXT,
  actions_realisees       TEXT,
  actions_a_prevoir       TEXT,
  statut_apres_intervention TEXT,
  pieces_remplacees       TEXT,
  cout_intervention       NUMERIC(14, 2) DEFAULT 0,
  recommandations         TEXT,
  validation_client       TEXT,
  statut                  TEXT NOT NULL DEFAULT 'brouillon',
  observation             TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.sav_reports ADD COLUMN IF NOT EXISTS sav_request_id UUID;
ALTER TABLE public.sav_reports ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE public.sav_reports ADD COLUMN IF NOT EXISTS date_compte_rendu DATE;
ALTER TABLE public.sav_reports ADD COLUMN IF NOT EXISTS actions_a_prevoir TEXT;
ALTER TABLE public.sav_reports ADD COLUMN IF NOT EXISTS statut_apres_intervention TEXT;
ALTER TABLE public.sav_reports ADD COLUMN IF NOT EXISTS observation TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sav_reports_ref_unique') THEN
    ALTER TABLE public.sav_reports ADD CONSTRAINT sav_reports_ref_unique UNIQUE (ref);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sav_requests') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sav_reports_sav_request_id_fkey') THEN
      ALTER TABLE public.sav_reports
        ADD CONSTRAINT sav_reports_sav_request_id_fkey
        FOREIGN KEY (sav_request_id) REFERENCES public.sav_requests(id) ON DELETE CASCADE;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sav_reports_project_id_fkey') THEN
      ALTER TABLE public.sav_reports
        ADD CONSTRAINT sav_reports_project_id_fkey
        FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

ALTER TABLE public.sav_reports DROP CONSTRAINT IF EXISTS sav_reports_statut_check;
ALTER TABLE public.sav_reports
  ADD CONSTRAINT sav_reports_statut_check
  CHECK (statut IN ('brouillon', 'soumis', 'valide', 'refuse'));

CREATE INDEX IF NOT EXISTS idx_sav_reports_sav_request_id ON public.sav_reports(sav_request_id);
CREATE INDEX IF NOT EXISTS idx_sav_reports_project_id ON public.sav_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_sav_reports_date_cr ON public.sav_reports(date_compte_rendu DESC);

DROP TRIGGER IF EXISTS sav_reports_updated_at ON public.sav_reports;
CREATE TRIGGER sav_reports_updated_at
  BEFORE UPDATE ON public.sav_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sav_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sav_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sav_requests_all_auth ON public.sav_requests;
CREATE POLICY sav_requests_all_auth ON public.sav_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS sav_reports_all_auth ON public.sav_reports;
CREATE POLICY sav_reports_all_auth ON public.sav_reports
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.sav_requests TO authenticated, service_role;
GRANT ALL ON public.sav_reports TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MIGRATION: 20260603150000_workers_project_link.sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS project_id UUID;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workers_project_id_fkey') THEN
      ALTER TABLE public.workers
        ADD CONSTRAINT workers_project_id_fkey
        FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workers_project_id ON public.workers(project_id);

ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS project_id UUID;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_project_id_fkey') THEN
      ALTER TABLE public.attendance
        ADD CONSTRAINT attendance_project_id_fkey
        FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_attendance_project_id ON public.attendance(project_id);

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- FIN — recharger le cache PostgREST
-- ═══════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

SELECT 'CITYMO RESTORE DONE' AS step, NOW() AS at;

-- Résumé tables clés
SELECT 'employees' AS tbl, COUNT(*) AS n FROM public.employees
UNION ALL SELECT 'workers', COUNT(*) FROM public.workers
UNION ALL SELECT 'clients', COUNT(*) FROM public.clients
UNION ALL SELECT 'articles', COUNT(*) FROM public.articles
UNION ALL SELECT 'categories', COUNT(*) FROM public.categories
UNION ALL SELECT 'vehicles', COUNT(*) FROM public.vehicles
UNION ALL SELECT 'projects', COUNT(*) FROM public.projects
UNION ALL SELECT 'prospects', COUNT(*) FROM public.prospects
ORDER BY tbl;
