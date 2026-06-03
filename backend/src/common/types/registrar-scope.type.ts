export interface RegistrarScopeAssignment {
  warehouseId: string;
  categoryId: string;
  orgUnitId?: string | null;
}

export const isRegistrarModeA = (assignment: RegistrarScopeAssignment): boolean =>
  !assignment.orgUnitId;
