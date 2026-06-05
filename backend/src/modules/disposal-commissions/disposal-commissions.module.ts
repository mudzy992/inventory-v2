import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { SettingsModule } from '../settings/settings.module';
import { DisposalCommissionsController } from './disposal-commissions.controller';
import { DisposalCommissionsService } from './disposal-commissions.service';

@Module({
  imports: [CommonModule, SettingsModule],
  controllers: [DisposalCommissionsController],
  providers: [DisposalCommissionsService],
  exports: [DisposalCommissionsService],
})
export class DisposalCommissionsModule {}
