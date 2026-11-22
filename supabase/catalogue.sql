-- Vitrine publique : à coller une fois dans Supabase > SQL Editor > New query > Run.
-- Ne laisse sortir que ce qu'un client doit voir : nom, catégorie, photo, disponible ou non.
-- Prix d'achat, prix de vente, quantités, ventes, caisse et factures restent privés.

create or replace view public.catalogue as
select
  id,
  data->>'nom'                                        as nom,
  coalesce(data->>'categorie', 'autre')               as categorie,
  coalesce(data->'modeles', '[]'::jsonb)              as modeles,
  nullif(data->>'photo', '')                          as photo,
  case when nullif(data->>'photo', '') is null
       then nullif(data->>'photoData', '') end        as photo_data,
  coalesce((data->>'stock')::numeric, 0) > 0          as disponible
from public.docs
where col = 'produits'
  and coalesce((data->>'arrete')::boolean, false) = false
  and coalesce((data->>'exemple')::boolean, false) = false
  and coalesce(data->>'nom', '') <> '';

-- Lecture seule pour tout le monde (la table docs, elle, reste fermée)
revoke all on public.catalogue from anon, authenticated;
grant select on public.catalogue to anon, authenticated;
