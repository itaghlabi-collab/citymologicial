-- Finance, Achats, Inventaire, GED — persistance Supabase (parité localhost / Vercel)

-- ── Finance ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.charge_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom             TEXT NOT NULL,
  description     TEXT,
  statut          TEXT NOT NULL DEFAULT 'Active',
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.finance_charges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_charge     DATE NOT NULL DEFAULT CURRENT_DATE,
  libelle         TEXT NOT NULL,
  categorie       TEXT,
  montant         NUMERIC(14,2) NOT NULL DEFAULT 0,
  fournisseur     TEXT,
  projet_lie      TEXT,
  departement     TEXT,
  mode_paiement   TEXT DEFAULT 'Virement',
  ref_paiement    TEXT,
  statut          TEXT NOT NULL DEFAULT 'Brouillon',
  commentaire     TEXT,
  validateur      TEXT,
  ref_charge      TEXT,
  justificatifs   JSONB DEFAULT '[]'::jsonb,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payment_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_ordre       TEXT,
  beneficiaire    TEXT,
  montant         NUMERIC(14,2) NOT NULL DEFAULT 0,
  date_ordre      DATE NOT NULL DEFAULT CURRENT_DATE,
  date_echeance   DATE,
  statut          TEXT NOT NULL DEFAULT 'En attente',
  mode_paiement   TEXT DEFAULT 'Virement',
  banque          TEXT,
  rib             TEXT,
  motif           TEXT,
  charge_id       UUID REFERENCES public.finance_charges(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Achats ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.achat_suppliers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raison_sociale  TEXT NOT NULL,
  contact         TEXT,
  telephone       TEXT,
  email           TEXT,
  ice             TEXT,
  rc              TEXT,
  if_field        TEXT,
  adresse         TEXT,
  ville           TEXT,
  pays            TEXT DEFAULT 'Maroc',
  mode_paiement   TEXT DEFAULT 'Virement',
  banque          TEXT,
  rib             TEXT,
  categorie       TEXT,
  notes           TEXT,
  favori          BOOLEAN NOT NULL DEFAULT FALSE,
  statut          TEXT NOT NULL DEFAULT 'Actif',
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.achat_purchase_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_demande     TEXT,
  objet           TEXT NOT NULL,
  demandeur       TEXT,
  departement     TEXT,
  projet_lie      TEXT,
  montant_estime  NUMERIC(14,2) DEFAULT 0,
  statut          TEXT NOT NULL DEFAULT 'Brouillon',
  date_demande    DATE NOT NULL DEFAULT CURRENT_DATE,
  notes           TEXT,
  payload         JSONB DEFAULT '{}'::jsonb,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.achat_purchase_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_bc          TEXT,
  supplier_id     UUID REFERENCES public.achat_suppliers(id) ON DELETE SET NULL,
  objet           TEXT,
  montant         NUMERIC(14,2) DEFAULT 0,
  statut          TEXT NOT NULL DEFAULT 'Brouillon',
  date_commande   DATE NOT NULL DEFAULT CURRENT_DATE,
  notes           TEXT,
  payload         JSONB DEFAULT '{}'::jsonb,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Inventaire ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom             TEXT NOT NULL,
  description     TEXT,
  statut          TEXT NOT NULL DEFAULT 'Active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_articles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference       TEXT,
  nom             TEXT NOT NULL,
  categorie       TEXT,
  unite           TEXT DEFAULT 'U',
  prix_unitaire   NUMERIC(14,2) DEFAULT 0,
  seuil_alerte    NUMERIC(14,2) DEFAULT 0,
  statut          TEXT NOT NULL DEFAULT 'Active',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_warehouses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom             TEXT NOT NULL,
  type_depot      TEXT DEFAULT 'Depot',
  projet_lie      TEXT,
  adresse         TEXT,
  responsable     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_mouvement   TEXT,
  type_mouvement  TEXT NOT NULL DEFAULT 'Entree',
  article_id      UUID REFERENCES public.stock_articles(id) ON DELETE SET NULL,
  warehouse_id    UUID REFERENCES public.stock_warehouses(id) ON DELETE SET NULL,
  quantite        NUMERIC(14,3) NOT NULL DEFAULT 0,
  date_mouvement  DATE NOT NULL DEFAULT CURRENT_DATE,
  motif           TEXT,
  payload         JSONB DEFAULT '{}'::jsonb,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── GED Documents ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ged_folders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom             TEXT NOT NULL,
  parent_id       UUID REFERENCES public.ged_folders(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ged_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom             TEXT NOT NULL,
  categorie       TEXT,
  dossier         TEXT,
  folder_id       UUID REFERENCES public.ged_folders(id) ON DELETE SET NULL,
  projet_lie      TEXT,
  client_lie      TEXT,
  departement     TEXT,
  tags            TEXT,
  description     TEXT,
  niveau_acces    TEXT DEFAULT 'Équipe',
  type_fichier    TEXT DEFAULT 'PDF',
  taille_octets   BIGINT DEFAULT 0,
  storage_path    TEXT,
  favori          BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at      TIMESTAMPTZ,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ged_shares (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID REFERENCES public.ged_documents(id) ON DELETE CASCADE,
  partage_avec    TEXT,
  niveau_acces    TEXT DEFAULT 'Lecture',
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ged_public_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID REFERENCES public.ged_documents(id) ON DELETE CASCADE,
  token           TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  expire_at       TIMESTAMPTZ,
  actif           BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Triggers updated_at (réutilise set_updated_at si présent)
DO $do$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'charge_categories','finance_charges','payment_orders',
    'achat_suppliers','achat_purchase_requests','achat_purchase_orders',
    'stock_categories','stock_articles','stock_warehouses','stock_movements',
    'ged_documents'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      t, t
    );
  END LOOP;
END $do$;

-- RLS
DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'charge_categories','finance_charges','payment_orders',
    'achat_suppliers','achat_purchase_requests','achat_purchase_orders',
    'stock_categories','stock_articles','stock_warehouses','stock_movements',
    'ged_folders','ged_documents','ged_shares','ged_public_links'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_all_auth ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_all_auth ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t, t
    );
    EXECUTE format('GRANT ALL ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $rls$;

-- Bucket GED
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'citymo-documents',
  'citymo-documents',
  false,
  52428800,
  ARRAY['application/pdf','image/jpeg','image/png','image/webp','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/zip']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS citymo_documents_storage_select ON storage.objects;
CREATE POLICY citymo_documents_storage_select ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'citymo-documents');

DROP POLICY IF EXISTS citymo_documents_storage_insert ON storage.objects;
CREATE POLICY citymo_documents_storage_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'citymo-documents');

DROP POLICY IF EXISTS citymo_documents_storage_delete ON storage.objects;
CREATE POLICY citymo_documents_storage_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'citymo-documents');
