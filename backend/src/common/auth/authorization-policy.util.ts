import type { AuthenticatedUser } from '../types/authenticated-user.type';

type RoleBearingActor = { readonly role?: string | null } | null | undefined;

/**
 * N-13: single source of truth for the "system administrator" privilege.
 * Every authorization decision in the backend must go through this helper so
 * that a future rename/refactor of the role enum cannot silently bypass a
 * branch. Raw `actor.role === 'admin'` comparisons are rejected by the
 * `Verify authorization policy` CI gate.
 */
export const isSystemAdmin = (actor: RoleBearingActor): boolean => actor?.role === 'admin';

export const isSystemAdminUser = (actor: AuthenticatedUser): boolean => isSystemAdmin(actor);

export const assertSystemAdmin = (actor: RoleBearingActor): void => {
  if (!isSystemAdmin(actor)) {
    throw new Error('System administrator privilege required');
  }
};
