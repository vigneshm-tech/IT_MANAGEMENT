-- Demo employees for the IT_MANAGEMENT Supabase project.
--
-- !! The shared password below is a TEMPORARY demo credential. Rotate it (or
-- !! delete these accounts) before production use:
-- !!   update auth.users set encrypted_password = crypt('<new-password>', gen_salt('bf'))
-- !!   where email like '%@tasktornado.dev';
--
-- Each account carries role metadata; the handle_new_user trigger copies it
-- into public.profiles. Accounts without a role are refused at login.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  s.email,
  crypt('Tornado@2026', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', s.full_name, 'title', s.title, 'role', s.role),
  now(), now(), '', '', '', ''
from (values
  ('it.manager@tasktornado.dev','Meera Raghavan','IT Manager','it_manager'),
  ('it.engineer@tasktornado.dev','Arun Prakash','IT Engineer','it_engineer'),
  ('l2.manager@tasktornado.dev','Divya Suresh','L2 Support Manager','l2_support_manager'),
  ('l2.lead@tasktornado.dev','Karthik Raman','L2 Support Lead','l2_support_lead'),
  ('l2.engineer@tasktornado.dev','Nisha Verma','L2 Support Engineer','l2_support_engineer'),
  ('implementation.manager@tasktornado.dev','Suresh Iyer','Implementation Manager','implementation_manager'),
  ('implementation.lead@tasktornado.dev','Priya Nair','Implementation Lead','implementation_lead'),
  ('implementation.engineer@tasktornado.dev','Vikram Shetty','Implementation Engineer','implementation_engineer'),
  ('development.manager@tasktornado.dev','Anand Krishnan','Development Manager','development_manager'),
  ('development.lead@tasktornado.dev','Sneha Pillai','Development Lead','development_lead'),
  ('development.engineer@tasktornado.dev','Rahul Menon','Development Engineer','development_engineer'),
  ('testing.manager@tasktornado.dev','Lakshmi Narayan','Testing Manager','testing_manager'),
  ('testing.lead@tasktornado.dev','Farhan Ali','Testing Lead','testing_lead'),
  ('testing.engineer@tasktornado.dev','Ananya Bose','Testing Engineer','testing_engineer'),
  ('management@tasktornado.dev','Ramesh Subramanian','Management','management')
) as s(email, full_name, title, role)
where not exists (select 1 from auth.users u where u.email = s.email);

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email like '%@tasktornado.dev'
  and not exists (select 1 from auth.identities i where i.user_id = u.id);
