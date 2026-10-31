-- Stars added from the sky ("Add a star"). Each row is encrypted in the browser with the passcode,
-- so the table only ever holds unreadable text. Run once: Dashboard -> SQL Editor -> New query -> Run.

create table if not exists public.stars (
  id         bigint generated always as identity primary key,
  iv         text not null check (length(iv) between 12 and 32),
  ct         text not null check (length(ct) between 16 and 4000),
  created_at timestamptz not null default now()
);

-- Visitors may read and add, nothing else (no edits, no deletes).
alter table public.stars enable row level security;

drop policy if exists "anyone can read stars" on public.stars;
create policy "anyone can read stars" on public.stars
  for select to anon using (true);

drop policy if exists "anyone can add a star" on public.stars;
create policy "anyone can add a star" on public.stars
  for insert to anon with check (true);

-- A brake on spam: at most 10 new stars per minute across everyone.
create or replace function public.limit_star_rate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.stars where created_at > now() - interval '1 minute') >= 10 then
    raise exception 'Too many stars right now, try again in a minute';
  end if;
  return new;
end $$;

drop trigger if exists stars_rate_limit on public.stars;
create trigger stars_rate_limit before insert on public.stars
  for each row execute function public.limit_star_rate();

-- Send new stars to open pages live.
alter publication supabase_realtime add table public.stars;
