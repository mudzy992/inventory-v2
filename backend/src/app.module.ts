import { Module } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { CommonModule } from './common/common.module';
import { AuthModule } from './modules/auth/auth.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { EquipmentModule } from './modules/equipment/equipment.module';
import { TransfersModule } from './modules/transfers/transfers.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { HealthModule } from './modules/health/health.module';
import { LocationsModule } from './modules/locations/locations.module';
import { OrgUnitsModule } from './modules/org-units/org-units.module';
import { WarehousesModule } from './modules/warehouses/warehouses.module';
import { WarehouseStockModule } from './modules/warehouse-stock/warehouse-stock.module';
import { DisposalCommissionsModule } from './modules/disposal-commissions/disposal-commissions.module';
import { InventoryCountModule } from './modules/inventory-count/inventory-count.module';
import { InventorySchedulerModule } from './modules/inventory-scheduler/inventory-scheduler.module';
import { PublicEquipmentModule } from './modules/public-equipment/public-equipment.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SetupModule } from './modules/setup/setup.module';
import { UsersModule } from './modules/users/users.module';
import { MaintenancePartsModule } from './modules/maintenance-parts/maintenance-parts.module';
import { EquipmentCatalogModule } from './modules/equipment-catalog/equipment-catalog.module';
import { EmployeeRelocationModule } from './modules/employee-relocation/employee-relocation.module';
import { NavModule } from './modules/nav/nav.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { QueuesModule } from './queues/bullmq.module';
import { UuidParamPipe } from './common/pipes/uuid-param.pipe';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [resolve(process.cwd(), '../.env'), resolve(process.cwd(), '.env')],
    }),
    RedisModule,
    QueuesModule,
    CommonModule,
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    SettingsModule,
    SetupModule,
    PublicEquipmentModule,
    LocationsModule,
    OrgUnitsModule,
    WarehousesModule,
    WarehouseStockModule,
    DisposalCommissionsModule,
    InventoryCountModule,
    InventorySchedulerModule,
    EmployeesModule,
    CategoriesModule,
    EquipmentModule,
    MaintenancePartsModule,
    EquipmentCatalogModule,
    EmployeeRelocationModule,
    NavModule,
    DocumentsModule,
    TransfersModule,
    UploadsModule,
    NotificationsModule,
  ],
  providers: [{ provide: APP_PIPE, useClass: UuidParamPipe }],
})
export class AppModule {}
