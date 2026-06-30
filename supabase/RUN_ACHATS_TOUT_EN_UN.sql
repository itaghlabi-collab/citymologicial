-- =============================================================================
-- CITYMO — MODULE ACHATS UNIQUEMENT (un seul copier-coller)
-- Supabase → SQL Editor → New query → Coller TOUT → Run
--
-- Contenu :
--   1. Fournisseurs (purchase_suppliers)
--   2. Bons de commande (purchase_orders)
--   3. Workflow complet : demandes d'achat, devis, historique, ordres d'achat
--   4. Notifications (alertes DG / Chargée d'achats — pas le module Inventaire)
--
-- Idempotent : ré-exécutable sans supprimer vos données.
--
-- Prérequis EXTERNES (autres modules, pas inclus ici) :
--   • public.projects      → lien projet sur une demande d'achat
--   • public.employees     → responsable achats (LAILA WOTFI)
--   • public.payment_orders → ordres de paiement créés à la validation DG
--     (module Finance — si absent, le script continue ; les OP seront créés
--      quand Finance sera installé)
--
-- PAS D'INVENTAIRE dans ce fichier.
-- Le seul lien futur avec l'inventaire : quand une commande est « Réceptionnée »,
-- le magasin peut enregistrer l'entrée stock (module séparé, script séparé).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

-- ── Vérification prérequis (avertissement seulement) ───────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'projects'
  ) THEN
    RAISE NOTICE 'ATTENTION : table projects absente — renseignez le projet manuellement ou exécutez RUN_PROJECTS_NOW.sql';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'employees'
  ) THEN
    RAISE NOTICE 'ATTENTION : table employees absente — responsable achats non résolu automatiquement';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payment_orders'
  ) THEN
    RAISE NOTICE 'ATTENTION : table payment_orders absente — exécutez le script Finance pour les ordres de paiement';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. FOURNISSEURS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.purchase_suppliers (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name              TEXT NOT NULL,
  ice                       TEXT,
  rc                        TEXT,
  tax_id                    TEXT,
  phone                     TEXT,
  email                     TEXT,
  address                   TEXT,
  city                      TEXT,
  main_contact              TEXT,
  contact_role              TEXT,
  contact_phone             TEXT,
  contact_email             TEXT,
  supplier_category         TEXT,
  payment_terms             TEXT,
  preferred_payment_method  TEXT DEFAULT 'Virement',
  rib                       TEXT,
  bank                      TEXT,
  status                    TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  notes                     TEXT,
  created_by                UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_suppliers_company_name
  ON public.purchase_suppliers (lower(trim(company_name)));
CREATE INDEX IF NOT EXISTS idx_purchase_suppliers_status
  ON public.purchase_suppliers (status);

DROP TRIGGER IF EXISTS purchase_suppliers_updated_at ON public.purchase_suppliers;
CREATE TRIGGER purchase_suppliers_updated_at
  BEFORE UPDATE ON public.purchase_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.purchase_suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_suppliers_select_auth ON public.purchase_suppliers;
CREATE POLICY purchase_suppliers_select_auth ON public.purchase_suppliers
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS purchase_suppliers_insert_auth ON public.purchase_suppliers;
CREATE POLICY purchase_suppliers_insert_auth ON public.purchase_suppliers
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS purchase_suppliers_update_auth ON public.purchase_suppliers;
CREATE POLICY purchase_suppliers_update_auth ON public.purchase_suppliers
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS purchase_suppliers_delete_auth ON public.purchase_suppliers;
CREATE POLICY purchase_suppliers_delete_auth ON public.purchase_suppliers
  FOR DELETE TO authenticated USING (true);
GRANT ALL ON public.purchase_suppliers TO authenticated, service_role;

DO $migrate$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'achat_suppliers'
  ) THEN
    INSERT INTO public.purchase_suppliers (
      company_name, ice, rc, tax_id, phone, email, address, city,
      main_contact, supplier_category, preferred_payment_method, rib, bank,
      status, notes, created_by, created_at, updated_at
    )
    SELECT
      a.raison_sociale, a.ice, a.rc, a.if_field, a.telephone, a.email,
      a.adresse, a.ville, a.contact, a.categorie, a.mode_paiement, a.rib, a.banque,
      CASE
        WHEN lower(coalesce(a.statut, '')) IN ('inactif', 'inactive') THEN 'inactive'
        WHEN lower(coalesce(a.statut, '')) IN ('archivé', 'archive', 'archived') THEN 'archived'
        ELSE 'active'
      END,
      a.notes, a.created_by, a.created_at, a.updated_at
    FROM public.achat_suppliers a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.purchase_suppliers p
      WHERE lower(trim(p.company_name)) = lower(trim(a.raison_sociale))
        AND coalesce(p.ice, '') = coalesce(a.ice, '')
    );
  END IF;
