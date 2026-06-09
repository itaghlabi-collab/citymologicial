-- =============================================================================
-- Exemple feuille de caisse — JUIN 2026
-- Prérequis : RUN_FINANCE_TRESORERIE.sql exécuté avant
-- =============================================================================

INSERT INTO public.cash_monthly_balances (annee, mois, solde_initial, alimentation, notes)
VALUES (2026, 6, 276.00, 0, 'Exemple juin 2026 — solde mois précédent')
ON CONFLICT (annee, mois) DO UPDATE SET
  solde_initial = EXCLUDED.solde_initial,
  alimentation  = EXCLUDED.alimentation,
  notes         = EXCLUDED.notes;

DELETE FROM public.finance_transactions
WHERE ref_operation LIKE 'EX-JUIN26-%';

INSERT INTO public.finance_transactions
  (date_operation, sens, type_operation, contrepartie, description, montant, mode_paiement, ref_operation, statut)
VALUES
  ('2026-06-02', 'entree', 'alimentation_caisse', '', 'Alimentation caisse', 15000.00, 'Espèces', 'EX-JUIN26-001', 'Validé'),
  ('2026-06-06', 'entree', 'alimentation_caisse', '', 'Alimentation caisse', 20000.00, 'Espèces', 'EX-JUIN26-012', 'Validé'),
  ('2026-06-02', 'sortie', 'autre_sortie', 'mohamed ait lemkadem', 'sac vide pour depot', 200.00, 'Espèces', 'EX-JUIN26-002', 'Validé'),
  ('2026-06-04', 'sortie', 'autre_sortie', 'chaimaa grini', 'plan cadastral 63/206686', 100.00, 'Espèces', 'EX-JUIN26-003', 'Validé'),
  ('2026-06-04', 'sortie', 'autre_sortie', 'chaimaa grini', 'Certificat negatif DIOP', 233.00, 'Espèces', 'EX-JUIN26-004', 'Validé'),
  ('2026-06-04', 'sortie', 'autre_sortie', 'abdelkhalek jerrar', 'carburant', 500.00, 'Espèces', 'EX-JUIN26-005', 'Validé'),
  ('2026-06-05', 'sortie', 'autre_sortie', 'GENERAL', 'FORMATION RH', 2000.00, 'Espèces', 'EX-JUIN26-006', 'Validé'),
  ('2026-06-05', 'sortie', 'autre_sortie', 'SELIM', 'COMMANDE', 1300.00, 'Espèces', 'EX-JUIN26-007', 'Validé'),
  ('2026-06-05', 'sortie', 'autre_sortie', 'ABDELHAFID', 'GENERAL', 200.00, 'Espèces', 'EX-JUIN26-008', 'Validé'),
  ('2026-06-05', 'sortie', 'autre_sortie', 'ABDELHAFID', 'GENERAL', 200.00, 'Espèces', 'EX-JUIN26-009', 'Validé'),
  ('2026-06-05', 'sortie', 'autre_sortie', 'NABIL', 'carburant RENAULT ALINA', 412.00, 'Espèces', 'EX-JUIN26-010', 'Validé'),
  ('2026-06-06', 'sortie', 'autre_sortie', 'mohamed ait lemkadem', 'Paiement', 6300.00, 'Espèces', 'EX-JUIN26-013', 'Validé'),
  ('2026-06-06', 'sortie', 'autre_sortie', 'ABDERRAHIM GOLSSA', 'Paiement', 1800.00, 'Espèces', 'EX-JUIN26-014', 'Validé'),
  ('2026-06-06', 'sortie', 'autre_sortie', 'M.OEUVRES', 'Main d''œuvre', 7548.75, 'Espèces', 'EX-JUIN26-015', 'Validé');

-- Contrôle : doit afficher 14 lignes, solde_mois = 14482.25
SELECT COUNT(*) AS nb_operations FROM public.finance_transactions WHERE ref_operation LIKE 'EX-JUIN26-%';
