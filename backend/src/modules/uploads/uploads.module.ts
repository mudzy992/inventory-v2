import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { TransfersModule } from '../transfers/transfers.module';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  imports: [TransfersModule, SettingsModule],
  controllers: [UploadsController],
  providers: [UploadsService],
})
export class UploadsModule {}
