create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text not null default '',
  shoot_type text not null default '',
  shoot_date text not null default '',
  shoot_time text not null default '',
  message text not null default '',
  created_at timestamptz not null default now()
);

alter table public.bookings enable row level security;

-- Visitors can submit a booking but never read anyone's. Only the owner can read them.
create policy "anyone can book" on public.bookings for insert to anon, authenticated with check (true);
create policy "owner reads bookings" on public.bookings for select using (public.is_owner());
create policy "owner deletes bookings" on public.bookings for delete using (public.is_owner());
