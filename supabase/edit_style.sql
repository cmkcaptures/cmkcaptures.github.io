create table if not exists public.edit_style (
  id integer primary key default 1 check (id = 1),
  profile jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.edit_style enable row level security;
create policy "owner edit style" on public.edit_style for all using (public.is_owner()) with check (public.is_owner());
