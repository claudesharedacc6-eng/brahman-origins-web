-- =============================================================================
-- BRAHMAN ORIGINS · Player portal: database fixes (website v2.2)
-- Run in Supabase > SQL Editor > New query. Safe to run more than once
-- (also if you ran an earlier version of this file).
--
-- The shared "players" table now belongs to another group (id, name, selected_character),
-- so the website NO LONGER reads or writes it. Nothing here touches "players".
-- Touches only: profiles (role protection), tickets (portal-owned), the UB Lipa tables,
-- and adds one admin-only function.
-- =============================================================================


-- 1. NOBODY CAN MAKE THEMSELVES ADMIN -----------------------------------------
-- Blocks role changes coming from the website/game. The SQL Editor (you) can still change roles.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' and coalesce(new.role, 'student') <> 'student' then
      raise exception 'Only the project owner can create admin accounts.';
    end if;
    if tg_op = 'UPDATE' and (new.role is distinct from old.role or new.id is distinct from old.id) then
      raise exception 'Only the project owner can change roles.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_role on public.profiles;
create trigger trg_protect_profile_role
  before insert or update on public.profiles
  for each row execute function public.protect_profile_role();


-- 2. TICKETS: allow the "Inquiry" type and link reports to the login ----------
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.tickets'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%tag%'
  loop
    execute format('alter table public.tickets drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.tickets
  add constraint tickets_tag_check
  check (tag in ('Technical Issue', 'Gameplay Feedback', 'Inquiry', 'XP / Progress Bug', 'Other'))
  not valid;

-- Each report remembers who sent it (filled in automatically from the login).
alter table public.tickets
  add column if not exists user_id uuid default auth.uid() references auth.users (id) on delete set null;
create index if not exists idx_tickets_user_id on public.tickets (user_id);

drop policy if exists "Players can submit tickets" on public.tickets;
create policy "Players can submit tickets" on public.tickets
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Players can view own tickets" on public.tickets;
create policy "Players can view own tickets" on public.tickets
  for select to authenticated
  using (user_id = auth.uid());
-- ("Admins can manage all tickets" stays as it is.)


-- 3. ADMINS CAN SEE UB LIPA PROGRESS (admin console) --------------------------
drop policy if exists "Admins read Lipa progress" on public.lipa_progress;
create policy "Admins read Lipa progress" on public.lipa_progress
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "Admins read Lipa results" on public.lipa_task_results;
create policy "Admins read Lipa results" on public.lipa_task_results
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));


-- 4. STUDENT DIRECTORY for the admin console -----------------------------------
-- Everyone who has signed in (except admins): name, email, sign-up and last sign-in.
-- Reads the logins directly, so it works for all four campuses without any group's table.
-- Only admins can call it; anyone else gets an error.
create or replace function public.portal_students()
returns table (user_id uuid, email text, name text, signed_up timestamptz, last_sign_in timestamptz)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'Admins only';
  end if;

  return query
    select u.id,
           u.email::text,
           coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1))::text,
           u.created_at,
           u.last_sign_in_at
    from auth.users u
    where not exists (select 1 from public.profiles p where p.id = u.id and p.role = 'admin')
    order by 3;
end;
$$;

revoke all on function public.portal_students() from public, anon;
grant execute on function public.portal_students() to authenticated;


-- 5. UB LIPA: use real names instead of email names on the leaderboard --------
-- Rows saved as e.g. "1700565" get the Google name. (The updated game does this by itself too.)
update public.lipa_progress lp
set player_name = coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
from auth.users u
where u.id = lp.user_id
  and lp.player_name = split_part(u.email, '@', 1)
  and coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name') is not null;


-- CHECKS --------------------------------------------------------------------------
-- UB Lipa players (names should now be real names):
select player_name, current_chapter, xp_total from public.lipa_progress order by xp_total desc;
