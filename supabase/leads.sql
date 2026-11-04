create table public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'promoter',
  handle text not null default '',
  event_name text not null default '',
  event_date text not null default '',
  status text not null default 'to_contact',
  watching boolean not null default false,
  follow_up_on date,
  notes text not null default '',
  created_at timestamptz not null default now()
);

alter table public.leads enable row level security;
create policy "owner leads" on public.leads for all using (public.is_owner()) with check (public.is_owner());
