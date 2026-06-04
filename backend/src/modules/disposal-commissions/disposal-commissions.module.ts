import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { DisposalCommissionsController } from './disposal-commissions.controller';
import { DisposalCommissionsService } from './disposal-commissions.service';

@Module({
  imports: [SettingsModule],
  controllers: [DisposalCommissionsController],
  providers: [DisposalCommissionsService],
  exports: [DisposalCommissionsService],
})
export class DisposalCommissionsModule {}
