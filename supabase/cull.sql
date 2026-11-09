create table public.cull_feedback (
  id uuid primary key default gen_random_uuid(),
  z jsonb not null,
  kept boolean not null,
  created_at timestamptz not null default now()
);
alter table public.cull_feedback enable row level security;
create policy "owner cull feedback" on public.cull_feedback for all using (public.is_owner()) with check (public.is_owner());