END $migrate$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. BONS DE COMMANDE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_bc          TEXT,
  supplier_id     UUID REFERENCES public.purchase_suppliers(id) ON DELETE SET NULL,
  supplier_name   TEXT,
  order_date      DATE,
  delivery_date   DATE,
  currency        TEXT NOT NULL DEFAULT 'MAD',
  note            TEXT,
  status          TEXT NOT NULL DEFAULT 'Brouillon',
  subtotal_ht     NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_vat       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_ttc       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  lines           JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.purchase_suppliers(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS supplier_name TEXT;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS order_date DATE;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS delivery_date DATE;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'MAD';
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS subtotal_ht NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS total_vat NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS total_ttc NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS lines JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON public.purchase_orders (status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id ON public.purchase_orders (supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_at ON public.purchase_orders (created_at DESC);

DROP TRIGGER IF EXISTS purchase_orders_updated_at ON public.purchase_orders;
CREATE TRIGGER purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_orders_select_auth ON public.purchase_orders;
CREATE POLICY purchase_orders_select_auth ON public.purchase_orders
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS purchase_orders_insert_auth ON public.purchase_orders;
CREATE POLICY purchase_orders_insert_auth ON public.purchase_orders
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS purchase_orders_update_auth ON public.purchase_orders;
CREATE POLICY purchase_orders_update_auth ON public.purchase_orders
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS purchase_orders_delete_auth ON public.purchase_orders;
CREATE POLICY purchase_orders_delete_auth ON public.purchase_orders
  FOR DELETE TO authenticated USING (true);
GRANT ALL ON public.purchase_orders TO authenticated, service_role;

DO $migrate$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'achat_purchase_orders'
  ) THEN
    INSERT INTO public.purchase_orders (
      ref_bc, supplier_id, supplier_name, order_date, note, status,
      total_ttc, lines, payload, created_by, created_at, updated_at
    )
    SELECT
      a.ref_bc, ps.id, COALESCE(ps.company_name, ''), a.date_commande, a.notes, a.statut,
      COALESCE(a.montant, 0), COALESCE(a.payload->'lignes', '[]'::jsonb),
      COALESCE(a.payload, '{}'::jsonb), a.created_by, a.created_at, a.updated_at
    FROM public.achat_purchase_orders a
    LEFT JOIN public.purchase_suppliers ps ON ps.id = a.supplier_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.purchase_orders p
      WHERE p.ref_bc IS NOT NULL AND p.ref_bc = a.ref_bc
    );
  END IF;
END $migrate$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. WORKFLOW DEMANDES D'ACHAT (DA → devis → OA → OP)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.purchase_requests (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_demande             TEXT,
  titre                   TEXT NOT NULL,
  priorite                TEXT NOT NULL DEFAULT 'Normale',
  statut                  TEXT NOT NULL DEFAULT 'Brouillon',
  date_debut              DATE,
  date_limite             DATE,
  description             TEXT,
  department              TEXT NOT NULL DEFAULT 'ACHATS',
  project_id              UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  project_ref             TEXT,
  project_name            TEXT,
  assigned_employee_id    UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  assigned_employee_name  TEXT,
  payload                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS project_ref TEXT;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS project_name TEXT;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT 'ACHATS';
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS assigned_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS assigned_employee_name TEXT;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS requester_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS requester_name TEXT;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS selected_quote_id UUID;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS acquisition_order_id UUID;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS payment_order_id UUID;
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS commentaires_internes TEXT;

CREATE INDEX IF NOT EXISTS idx_purchase_requests_statut ON public.purchase_requests (statut);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_project_id ON public.purchase_requests (project_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_department ON public.purchase_requests (department);

DROP TRIGGER IF EXISTS purchase_requests_updated_at ON public.purchase_requests;
CREATE TRIGGER purchase_requests_updated_at
  BEFORE UPDATE ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_requests_select_auth ON public.purchase_requests;
CREATE POLICY purchase_requests_select_auth ON public.purchase_requests
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS purchase_requests_insert_auth ON public.purchase_requests;
CREATE POLICY purchase_requests_insert_auth ON public.purchase_requests
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS purchase_requests_update_auth ON public.purchase_requests;
CREATE POLICY purchase_requests_update_auth ON public.purchase_requests
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS purchase_requests_delete_auth ON public.purchase_requests;
CREATE POLICY purchase_requests_delete_auth ON public.purchase_requests
  FOR DELETE TO authenticated USING (true);
GRANT ALL ON public.purchase_requests TO authenticated, service_role;

-- Devis fournisseurs (comparatif dans chaque demande)
CREATE TABLE IF NOT EXISTS public.purchase_request_quotes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_request_id   UUID NOT NULL REFERENCES public.purchase_requests(id) ON DELETE CASCADE,
  supplier_id           UUID REFERENCES public.purchase_suppliers(id) ON DELETE SET NULL,
  supplier_name         TEXT NOT NULL,
  montant_ht            NUMERIC(14,2) NOT NULL DEFAULT 0,
  tva_rate              NUMERIC(5,2) NOT NULL DEFAULT 20,
  montant_ttc           NUMERIC(14,2) NOT NULL DEFAULT 0,
  delai                 TEXT,
  validite              TEXT,
  conditions_paiement   TEXT,
  garantie              TEXT,
  observations          TEXT,
  attachment_url        TEXT,
  statut                TEXT NOT NULL DEFAULT 'Actif',
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.purchase_request_quotes ADD COLUMN IF NOT EXISTS ref_devis_fournisseur TEXT;
CREATE INDEX IF NOT EXISTS idx_prq_request ON public.purchase_request_quotes (purchase_request_id);
CREATE INDEX IF NOT EXISTS idx_prq_statut ON public.purchase_request_quotes (statut);

-- Historique traçabilité
CREATE TABLE IF NOT EXISTS public.purchase_request_history (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_request_id   UUID NOT NULL REFERENCES public.purchase_requests(id) ON DELETE CASCADE,
  action                TEXT NOT NULL,
  detail                TEXT,
  user_id               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name             TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.purchase_request_history ADD COLUMN IF NOT EXISTS commentaire TEXT;
CREATE INDEX IF NOT EXISTS idx_prh_request ON public.purchase_request_history (purchase_request_id);

-- Ordres d'achat (OA)
CREATE TABLE IF NOT EXISTS public.purchase_acquisition_orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_oa                TEXT,
  purchase_request_id   UUID REFERENCES public.purchase_requests(id) ON DELETE SET NULL,
  quote_id              UUID REFERENCES public.purchase_request_quotes(id) ON DELETE SET NULL,
  supplier_id           UUID REFERENCES public.purchase_suppliers(id) ON DELETE SET NULL,
  supplier_name         TEXT,
  project_id            UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  project_ref           TEXT,
  project_name          TEXT,
  objet                 TEXT,
  montant_ht            NUMERIC(14,2) NOT NULL DEFAULT 0,
  tva_rate              NUMERIC(5,2) NOT NULL DEFAULT 20,
  montant_ttc           NUMERIC(14,2) NOT NULL DEFAULT 0,
  delai                 TEXT,
  conditions_paiement   TEXT,
  garantie              TEXT,
  mode_paiement         TEXT,
  date_livraison        DATE,
  statut                TEXT NOT NULL DEFAULT 'Brouillon',
  payment_order_id      UUID,
  lines                 JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.purchase_acquisition_orders ADD COLUMN IF NOT EXISTS purchase_request_ref TEXT;
ALTER TABLE public.purchase_acquisition_orders ADD COLUMN IF NOT EXISTS responsable_achats TEXT;
ALTER TABLE public.purchase_acquisition_orders ADD COLUMN IF NOT EXISTS attachment_url TEXT;
CREATE INDEX IF NOT EXISTS idx_pao_request ON public.purchase_acquisition_orders (purchase_request_id);
CREATE INDEX IF NOT EXISTS idx_pao_statut ON public.purchase_acquisition_orders (statut);

DO $fk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_requests_selected_quote_id_fkey') THEN
    ALTER TABLE public.purchase_requests
      ADD CONSTRAINT purchase_requests_selected_quote_id_fkey
      FOREIGN KEY (selected_quote_id) REFERENCES public.purchase_request_quotes(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_requests_acquisition_order_id_fkey') THEN
    ALTER TABLE public.purchase_requests
      ADD CONSTRAINT purchase_requests_acquisition_order_id_fkey
      FOREIGN KEY (acquisition_order_id) REFERENCES public.purchase_acquisition_orders(id) ON DELETE SET NULL;
  END IF;
END $fk$;

-- Liens Finance (ordres de paiement) — sans installer le module Finance ici
DO $po$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payment_orders'
  ) THEN
    ALTER TABLE public.payment_orders
      ADD COLUMN IF NOT EXISTS purchase_request_id UUID REFERENCES public.purchase_requests(id) ON DELETE SET NULL;
    ALTER TABLE public.payment_orders
      ADD COLUMN IF NOT EXISTS purchase_acquisition_order_id UUID REFERENCES public.purchase_acquisition_orders(id) ON DELETE SET NULL;
    ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS montant_ht NUMERIC(14,2);
    ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS tva_rate NUMERIC(5,2);
    ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS purchase_request_ref TEXT;
    ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS purchase_oa_ref TEXT;
  END IF;
END $po$;

-- Migration libellés statuts workflow
UPDATE public.purchase_requests SET statut = 'Soumise' WHERE statut = 'En attente';
UPDATE public.purchase_requests SET statut = 'En étude' WHERE statut IN ('En cours', 'En étude Achats');
UPDATE public.purchase_requests SET statut = 'En attente validation DG' WHERE statut = 'En validation DG';
UPDATE public.purchase_requests SET statut = 'Devis validé' WHERE statut = 'Validée';
UPDATE public.purchase_requests SET statut = 'Commande envoyée' WHERE statut = 'Commande en cours';
UPDATE public.purchase_requests SET statut = 'Réceptionnée' WHERE statut = 'Commande reçue';
UPDATE public.purchase_requests SET statut = 'Clôturée' WHERE statut = 'Terminée';
UPDATE public.purchase_requests
SET assigned_employee_name = 'LAILA WOTFI — Chargée d''Achats'
WHERE COALESCE(assigned_employee_name, '') = '';

DROP TRIGGER IF EXISTS purchase_request_quotes_updated_at ON public.purchase_request_quotes;
CREATE TRIGGER purchase_request_quotes_updated_at
  BEFORE UPDATE ON public.purchase_request_quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS purchase_acquisition_orders_updated_at ON public.purchase_acquisition_orders;
CREATE TRIGGER purchase_acquisition_orders_updated_at
  BEFORE UPDATE ON public.purchase_acquisition_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.purchase_request_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_request_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_acquisition_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prq_auth ON public.purchase_request_quotes;
CREATE POLICY prq_auth ON public.purchase_request_quotes FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS prh_auth ON public.purchase_request_history;
CREATE POLICY prh_auth ON public.purchase_request_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS pao_auth ON public.purchase_acquisition_orders;
CREATE POLICY pao_auth ON public.purchase_acquisition_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.purchase_request_quotes TO authenticated, service_role;
GRANT ALL ON public.purchase_request_history TO authenticated, service_role;
GRANT ALL ON public.purchase_acquisition_orders TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. NOTIFICATIONS (cloche ERP — alertes workflow Achats uniquement ici)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_role text,
  title text NOT NULL,
  message text,
  type text NOT NULL DEFAULT 'system',
  priority text NOT NULL DEFAULT 'normal',
  entity_type text,
  entity_id uuid,
  action_url text,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_priority_check CHECK (
    priority IN ('low', 'normal', 'high', 'urgent')
  ),
  CONSTRAINT notifications_type_check CHECK (
    type IN ('payment', 'task', 'cash_review', 'leave_request', 'purchase_request', 'document', 'system', 'resource_request')
  )
);

CREATE INDEX IF NOT EXISTS notifications_recipient_user_idx
  ON public.notifications (recipient_user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_recipient_role_idx
  ON public.notifications (recipient_role, is_read, created_at DESC)
  WHERE recipient_role IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_created_at_idx
  ON public.notifications (created_at DESC);

-- Doublons existants : garder la notification la plus récente avant index unique
DELETE FROM public.notifications
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY recipient_user_id, entity_type, entity_id, type
        ORDER BY created_at DESC, id DESC
      ) AS rn
    FROM public.notifications
    WHERE recipient_user_id IS NOT NULL
      AND entity_type IS NOT NULL
      AND entity_id IS NOT NULL
  ) sub
  WHERE sub.rn > 1
);

