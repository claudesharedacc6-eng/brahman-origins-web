-- =============================================================================
-- BRAHMAN ORIGINS · Make the two staff accounts admins
-- 1. First create the accounts in Supabase > Authentication > Users > Add user
--    (tick "Auto Confirm User"). Never write their passwords in any file.
-- 2. Then run this in SQL Editor > New query. Safe to run more than once.
-- To add another admin later, add their email to the list.
-- =============================================================================

insert into public.profiles (id, role, display_name)
select u.id, 'admin', 'System Administrator'
from auth.users u
where lower(u.email) in (
  'brahmanorigins@gmail.com',
  'admin@brahmanorigins.com'
)
on conflict (id) do update set role = 'admin';

-- CHECK: who is admin now. You should see both emails.
select u.email, p.role
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'admin';
