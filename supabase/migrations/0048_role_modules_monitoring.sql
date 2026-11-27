-- The role grid writes one row per module, including the ones set to Not allowed.
--
-- `monitoring` joined the catalogue in 0042, after this table's module check was
-- written in 0039, and the constraint was never widened. Every save of the grid
-- therefore inserted a `monitoring` row that the check refused, failed as a
-- whole, and reported only "The permissions could not be saved." — nothing was
-- ever stored for any role.
--
-- The list here has to match `lib/modules.ts` exactly. `tests/role-modules-schema.test.ts`
-- reads this file and fails the build when the two drift apart, so the next
-- module cannot repeat this.

alter table public.access_role_modules
  drop constraint if exists access_role_modules_module;

alter table public.access_role_modules
  add constraint access_role_modules_module check (
    module_id in ('dashboard', 'tasks', 'tickets', 'kb', 'servers', 'patching', 'iis',
                  'monitoring', 'clients', 'renewals', 'masters', 'approvals',
                  'settings', 'users')
  );