DELETE FROM public.notifications
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY recipient_role, entity_type, entity_id, type
        ORDER BY created_at DESC, id DESC
      ) AS rn
    FROM public.notifications
    WHERE recipient_user_id IS NULL
      AND recipient_role IS NOT NULL
      AND entity_type IS NOT NULL
      AND entity_id IS NOT NULL
  ) sub
  WHERE sub.rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_user_idx
  ON public.notifications (recipient_user_id, entity_type, entity_id, type)
  WHERE recipient_user_id IS NOT NULL AND entity_type IS NOT NULL AND entity_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_role_idx
  ON public.notifications (recipient_role, entity_type, entity_id, type)
  WHERE recipient_user_id IS NULL AND recipient_role IS NOT NULL
    AND entity_type IS NOT NULL AND entity_id IS NOT NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select ON public.notifications
  FOR SELECT TO authenticated
  USING (
    recipient_user_id = auth.uid()
    OR (
      recipient_role IS NOT NULL
      AND lower(trim(recipient_role)) = lower(trim(COALESCE(
        (SELECT role FROM public.profiles WHERE id = auth.uid()), ''
      )))
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          lower(replace(p.role, ' ', '_')) = 'super_admin'
          OR lower(p.email) IN ('selim.moumni@citymo.ma', 'selim.moumni@gmail.com')
        )
    )
  );
DROP POLICY IF EXISTS notifications_insert ON public.notifications;
CREATE POLICY notifications_insert ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS notifications_update ON public.notifications;
CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (
    recipient_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          lower(replace(p.role, ' ', '_')) = 'super_admin'
          OR lower(p.email) IN ('selim.moumni@citymo.ma', 'selim.moumni@gmail.com')
        )
    )
  )
  WITH CHECK (true);
GRANT ALL ON public.notifications TO authenticated, service_role;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- FIN — rechargement API + contrôle
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

SELECT 'ACHATS OK' AS status;

SELECT 'purchase_suppliers' AS table_name, COUNT(*)::int AS lignes FROM public.purchase_suppliers
UNION ALL SELECT 'purchase_orders', COUNT(*)::int FROM public.purchase_orders
UNION ALL SELECT 'purchase_requests', COUNT(*)::int FROM public.purchase_requests
UNION ALL SELECT 'purchase_request_quotes', COUNT(*)::int FROM public.purchase_request_quotes
UNION ALL SELECT 'purchase_acquisition_orders', COUNT(*)::int FROM public.purchase_acquisition_orders
UNION ALL SELECT 'notifications', COUNT(*)::int FROM public.notifications
ORDER BY table_name;
