-- CITYMO — Trim catalogue catégories fournisseurs (liste initiale courte)
-- Additive / idempotent.
-- - Réactive / crée les 33 catégories listées
-- - Désactive les autres (jamais de DELETE hard)
-- - Ne touche pas aux liens fournisseur existants
-- Exécuter dans Supabase SQL Editor après RUN_PURCHASE_SUPPLIER_CATEGORIES.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Upsert liste initiale ────────────────────────────────────────────────────
INSERT INTO public.purchase_supplier_categories (name, slug, sort_order, is_active)
VALUES
  ('Matériaux de construction', 'materiaux-de-construction', 10, true),
  ('Électricité', 'electricite', 20, true),
  ('Plomberie', 'plomberie', 30, true),
  ('Climatisation & Ventilation (CVC)', 'climatisation-ventilation-cvc', 40, true),
  ('Menuiserie Bois', 'menuiserie-bois', 50, true),
  ('Menuiserie Aluminium', 'menuiserie-aluminium', 60, true),
  ('Menuiserie Métallique', 'menuiserie-metallique', 70, true),
  ('Vitrerie', 'vitrerie', 80, true),
  ('Carrelage', 'carrelage', 90, true),
  ('Marbre & Pierre', 'marbre-pierre', 100, true),
  ('Faux plafond', 'faux-plafond', 110, true),
  ('Cloisons sèches (BA13)', 'cloisons-seches-ba13', 120, true),
  ('Peinture', 'peinture', 130, true),
  ('Étanchéité', 'etancheite', 140, true),
  ('Revêtement de sol', 'revetement-de-sol', 150, true),
  ('Sanitaire', 'sanitaire', 160, true),
  ('Quincaillerie', 'quincaillerie', 170, true),
  ('Outillage', 'outillage', 180, true),
  ('Location matériel', 'location-materiel', 190, true),
  ('Engins & Terrassement', 'engins-terrassement', 200, true),
  ('Béton & Préfabriqués', 'beton-prefabriques', 210, true),
  ('Acier & Métallurgie', 'acier-metallurgie', 220, true),
  ('Signalisation & Sécurité', 'signalisation-securite', 230, true),
  ('Mobilier', 'mobilier', 240, true),
  ('Décoration', 'decoration', 250, true),
  ('Éclairage', 'eclairage', 260, true),
  ('Informatique', 'informatique', 270, true),
  ('Fournitures de bureau', 'fournitures-de-bureau', 280, true),
  ('Nettoyage', 'nettoyage', 290, true),
  ('Transport & Logistique', 'transport-logistique', 300, true),
  ('Laboratoire & Contrôle qualité', 'laboratoire-controle-qualite', 310, true),
  ('Topographie', 'topographie', 320, true),
  ('Divers', 'divers', 330, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  is_active = TRUE,
  updated_at = NOW();

-- ── Désactiver tout le reste (affichage uniquement) ──────────────────────────
UPDATE public.purchase_supplier_categories c
SET is_active = FALSE,
    updated_at = NOW()
WHERE c.slug NOT IN (
  'materiaux-de-construction',
  'electricite',
  'plomberie',
  'climatisation-ventilation-cvc',
  'menuiserie-bois',
  'menuiserie-aluminium',
  'menuiserie-metallique',
  'vitrerie',
  'carrelage',
  'marbre-pierre',
  'faux-plafond',
  'cloisons-seches-ba13',
  'peinture',
  'etancheite',
  'revetement-de-sol',
  'sanitaire',
  'quincaillerie',
  'outillage',
  'location-materiel',
  'engins-terrassement',
  'beton-prefabriques',
  'acier-metallurgie',
  'signalisation-securite',
  'mobilier',
  'decoration',
  'eclairage',
  'informatique',
  'fournitures-de-bureau',
  'nettoyage',
  'transport-logistique',
  'laboratoire-controle-qualite',
  'topographie',
  'divers'
);
