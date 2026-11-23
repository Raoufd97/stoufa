-- Vitrine publique : à coller dans Supabase > SQL Editor > New query > Run (à relancer après chaque mise à jour de ce fichier).
-- Ne laisse sortir que ce qu'un client doit voir : nom, catégorie, photo, disponible ou non,
-- le classement des pièces les plus demandées (sans aucun chiffre de vente) et la date d'arrivage.
-- Prix d'achat, prix de vente, quantités, ventes, caisse et factures restent privés.

create or replace view public.catalogue as
with ventes as (
  select data->>'produitId' as pid, sum(coalesce((data->>'qte')::numeric, 0)) as q
  from public.docs
  where col = 'mouvements' and data->>'type' = 'vente'
    and nullif(data->>'date', '')::timestamptz > now() - interval '90 days'
  group by 1
),
achats as (
  select data->>'produitId' as pid, max(nullif(data->>'date', '')::timestamptz) as d
  from public.docs
  where col = 'mouvements' and data->>'type' = 'achat'
  group by 1
)
select
  p.id,
  p.data->>'nom'                                          as nom,
  coalesce(p.data->>'categorie', 'autre')                 as categorie,
  coalesce(p.data->'modeles', '[]'::jsonb)                as modeles,
  nullif(p.data->>'photo', '')                            as photo,
  case when nullif(p.data->>'photo', '') is null
       then nullif(p.data->>'photoData', '') end          as photo_data,
  coalesce((p.data->>'stock')::numeric, 0) > 0            as disponible,
  coalesce(p.data->'lies', '[]'::jsonb)                   as lies,
  greatest(nullif(p.data->>'cree', '')::timestamptz, a.d) as arrivage,
  case when v.q > 0
       then (rank() over (order by coalesce(v.q, 0) desc))::int end as rang
from public.docs p
left join ventes v on v.pid = p.id
left join achats a on a.pid = p.id
where p.col = 'produits'
  and coalesce((p.data->>'arrete')::boolean, false) = false
  and coalesce((p.data->>'exemple')::boolean, false) = false
  and coalesce(p.data->>'nom', '') <> '';

-- Lecture seule pour tout le monde (la table docs, elle, reste fermée)
revoke all on public.catalogue from anon, authenticated;
grant select on public.catalogue to anon, authenticated;
