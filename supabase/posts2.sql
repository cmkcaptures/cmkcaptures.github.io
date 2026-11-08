alter table public.gallery_photos add column if not exists favourite boolean not null default false;
alter table public.gallery_photos add column if not exists starred boolean not null default false;
alter table public.posts add column if not exists kind text not null default 'post';

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
    coalesce((select json_agg(json_build_object('path', p.path, 'filename', p.filename, 'favourite', p.favourite) order by p.filename)
      from public.gallery_photos p where p.gallery_id = g.id), '[]'::json));
end $$;

create or replace function public.toggle_favourite(p_token uuid, p_path text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare result boolean;
begin
  update public.gallery_photos p set favourite = not p.favourite
  from public.galleries g
  where g.token = p_token and p.gallery_id = g.id and p.path = p_path
    and (g.release_at is null or g.release_at <= now())
  returning p.favourite into result;
  return result;
end $$;
revoke all on function public.toggle_favourite(uuid, text) from public;
grant execute on function public.toggle_favourite(uuid, text) to anon, authenticated;
