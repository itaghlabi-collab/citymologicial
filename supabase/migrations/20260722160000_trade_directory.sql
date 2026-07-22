-- CITYMO — Annuaire Corps de métier (EXPLOITATION)
-- Additive / isolé — ne touche PAS fournisseurs, sous-traitants, ouvriers, RH, achats.
-- Exécuter aussi via : supabase/RUN_TRADE_DIRECTORY.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Corps de métier (catalogue) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trade_directory_trades (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT trade_directory_trades_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_trade_directory_trades_active
  ON public.trade_directory_trades (is_active, sort_order, name);

-- ── Intervenants / profils ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trade_directory_profiles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  phone             TEXT NOT NULL,
  trade_id          UUID NOT NULL REFERENCES public.trade_directory_trades(id) ON DELETE RESTRICT,
  city              TEXT,
  address           TEXT,
  role_title        TEXT,
  experience_level  TEXT,
  availability      TEXT NOT NULL DEFAULT 'disponible'
                    CHECK (availability IN ('disponible', 'occupe', 'indisponible')),
  status            TEXT NOT NULL DEFAULT 'actif'
                    CHECK (status IN ('actif', 'inactif')),
  rating            NUMERIC(2, 1),
  notes             TEXT,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT trade_directory_profiles_experience_chk
    CHECK (
      experience_level IS NULL
      OR experience_level IN ('debutant', 'intermediaire', 'experimente', 'expert')
    ),
  CONSTRAINT trade_directory_profiles_rating_chk
    CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5))
);

CREATE INDEX IF NOT EXISTS idx_trade_directory_profiles_trade
  ON public.trade_directory_profiles (trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_directory_profiles_status
  ON public.trade_directory_profiles (status);
CREATE INDEX IF NOT EXISTS idx_trade_directory_profiles_availability
  ON public.trade_directory_profiles (availability);
CREATE INDEX IF NOT EXISTS idx_trade_directory_profiles_name
  ON public.trade_directory_profiles (lower(trim(name)));
CREATE INDEX IF NOT EXISTS idx_trade_directory_profiles_city
  ON public.trade_directory_profiles (lower(trim(city)));

-- ── Tarifs (plusieurs par profil) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trade_directory_rates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID NOT NULL REFERENCES public.trade_directory_profiles(id) ON DELETE CASCADE,
  pricing_type    TEXT NOT NULL,
  price_mad       NUMERIC(14, 2) NOT NULL,
  unit_detail     TEXT,
  observation     TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT trade_directory_rates_pricing_chk
    CHECK (pricing_type IN (
      'par_jour', 'par_heure', 'par_tache', 'par_service',
      'au_m2', 'au_metre_lineaire', 'au_forfait', 'autre'
    )),
  CONSTRAINT trade_directory_rates_price_chk CHECK (price_mad >= 0)
);

CREATE INDEX IF NOT EXISTS idx_trade_directory_rates_profile
  ON public.trade_directory_rates (profile_id, sort_order);

-- ── Documents ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trade_directory_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID NOT NULL REFERENCES public.trade_directory_profiles(id) ON DELETE CASCADE,
  doc_type      TEXT NOT NULL DEFAULT 'autre',
  doc_name      TEXT,
  storage_path  TEXT NOT NULL,
  mime_type     TEXT,
  file_size     INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT trade_directory_documents_type_chk
    CHECK (doc_type IN ('cin', 'cnss', 'assurance', 'autre'))
);

CREATE INDEX IF NOT EXISTS idx_trade_directory_documents_profile
  ON public.trade_directory_documents (profile_id, created_at DESC);

-- ── Favoris personnels ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trade_directory_favorites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES public.trade_directory_profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_trade_directory_favorites_user
  ON public.trade_directory_favorites (user_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.trade_directory_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_directory_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_directory_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_directory_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_directory_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trade_directory_trades_all ON public.trade_directory_trades;
CREATE POLICY trade_directory_trades_all ON public.trade_directory_trades
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS trade_directory_profiles_all ON public.trade_directory_profiles;
CREATE POLICY trade_directory_profiles_all ON public.trade_directory_profiles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS trade_directory_rates_all ON public.trade_directory_rates;
CREATE POLICY trade_directory_rates_all ON public.trade_directory_rates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS trade_directory_documents_all ON public.trade_directory_documents;
CREATE POLICY trade_directory_documents_all ON public.trade_directory_documents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS trade_directory_favorites_select_own ON public.trade_directory_favorites;
CREATE POLICY trade_directory_favorites_select_own ON public.trade_directory_favorites
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS trade_directory_favorites_insert_own ON public.trade_directory_favorites;
CREATE POLICY trade_directory_favorites_insert_own ON public.trade_directory_favorites
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS trade_directory_favorites_delete_own ON public.trade_directory_favorites;
CREATE POLICY trade_directory_favorites_delete_own ON public.trade_directory_favorites
  FOR DELETE TO authenticated USING (user_id = auth.uid());

GRANT ALL ON public.trade_directory_trades TO authenticated, service_role;
GRANT ALL ON public.trade_directory_profiles TO authenticated, service_role;
GRANT ALL ON public.trade_directory_rates TO authenticated, service_role;
GRANT ALL ON public.trade_directory_documents TO authenticated, service_role;
GRANT ALL ON public.trade_directory_favorites TO authenticated, service_role;

-- ── Seed corps de métier initiaux (idempotent) ───────────────────────────────
INSERT INTO public.trade_directory_trades (name, sort_order, is_active)
SELECT v.name, v.sort_order, TRUE
FROM (VALUES
  ('Maçon', 10),
  ('Aide-maçon', 20),
  ('Coffreur', 30),
  ('Ferrailleur', 40),
  ('Chef d''équipe', 50),
  ('Manœuvre', 60),
  ('Ouvrier polyvalent', 70),
  ('Équipe Gros œuvre', 80),
  ('Équipe Second œuvre', 90),
  ('Plombier', 100),
  ('Électricien', 110),
  ('Électricien courant faible', 120),
  ('Climaticien', 130),
  ('Frigoriste', 140),
  ('Technicien CVC', 150),
  ('Carreleur', 160),
  ('Marbrier', 170),
  ('Poseur de pierre', 180),
  ('Peintre', 190),
  ('Enduiseur', 200),
  ('Étancheur', 210),
  ('Façadier', 220),
  ('Staffeur', 230),
  ('Plaquiste', 240),
  ('Poseur BA13', 250),
  ('Faux plafonnier', 260),
  ('Menuisier bois', 270),
  ('Menuisier aluminium', 280),
  ('Menuisier métallique', 290),
  ('Serrurier', 300),
  ('Ferronnier', 310),
  ('Soudeur', 320),
  ('Vitrier', 330),
  ('Miroitier', 340),
  ('Poseur parquet', 350),
  ('Divers', 999)
) AS v(name, sort_order)
ON CONFLICT (name) DO NOTHING;

-- ── Permissions additives (rôles qui ont déjà sous-traitants) ────────────────
INSERT INTO public.role_permissions (role_id, module_code, submodule_code, action_code, granted)
SELECT DISTINCT rp.role_id, 'sous_traitants', 'annuaire-corps-metier', a.code, true
FROM public.role_permissions rp
CROSS JOIN (VALUES ('voir'), ('creer'), ('modifier'), ('supprimer'), ('valider'), ('exporter')) AS a(code)
WHERE rp.submodule_code = 'sous-traitants'
  AND rp.action_code = 'voir'
  AND rp.granted = true
ON CONFLICT ON CONSTRAINT role_permissions_role_submodule_action_key DO NOTHING;

SELECT 'trade_directory schema OK' AS status;
