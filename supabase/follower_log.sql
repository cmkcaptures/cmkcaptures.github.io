create table public.follower_log (
  logged_on date primary key,
  followers integer not null
);

alter table public.follower_log enable row level security;
create policy "owner follower log" on public.follower_log for all using (public.is_owner()) with check (public.is_owner());
