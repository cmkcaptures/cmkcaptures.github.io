create table public.studio_records (
  kind text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (kind, id)
);

alter table public.studio_records enable row level security;
create policy "owner studio records" on public.studio_records for all using (public.is_owner()) with check (public.is_owner());
