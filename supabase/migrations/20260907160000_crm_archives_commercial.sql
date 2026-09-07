-- CRM Archives — commercial éditable (titre = intitule déjà existant)
ALTER TABLE public.crm_archives ADD COLUMN IF NOT EXISTS commercial TEXT;
