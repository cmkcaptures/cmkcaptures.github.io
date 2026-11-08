create table public.posts (
  id uuid primary key default gen_random_uuid(),
  photos jsonb not null default '[]',
  caption text not null default '',
  tags jsonb not null default '[]',
  post_on date,
  posted boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.posts enable row level security;
create policy "owner posts" on public.posts for all using (public.is_owner()) with check (public.is_owner());

create table public.saved_captions (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  created_at timestamptz not null default now()
);
alter table public.saved_captions enable row level security;
create policy "owner saved captions" on public.saved_captions for all using (public.is_owner()) with check (public.is_owner());
