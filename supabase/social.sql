create table public.shoot_people (
  id uuid primary key default gen_random_uuid(),
  shoot text not null,
  name text not null default '',
  handle text not null default '',
  sent boolean not null default false,
  tagged boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.shoot_people enable row level security;
create policy "owner shoot people" on public.shoot_people for all using (public.is_owner()) with check (public.is_owner());

create table public.planned_posts (
  id uuid primary key default gen_random_uuid(),
  post_on date not null,
  caption text not null default '',
  photo_path text,
  posted boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.planned_posts enable row level security;
create policy "owner planned posts" on public.planned_posts for all using (public.is_owner()) with check (public.is_owner());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-previews', 'post-previews', true, 2097152, array['image/jpeg']);
create policy "owner reads post previews" on storage.objects for select to authenticated using (bucket_id = 'post-previews' and public.is_owner());
create policy "owner uploads post previews" on storage.objects for insert to authenticated with check (bucket_id = 'post-previews' and public.is_owner());
create policy "owner deletes post previews" on storage.objects for delete to authenticated using (bucket_id = 'post-previews' and public.is_owner());
