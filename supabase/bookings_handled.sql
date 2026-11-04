alter table public.bookings add column handled boolean not null default false;
create policy "owner updates bookings" on public.bookings for update using (public.is_owner()) with check (public.is_owner());
