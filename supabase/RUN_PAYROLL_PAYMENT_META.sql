-- Référence et mode de paiement pour fiches ouvriers
ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS payment_method TEXT;

NOTIFY pgrst, 'reload schema';
