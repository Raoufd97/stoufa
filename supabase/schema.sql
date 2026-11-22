-- Boutique de Stoufa : à coller une seule fois dans Supabase > SQL Editor > New query > Run.

-- 1) Une seule table qui garde toutes les fiches (produits, mouvements, appros, courses)
create table if not exists public.docs (
  col        text        not null,               -- nom de la collection : produits, mouvements, appros, courses
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (col, id)
);

create or replace function public.docs_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before update on public.docs for each row execute function public.docs_touch();

-- Mise à jour partielle d'une fiche (équivalent de "update" : on fusionne les champs)
create or replace function public.doc_merge(p_col text, p_id text, p_patch jsonb)
returns void language sql security invoker as $$
  insert into public.docs (col, id, data) values (p_col, p_id, p_patch)
  on conflict (col, id) do update set data = public.docs.data || excluded.data;
$$;

-- 2) Sécurité : seul le compte de la boutique (connecté) peut lire et écrire
alter table public.docs enable row level security;
drop policy if exists "boutique lit et ecrit" on public.docs;
create policy "boutique lit et ecrit" on public.docs
  for all to authenticated using (true) with check (true);

revoke all on public.docs from anon;
grant select, insert, update, delete on public.docs to authenticated;
grant execute on function public.doc_merge(text, text, jsonb) to authenticated;
revoke execute on function public.doc_merge(text, text, jsonb) from anon, public;

-- 3) Temps réel : ce que l'oncle enregistre apparaît tout de suite chez toi
alter table public.docs replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; end $$;

-- 4) Photos : bucket "photos", lisible par lien, modifiable seulement par la boutique
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do update set public = true;

drop policy if exists "boutique voit photos" on storage.objects;
create policy "boutique voit photos" on storage.objects
  for select to authenticated using (bucket_id = 'photos');

drop policy if exists "boutique ajoute photos" on storage.objects;
create policy "boutique ajoute photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'photos');

drop policy if exists "boutique modifie photos" on storage.objects;
create policy "boutique modifie photos" on storage.objects
  for update to authenticated using (bucket_id = 'photos');

drop policy if exists "boutique supprime photos" on storage.objects;
create policy "boutique supprime photos" on storage.objects
  for delete to authenticated using (bucket_id = 'photos');
