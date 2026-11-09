-- Photos you've starred in the Studio become the public site's showcase (newest first).
create or replace function public.get_showcase() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('path', p.path) order by p.created_at desc), '[]'::json)
  from (select path, created_at from public.gallery_photos where starred order by created_at desc limit 16) p;
$$;
revoke all on function public.get_showcase() from public;
grant execute on function public.get_showcase() to anon, authenticated;
