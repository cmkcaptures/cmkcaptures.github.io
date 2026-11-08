create table public.push_subs (
  endpoint text primary key,
  sub jsonb not null,
  device text,
  created_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
create policy "owner push subs" on public.push_subs for all using (public.is_owner()) with check (public.is_owner());

-- Server-only secrets: RLS on, no policies.
create table if not exists public.app_secrets (name text primary key, value text not null);
alter table public.app_secrets enable row level security;
insert into public.app_secrets (name, value) values ('push_cron', encode(gen_random_bytes(24), 'hex'))
on conflict (name) do nothing;

-- 09:00 and 18:00 UTC (≈ London morning and evening).
select cron.schedule('sandy-push-morning', '0 9 * * *', $$
  select net.http_post(
    url := 'https://rvoqihxvtpyyfejqkosg.supabase.co/functions/v1/sandy-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from public.app_secrets where name = 'push_cron')),
    body := '{}'::jsonb
  ) $$);
select cron.schedule('sandy-push-evening', '0 18 * * *', $$
  select net.http_post(
    url := 'https://rvoqihxvtpyyfejqkosg.supabase.co/functions/v1/sandy-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from public.app_secrets where name = 'push_cron')),
    body := '{}'::jsonb
  ) $$);
