-- =============================================================================
-- BRAHMAN ORIGINS · Player portal: database fixes for website v2
-- Run once in Supabase > SQL Editor > New query. Safe to run more than once.
--
-- Written for the LIVE database (profiles = id/role/display_name, players = student rows).
-- Do NOT run the old supabase-schema.sql: it doesn't match the live tables and adds fake students.
--
-- Parts 1–4 only touch the portal (profiles role, tickets) and the UB Lipa tables.
-- Part 5 (players table) is commented out: those rules may be used by the other groups'
-- game code, so agree on it with them first.
-- =============================================================================


-- 1. NOBODY CAN MAKE THEMSELVES ADMIN -----------------------------------------
-- Right now "Users can update own profile" lets any signed-in player run
-- update profiles set role = 'admin' on their own row. This trigger blocks
-- role changes coming from the website/game. The SQL Editor (you) can still change roles.
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


-- 2. ALLOW THE "Inquiry" TICKET TYPE ------------------------------------------
-- The website sends: Technical Issue, Gameplay Feedback, Inquiry.
-- Removes any old tag rule and adds one that includes all of them
-- (old rows are kept as they are, thanks to NOT VALID).
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


-- 3. PLAYERS CAN ONLY FILE TICKETS AS THEMSELVES ------------------------------
drop policy if exists "Players can submit tickets" on public.tickets;
create policy "Players can submit tickets" on public.tickets
  for insert to authenticated
  with check (
    auth.uid() is not null
    and (player_id is null
         or player_id in (select id from public.players where user_id = auth.uid()))
  );


-- 4. ADMINS CAN SEE UB LIPA PROGRESS (admin console) --------------------------
drop policy if exists "Admins read Lipa progress" on public.lipa_progress;
create policy "Admins read Lipa progress" on public.lipa_progress
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "Admins read Lipa results" on public.lipa_task_results;
create policy "Admins read Lipa results" on public.lipa_task_results
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));


-- 5. OPTIONAL · players TABLE (agree with the other groups first) -------------
-- Today: "Public leaderboard read" lets ANYONE, even without logging in, read every
-- player's name and email, and "Enable update for authenticated users" lets any
-- signed-in player change ANY player's level/XP. If no group's game needs that,
-- remove the -- in front of these lines and run them:
--
-- drop policy if exists "Public leaderboard read" on public.players;
-- drop policy if exists "Enable read for authenticated users" on public.players;
-- drop policy if exists "Enable update for authenticated users" on public.players;
-- drop policy if exists "Enable insert for authenticated users" on public.players;
-- create policy "Players add own record" on public.players
--   for insert to authenticated with check (user_id = auth.uid());
-- create policy "Players update own record" on public.players
--   for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
--
-- ("Players can read own record" and "Admins can manage all players" stay, so
--  the website keeps working.)


-- CHECK: every rule on the portal tables after the fixes.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename in ('profiles', 'players', 'tickets', 'lipa_progress', 'lipa_task_results')
order by tablename, policyname;
