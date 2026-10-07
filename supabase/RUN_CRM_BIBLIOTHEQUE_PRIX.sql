-- CITYMO — CRM › Bibliothèque de prix
-- Additif uniquement : droits « voir » + « exporter » sur le nouveau sous-module,
-- donnés aux rôles qui voient déjà les Devis. Aucune table modifiée. Ré-exécutable.

INSERT INTO public.role_permissions (role_id, module_code, submodule_code, action_code, granted)
SELECT DISTINCT rp.role_id, 'crm', 'bibliotheque-prix', a.action_code, true
FROM public.role_permissions rp
CROSS JOIN (VALUES ('voir'), ('exporter')) AS a(action_code)
WHERE rp.submodule_code = 'devis'
  AND rp.action_code = 'voir'
  AND rp.granted = true
ON CONFLICT ON CONSTRAINT role_permissions_role_submodule_action_key DO NOTHING;

SELECT 'crm_bibliotheque_prix OK' AS status;
