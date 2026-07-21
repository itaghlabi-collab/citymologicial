-- Fix : DELETE crm_devis_lignes autorisé pour modifier OU supprimer (anti-doublons Enregistrer)
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
