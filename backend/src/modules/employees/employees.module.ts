import { Module } from '@nestjs/common';
import { EmployeeRelocationModule } from '../employee-relocation/employee-relocation.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

@Module({
  imports: [SettingsModule, EmployeeRelocationModule, NotificationsModule],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
