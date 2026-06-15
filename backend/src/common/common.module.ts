import { Global, Module } from '@nestjs/common';
import { LocationResolutionService } from './services/location-resolution.service';
import { OrgScopeService } from './services/org-scope.service';
import { RegistrarScopeService } from './services/registrar-scope.service';
import { SignerResolutionService } from './services/signer-resolution.service';
import { InventoryFreezeService } from './services/inventory-freeze.service';
import { InventoryProductionModeService } from './services/inventory-production-mode.service';
import { InventoryCoordinatorScopeService } from './services/inventory-coordinator-scope.service';
import { WarehouseResolutionService } from './services/warehouse-resolution.service';

@Global()
@Module({
  providers: [
    OrgScopeService,
    LocationResolutionService,
    SignerResolutionService,
    RegistrarScopeService,
    InventoryFreezeService,
    InventoryProductionModeService,
    InventoryCoordinatorScopeService,
    WarehouseResolutionService,
  ],
  exports: [
    OrgScopeService,
    LocationResolutionService,
    SignerResolutionService,
    RegistrarScopeService,
    InventoryFreezeService,
    InventoryProductionModeService,
    InventoryCoordinatorScopeService,
    WarehouseResolutionService,
  ],
})
export class CommonModule {}
