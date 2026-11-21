-- Adds the hidden platform role.
--
-- Kept in its own migration: PostgreSQL cannot use a new enum value in the
-- same transaction that adds it, so the account and policies land in 0005.

alter type public.app_role add value if not exists 'super_admin';
