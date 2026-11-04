alter table public.galleries
  add column client_email text,
  add column send_at timestamptz,
  add column sent_at timestamptz,
  add column send_error text;

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'send-gallery-emails',
  '*/5 * * * *',
  $$ select net.http_post(url := 'https://rvoqihxvtpyyfejqkosg.supabase.co/functions/v1/send-gallery-emails') $$
);
