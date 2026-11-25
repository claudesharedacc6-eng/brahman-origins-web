-- Brahman Origins (UB Lipa): the UB Lipa leaderboard for the Main Menu.
-- Creates ONE read-only function. It doesn't change any table, and it only reads lipa_progress.
-- It returns only name, points and year level, never emails or account ids,
-- so anyone (students and guests) can view the ranking without seeing private data.
-- Safe to run more than once. Run AFTER brahman_origins_lipa_tables.sql.

create or replace function public.lipa_leaderboard(max_rows int default 20)
returns table (rank int, player_name text, points int, level text)
language sql
stable
security definer
set search_path = public
as $$
  select
    (row_number() over (order by p.xp_total desc, p.updated_at asc))::int as rank,
    coalesce(nullif(trim(p.player_name), ''), 'Player') as player_name,
    p.xp_total as points,
    case
      when p.current_chapter >= 11 then 'Graduate'
      when p.current_chapter between 1 and 4 then 'Grade ' || (p.current_chapter + 6)
      when p.current_chapter in (5, 6) then 'Grade ' || (p.current_chapter + 6)
      when p.current_chapter = 7 then '1st Year'
      when p.current_chapter = 8 then '2nd Year'
      when p.current_chapter = 9 then '3rd Year'
      when p.current_chapter = 10 then '4th Year'
      else 'Grade 7'
    end as level
  from public.lipa_progress p
  where p.xp_total > 0
  order by p.xp_total desc, p.updated_at asc
  limit greatest(1, least(coalesce(max_rows, 20), 100));
$$;

revoke all on function public.lipa_leaderboard(int) from public;
grant execute on function public.lipa_leaderboard(int) to anon, authenticated;

-- Check: the top 10 UB Lipa players.
select * from public.lipa_leaderboard(10);
