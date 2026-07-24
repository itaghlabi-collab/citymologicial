-- CITYMO — Demandes d'engin de location (module Projets)
-- Exécuter dans Supabase SQL Editor si besoin : RUN_EQUIPMENT_RENTAL_REQUESTS.sql

CREATE TABLE IF NOT EXISTS public.equipment_rental_requests (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference               TEXT NOT NULL UNIQUE,
  projet_id               UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  projet_lie_id           UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  projet_nom              TEXT,
  projet_lie_nom          TEXT,
  demandeur_id            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  demandeur_nom           TEXT,
  demandeur_fonction      TEXT,
  type_engin              TEXT NOT NULL,
  type_engin_autre        TEXT,
  date_demande            DATE NOT NULL DEFAULT CURRENT_DATE,
  date_debut_souhaitee    DATE NOT NULL,
  duree_prevue            NUMERIC(10,2) NOT NULL DEFAULT 1,
  unite_duree             TEXT NOT NULL DEFAULT 'journee',
  quantite                INT NOT NULL DEFAULT 1,
  motif_travaux           TEXT NOT NULL,
  niveau_urgence          TEXT NOT NULL DEFAULT 'normal',
  avec_chauffeur          BOOLEAN NOT NULL DEFAULT FALSE,
  observation             TEXT NOT NULL DEFAULT '',
  statut                  TEXT NOT NULL DEFAULT 'brouillon',
  motif_refus             TEXT,
  motif_annulation        TEXT,
  created_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at             TIMESTAMPTZ,
  CONSTRAINT equipment_rental_requests_statut_check CHECK (
    statut IN (
      'brouillon', 'envoyee', 'en_cours', 'validee',
      'refusee', 'traitee', 'annulee', 'archivee'
    )
  ),
  CONSTRAINT equipment_rental_requests_urgence_check CHECK (
    niveau_urgence IN ('normal', 'urgent', 'tres_urgent')
  ),
  CONSTRAINT equipment_rental_requests_unite_check CHECK (
    unite_duree IN ('heure', 'demi_journee', 'journee', 'semaine', 'mois')
  ),
  CONSTRAINT equipment_rental_requests_qty_check CHECK (quantite >= 1),
  CONSTRAINT equipment_rental_requests_duree_check CHECK (duree_prevue > 0)
);

CREATE TABLE IF NOT EXISTS public.equipment_rental_request_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demande_id      UUID NOT NULL REFERENCES public.equipment_rental_requests(id) ON DELETE CASCADE,
  utilisateur_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  utilisateur_nom TEXT,
  action          TEXT NOT NULL,
  ancien_statut   TEXT,
  nouveau_statut  TEXT,
  commentaire     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eq_rental_req_projet ON public.equipment_rental_requests(projet_id);
CREATE INDEX IF NOT EXISTS idx_eq_rental_req_statut ON public.equipment_rental_requests(statut);
CREATE INDEX IF NOT EXISTS idx_eq_rental_req_date ON public.equipment_rental_requests(date_demande DESC);
CREATE INDEX IF NOT EXISTS idx_eq_rental_req_demandeur ON public.equipment_rental_requests(demandeur_id);
CREATE INDEX IF NOT EXISTS idx_eq_rental_hist_demande ON public.equipment_rental_request_history(demande_id);

ALTER TABLE public.equipment_rental_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_rental_request_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS equipment_rental_requests_auth ON public.equipment_rental_requests;
CREATE POLICY equipment_rental_requests_auth ON public.equipment_rental_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS equipment_rental_request_history_auth ON public.equipment_rental_request_history;
CREATE POLICY equipment_rental_request_history_auth ON public.equipment_rental_request_history
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.equipment_rental_requests TO authenticated, service_role;
GRANT ALL ON public.equipment_rental_request_history TO authenticated, service_role;

-- Étendre le type notification si la table existe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notifications'
  ) THEN
    ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
    ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
      type IN (
        'payment', 'task', 'cash_review', 'leave_request', 'purchase_request',
        'document', 'system', 'resource_request', 'site_material_request',
        'appointment', 'equipment_rental_request'
      )
    );
  END IF;
END $$;

SELECT 'equipment_rental_requests OK' AS status;

-- Optionnel : accorder les droits du sous-module aux rôles métier
-- (Admin → Rôles fonctionne aussi sans ce bloc)
DO $$
DECLARE
  r RECORD;
  acts TEXT[] := ARRAY['voir', 'creer', 'modifier', 'supprimer', 'valider', 'exporter'];
  a TEXT;
BEGIN
  FOR r IN
    SELECT id, code FROM public.erp_roles
    WHERE code IN ('super_admin', 'dg', 'chef_projet', 'chef_chantier', 'achats', 'logistique', 'employe')
  LOOP
    FOREACH a IN ARRAY acts LOOP
      INSERT INTO public.role_permissions (role_id, module_code, submodule_code, action_code, granted)
      VALUES (r.id, 'projets', 'demandes-engins', a, true)
      ON CONFLICT ON CONSTRAINT role_permissions_role_submodule_action_key DO NOTHING;
    END LOOP;
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'role_permissions seed skipped: %', SQLERRM;
END $$;
