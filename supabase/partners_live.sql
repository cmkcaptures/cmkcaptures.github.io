-- Promoter partner portals
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  name text not null,
  handle text not null default '',
  client_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.partners enable row level security;
create policy "owner partners" on public.partners for all using (public.is_owner()) with check (public.is_owner());

create or replace function public.get_partner(p_token uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare p public.partners;
begin
  select * into p from public.partners where token = p_token;
  if not found then return null; end if;
  return json_build_object(
    'name', p.name,
    'nights', coalesce((
      select json_agg(json_build_object(
        'title', coalesce(nullif(c.data->>'type', ''), 'Shoot'),
        'date', c.data->>'shootDate',
        'stage', c.data->>'stage',
        'paid', coalesce((c.data->>'fullyPaid')::boolean, false),
        'deposit', coalesce((c.data->>'depositPaid')::boolean, false),
        'price', c.data->>'price',
        'gallery', g.token,
        'released', g.release_at is null or g.release_at <= now(),
        'cover', (select gp.path from public.gallery_photos gp where gp.gallery_id = g.id order by gp.starred desc, gp.favourite desc, gp.created_at limit 1),
        'photos', (select count(*) from public.gallery_photos gp where gp.gallery_id = g.id)
      ) order by c.data->>'shootDate' desc)
      from public.studio_records c
      left join public.galleries g on g.client_id = c.id
      where c.kind = 'client' and c.id = any(p.client_ids)
    ), '[]'::json)
  );
end $$;
revoke all on function public.get_partner(uuid) from public;
grant execute on function public.get_partner(uuid) to anon, authenticated;

-- Live event walls
create table if not exists public.live_walls (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  title text not null,
  client_id text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.live_photos (
  id uuid primary key default gen_random_uuid(),
  wall_id uuid not null references public.live_walls(id) on delete cascade,
  url text not null,
  path text not null,
  created_at timestamptz not null default now()
);
alter table public.live_walls enable row level security;
alter table public.live_photos enable row level security;
create policy "owner live walls" on public.live_walls for all using (public.is_owner()) with check (public.is_owner());
create policy "owner live photos" on public.live_photos for all using (public.is_owner()) with check (public.is_owner());

create or replace function public.get_wall(p_token uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'title', w.title,
    'active', w.active,
    'photos', coalesce((select json_agg(json_build_object('id', p.id, 'url', p.url, 'at', p.created_at) order by p.created_at desc) from public.live_photos p where p.wall_id = w.id), '[]'::json)
  )
  from public.live_walls w where w.token = p_token;
$$;
revoke all on function public.get_wall(uuid) from public;
grant execute on function public.get_wall(uuid) to anon, authenticated;
