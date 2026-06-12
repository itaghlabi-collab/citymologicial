-- =============================================================================
-- CITYMO — Import initial Sous-traitants (10 fiches)
-- Supabase Dashboard → SQL Editor → coller tout → Run
-- Prérequis : RUN_SUBCONTRACTORS.sql déjà exécuté
-- Idempotent : upsert sur numero_cin via _citymo_upsert_subcontractor
-- =============================================================================

BEGIN;

-- Supprimer l'enregistrement de test éventuel (exemple CIN123)
DELETE FROM public.subcontractors
WHERE UPPER(TRIM(COALESCE(numero_cin, ''))) = 'CIN123';

SELECT public._citymo_upsert_subcontractor(
  'MOHAMED', 'BOUHLIK', 'MANŒUVRE', 'P142539', NULL, NULL, NULL,
  'HAY SALAM BLOC 3 N 172 OUARZAZATE', NULL, NULL, 'actif', 'Rémunération : À la tâche'
);

SELECT public._citymo_upsert_subcontractor(
  'KHALID', 'EL HAJIRI', 'FERRAILLEUR', 'W312056', NULL, NULL, NULL,
  'HAY BKAKCHA MOUILHA 02 EL BROUJ SETTAT', NULL, NULL, 'actif', 'Rémunération : À la tâche'
);

SELECT public._citymo_upsert_subcontractor(
  'BRAHIM', 'MAHFOUD', 'COFFREUR', 'I585740', NULL, NULL, NULL,
  'DR TAOUNZA AZILAL', NULL, NULL, 'actif', 'Rémunération : À la tâche'
);

SELECT public._citymo_upsert_subcontractor(
  'AHMED', 'BENHADDI', 'FERRAILLEUR', 'HA137239', NULL, NULL, NULL,
  'RES AL HAMD 2 IMM12 ETG3 GH2 NR15 BOUSKOURA NOUACEUR', NULL, NULL, 'actif', 'Rémunération : À la tâche'
);

SELECT public._citymo_upsert_subcontractor(
  'MOAIZ', 'MOHAMED', 'COFFREUR', 'M633200', NULL, NULL, NULL,
  'DR OD BEN CHAOUI CR OD GHANEM EL JADIDA', NULL, NULL, 'actif', 'Rémunération : À la tâche'
);

SELECT public._citymo_upsert_subcontractor(
  'HAJAMI', 'MOHAMED', 'RESPONSABLE FAÇADE', 'GN212365DR', NULL, NULL, NULL,
  'LAHMIDIENNE EL MERJA DAR ASLOUJI BELKSIRI', NULL, NULL, 'actif', 'Rémunération : À la tâche'
);

SELECT public._citymo_upsert_subcontractor(
  'HICHAM', 'EL AQLI', 'ÉLECTRICIEN', 'W434851', NULL, NULL, NULL,
  NULL, NULL, NULL, 'actif', 'Rémunération : À la tâche'
);

SELECT public._citymo_upsert_subcontractor(
  'AHMED', 'EL AAOUNI', 'CARRELEUR', 'BK354428', NULL, NULL, NULL,
  'DOIUAR OLD BELAHCEN HARET EL GHABA OLD AZZOUZ NOUACEUR CASA', NULL, NULL, 'actif', 'Rémunération : À la tâche'
);

SELECT public._citymo_upsert_subcontractor(
  'YASSINE', 'BOIGUER', 'BA13', 'PA135060', NULL, NULL, NULL,
  'IKISS IKNIOUNE TINGHIR', NULL, NULL, 'actif', 'Rémunération : À la tâche'
);

SELECT public._citymo_upsert_subcontractor(
  'AYOUB', 'FOUAD', 'INSTALLATEUR CAMÉRA & RÉSEAU', 'PB212789', NULL, NULL, NULL,
  NULL, NULL, NULL, 'actif', NULL
);

COMMIT;

NOTIFY pgrst, 'reload schema';

SELECT id, prenom, nom, fonction, numero_cin, adresse, notes, statut
FROM public.subcontractors
ORDER BY nom, prenom;
