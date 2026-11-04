create or replace function public.is_owner() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'cmkcaptures@gmail.com'
$$;

create table public.galleries (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  client_id text not null unique,
  title text not null default '',
  release_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  path text not null,
  filename text not null,
  created_at timestamptz not null default now()
);

alter table public.galleries enable row level security;
alter table public.gallery_photos enable row level security;
create policy "owner galleries" on public.galleries for all using (public.is_owner()) with check (public.is_owner());
create policy "owner photos" on public.gallery_photos for all using (public.is_owner()) with check (public.is_owner());

-- Clients read a gallery only through its secret token, and only once released.
create or replace function public.get_gallery(p_token uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare g public.galleries;
begin
  select * into g from public.galleries where token = p_token;
  if not found then return null; end if;
  if g.release_at is not null and g.release_at > now() then
    return json_build_object('title', g.title, 'release_at', g.release_at, 'locked', true, 'photos', '[]'::json);
  end if;
  return json_build_object('title', g.title, 'release_at', g.release_at, 'locked', false, 'photos',
    coalesce((select json_agg(json_build_object('path', p.path, 'filename', p.filename) order by p.filename)
      from public.gallery_photos p where p.gallery_id = g.id), '[]'::json));
end $$;
revoke all on function public.get_gallery(uuid) from public;
grant execute on function public.get_gallery(uuid) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('galleries', 'galleries', true, 52428800, array['image/jpeg','image/png','image/webp']);

create policy "owner reads gallery files" on storage.objects for select to authenticated using (bucket_id = 'galleries' and public.is_owner());
create policy "owner uploads gallery files" on storage.objects for insert to authenticated with check (bucket_id = 'galleries' and public.is_owner());
create policy "owner deletes gallery files" on storage.objects for delete to authenticated using (bucket_id = 'galleries' and public.is_owner());
