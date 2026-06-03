import type { UserRole } from '../../../generated/prisma/client';
import type { RegistrarScopeAssignment } from './registrar-scope.type';

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: UserRole;
  employeeId: string | null;
  registrarScopes: RegistrarScopeAssignment[];
}
