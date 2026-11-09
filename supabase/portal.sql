-- Client portal: what a client can see with their private gallery link.
create or replace function public.get_portal(p_token uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare g public.galleries; c jsonb; b jsonb;
begin
  select * into g from public.galleries where token = p_token;
  if not found then return null; end if;
  select data into c from public.studio_records where kind = 'client' and id = g.client_id;
  select data into b from public.studio_records where kind = 'business' limit 1;
  return json_build_object(
    'client', case when c is null then null else json_build_object(
      'name', split_part(coalesce(c->>'name', ''), ' ', 1),
      'type', c->>'type',
      'shootDate', c->>'shootDate',
      'stage', c->>'stage',
      'price', c->>'price',
      'depositPaid', coalesce((c->>'depositPaid')::boolean, false),
      'fullyPaid', coalesce((c->>'fullyPaid')::boolean, false)
    ) end,
    'payment', coalesce(b->>'paymentInstructions', ''),
    'photoCount', (select count(*) from public.gallery_photos p where p.gallery_id = g.id)
  );
end $$;
revoke all on function public.get_portal(uuid) from public;
grant execute on function public.get_portal(uuid) to anon, authenticated;
