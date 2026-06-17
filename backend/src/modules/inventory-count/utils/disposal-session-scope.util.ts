import {
  evaluateEquipmentInCommitteeScope,
  type CommitteeScopeDeps,
  type WarehouseScopeEquipment,
} from './resolve-warehouse-committee-scope.util';

export type DisposalSessionScopeInput = {
  sessionOrgUnitId: string;
  warehouseId: string;
  parentCategoryId: string;
};

export const isEquipmentInDisposalSessionScope = async (
  deps: CommitteeScopeDeps,
  scope: DisposalSessionScopeInput,
  equipment: WarehouseScopeEquipment,
): Promise<boolean> =>
  evaluateEquipmentInCommitteeScope(
    deps,
    {
      categoryId: scope.parentCategoryId,
      warehouseId: scope.warehouseId,
      sessionOrgUnitId: scope.sessionOrgUnitId,
    },
    equipment,
  );
