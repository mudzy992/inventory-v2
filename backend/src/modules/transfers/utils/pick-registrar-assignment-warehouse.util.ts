import type { AuthenticatedUser } from '../../../common/types/authenticated-user.type';
import { isRegistrarModeA } from '../../../common/types/registrar-scope.type';

export const pickRegistrarAssignmentWarehouse = (
  user: AuthenticatedUser,
  equipment: { categoryId: string },
): string | null => {
  if (user.role !== 'evidenticar' || user.registrarScopes.length === 0) {
    return null;
  }
  const modeA = user.registrarScopes.find((row) => isRegistrarModeA(row));
  if (modeA) {
    return modeA.warehouseId;
  }
  const byCategory = user.registrarScopes.find((row) => row.categoryId === equipment.categoryId);
  return byCategory?.warehouseId ?? user.registrarScopes[0]?.warehouseId ?? null;
};
