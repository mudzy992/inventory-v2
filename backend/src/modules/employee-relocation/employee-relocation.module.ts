import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { EmployeeRelocationController } from './employee-relocation.controller';
import { EmployeeRelocationService } from './employee-relocation.service';

@Module({
  imports: [CommonModule, SettingsModule, NotificationsModule],
  controllers: [EmployeeRelocationController],
  providers: [EmployeeRelocationService],
  exports: [EmployeeRelocationService],
})
export class EmployeeRelocationModule {}
