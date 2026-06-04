-- Propositions marketing — champs dédiés (marque/compte, type proposition)
-- À exécuter après 20260525940000_propositions_marketing.sql

ALTER TABLE public.propositions_marketing ADD COLUMN IF NOT EXISTS marque_compte TEXT;
ALTER TABLE public.propositions_marketing ADD COLUMN IF NOT EXISTS type_proposition TEXT;

CREATE INDEX IF NOT EXISTS idx_propositions_marketing_marque_compte ON public.propositions_marketing(marque_compte);
CREATE INDEX IF NOT EXISTS idx_propositions_marketing_type_proposition ON public.propositions_marketing(type_proposition);
