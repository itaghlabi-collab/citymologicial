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
