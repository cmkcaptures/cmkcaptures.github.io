-- Posts pulled from @cmk._7 by the ig-sync edge function. No follower data is stored.
create table public.ig_media (
  id text primary key,
  caption text not null default '',
  media_type text not null default '',
  media_url text,
  thumbnail_url text,
  permalink text,
  posted_at timestamptz,
  likes integer,
  comments integer,
  reach integer,
  saves integer,
  shares integer,
  views integer,
  synced_at timestamptz not null default now()
);
alter table public.ig_media enable row level security;
create policy "owner ig media" on public.ig_media for select using (public.is_owner());

-- Holds the refreshed Instagram token. No policies: only the edge function (service role) can touch it.
create table public.ig_auth (
  id integer primary key default 1 check (id = 1),
  token text not null,
  refreshed_at timestamptz not null default now()
);
alter table public.ig_auth enable row level security;
