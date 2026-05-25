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
