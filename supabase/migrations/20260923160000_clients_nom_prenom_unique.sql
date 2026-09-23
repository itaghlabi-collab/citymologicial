-- Unicité clients : nom + prénom (au lieu de nom seul)

DROP INDEX IF EXISTS public.idx_clients_nom_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_nom_prenom_unique
  ON public.clients (lower(trim(nom)), lower(trim(coalesce(prenom, ''))));
