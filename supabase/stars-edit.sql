-- Lets a star be changed or removed from the page, but only by someone who has the passcode.
-- Run once after stars.sql: Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- Each star row gets a random nonce and edit_hash = sha256(token), where the token is worked out in the
-- browser from the unlock key and that nonce. Visitors still can't update or delete rows directly; they
-- can only call the two functions below, which act only when the token they send matches the hash.

alter table public.stars add column if not exists nonce text;
alter table public.stars add column if not exists edit_hash text;

create or replace function public.update_star(p_id bigint, p_token text, p_iv text, p_ct text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if length(p_iv) not between 12 and 32 or length(p_ct) not between 16 and 4000 then return false; end if;
  update public.stars set iv = p_iv, ct = p_ct
   where id = p_id and edit_hash is not null and edit_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  return found;
end $$;

create or replace function public.delete_star(p_id bigint, p_token text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from public.stars
   where id = p_id and edit_hash is not null and edit_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  return found;
end $$;

revoke all on function public.update_star(bigint, text, text, text) from public;
revoke all on function public.delete_star(bigint, text) from public;
grant execute on function public.update_star(bigint, text, text, text) to anon;
grant execute on function public.delete_star(bigint, text) to anon;

-- so other open pages hear about deletions with the row's id
alter table public.stars replica identity default;
