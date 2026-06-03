import { Global, Module } from '@nestjs/common';
import { LocationResolutionService } from './services/location-resolution.service';
import { OrgScopeService } from './services/org-scope.service';
import { RegistrarScopeService } from './services/registrar-scope.service';
import { SignerResolutionService } from './services/signer-resolution.service';
import { InventoryFreezeService } from './services/inventory-freeze.service';
import { WarehouseResolutionService } from './services/warehouse-resolution.service';

@Global()
@Module({
  providers: [
    OrgScopeService,
    LocationResolutionService,
    SignerResolutionService,
    RegistrarScopeService,
    InventoryFreezeService,
    WarehouseResolutionService,
  ],
  exports: [
    OrgScopeService,
    LocationResolutionService,
    SignerResolutionService,
    RegistrarScopeService,
    InventoryFreezeService,
    WarehouseResolutionService,
  ],
})
export class CommonModule {}
