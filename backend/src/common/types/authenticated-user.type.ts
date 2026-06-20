import type { UserRole } from '../../../generated/prisma/client';
import type { CoordinatorScopeAssignment } from './coordinator-scope.type';
import type { RegistrarScopeAssignment } from './registrar-scope.type';

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: UserRole;
  employeeId: string | null;
  registrarScopes: RegistrarScopeAssignment[];
  coordinatorAssignments: CoordinatorScopeAssignment[];
  moderatorOrgRoots: string[];
  moderatorWarehouseIds: string[];
}
