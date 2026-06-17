export {
  canDeleteOrgUnit,
  type OrgUnitDeleteGuardResult,
} from './org-unit-guards';
export {
  canDeleteCategory,
  CATEGORY_GUARD_MESSAGES,
  type CategoryDeleteGuardResult,
} from './category-guards';
export {
  canDeleteEmployee,
  EMPLOYEE_GUARD_MESSAGES,
  type EmployeeDeleteGuardResult,
  type EmployeeDeleteGuardInput,
} from './employee-guards';
export {
  canDeleteCanton,
  canDeleteCity,
  countCantonCities,
  LOCATION_GUARD_MESSAGES,
  type LocationDeleteGuardResult,
} from './location-guards';
export {
  canDeleteCatalogItem,
  EQUIPMENT_CATALOG_GUARD_MESSAGES,
  type CatalogDeleteGuardResult,
} from './equipment-catalog-guards';
export {
  canSaveEquipmentWarehouse,
  canReactivateEquipment,
  EQUIPMENT_GUARD_MESSAGES,
  type EquipmentGuardResult,
} from './equipment-guards';
export {
  canDeleteInventorySession,
  canDeleteInventoryCommittee,
  canActivateInventorySession,
  canCloseInventoryCommittee,
  INVENTORY_GUARD_MESSAGES,
  type InventoryGuardResult,
} from './inventory-guards';
export {
  canCreateTransferType,
  canCreateCrossServiceTransfer,
  canSignTransfer,
  canFinalizeTransfer,
  isTransferAwaitingFinalize,
  TRANSFER_GUARD_MESSAGES,
  type TransferGuardResult,
} from './transfer-guards';
export {
  canCreateWarehouse,
  canDestroyEquipment,
  WAREHOUSE_GUARD_MESSAGES,
  type WarehouseCreateGuardResult,
} from './warehouse-guards';
export {
  canEditLotSpecifications,
  canIssueFromLot,
  canCrossWarehouseIssue,
  WAREHOUSE_STOCK_GUARD_MESSAGES,
  type WarehouseStockGuardResult,
} from './warehouse-stock-guards';
export {
  canInstallMaintenancePart,
  canMarkPartFaulty,
  canRemoveMaintenancePart,
  canReplaceMaintenancePart,
  MAINTENANCE_PARTS_GUARD_MESSAGES,
  type MaintenancePartsGuardResult,
} from './maintenance-parts-guards';
export {
  canTransferRelocationLine,
  canResolveRelocationWhileFrozen,
  EMPLOYEE_RELOCATION_GUARD_MESSAGES,
  type EmployeeRelocationGuardResult,
} from './employee-relocation-guards';
export {
  canMarkDisposalList,
  canWithdrawDisposalList,
  canReviewDisposalApproval,
  DISPOSAL_GUARD_MESSAGES,
  type DisposalGuardResult,
} from './disposal-guards';
