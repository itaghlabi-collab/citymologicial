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
