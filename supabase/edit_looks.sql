create table if not exists public.edit_looks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  look jsonb not null,
  thumb text not null default '',
  created_at timestamptz not null default now()
);
alter table public.edit_looks enable row level security;
create policy "owner edit looks" on public.edit_looks for all using (public.is_owner()) with check (public.is_owner());
