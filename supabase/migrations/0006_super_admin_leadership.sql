-- The hidden platform role inherits the leadership tier so that database
-- policies match the app's access matrix (which grants it every capability).

create or replace function public.is_leadership()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.current_app_role() in (
    'super_admin',
    'it_manager','l2_support_manager','l2_support_lead',
    'implementation_manager','implementation_lead',
    'development_manager','development_lead',
    'testing_manager','testing_lead','management'
  ), false);
$$;
