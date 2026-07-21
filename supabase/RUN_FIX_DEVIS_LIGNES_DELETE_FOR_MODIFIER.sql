-- Fix doublons devis (chef de projet / modifier sans supprimer)
-- Cause : DELETE sur crm_devis_lignes exigeait erp_can('supprimer','devis').
-- Chef de projet a creer+modifier mais pas supprimer → delete silencieux (0 ligne)
-- puis INSERT → doublons à chaque « Enregistrer le devis ».
--
-- À coller dans le SQL Editor Supabase (PRODUCTION).

-- 1) Remplacement des lignes = partie de « modifier » le devis
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'crm_devis_lignes'
      AND policyname = 'crm_devis_lignes_delete'
  ) THEN
    DROP POLICY crm_devis_lignes_delete ON public.crm_devis_lignes;
  END IF;

  CREATE POLICY crm_devis_lignes_delete ON public.crm_devis_lignes
    FOR DELETE TO authenticated
    USING (
      public.erp_can('supprimer', 'devis')
      OR public.erp_can('modifier', 'devis')
    );
END $$;

-- 2) (Optionnel) Si une ancienne policy « all » coexiste, ne rien casser :
-- les policies RLS sont en OR ; le DELETE ci-dessus suffit pour le replace.

SELECT 'crm_devis_lignes DELETE : modifier OU supprimer — OK' AS status;
