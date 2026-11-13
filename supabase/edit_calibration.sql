create table if not exists public.edit_calibration (
  id integer primary key default 1 check (id = 1),
  calib jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.edit_calibration enable row level security;
create policy "owner edit calibration" on public.edit_calibration for all using (public.is_owner()) with check (public.is_owner());
