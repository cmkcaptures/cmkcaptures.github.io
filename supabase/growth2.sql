create table public.collabs (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  organiser text not null default '',
  shoot_date text not null default '',
  tags integer not null default 0,
  reposts integer not null default 0,
  leads integer not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now()
);
alter table public.collabs enable row level security;
create policy "owner collabs" on public.collabs for all using (public.is_owner()) with check (public.is_owner());

create table public.style_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  venue text not null default '',
  lighting text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);
alter table public.style_presets enable row level security;
create policy "owner presets" on public.style_presets for all using (public.is_owner()) with check (public.is_owner());

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  body text not null check (char_length(body) between 1 and 600),
  approved boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.reviews enable row level security;
create policy "anyone can leave a review" on public.reviews for insert to anon, authenticated with check (approved = false);
create policy "public reads approved reviews" on public.reviews for select to anon, authenticated using (approved or public.is_owner());
create policy "owner updates reviews" on public.reviews for update using (public.is_owner()) with check (public.is_owner());
create policy "owner deletes reviews" on public.reviews for delete using (public.is_owner());
