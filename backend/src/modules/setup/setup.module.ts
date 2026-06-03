import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { SetupController } from './setup.controller';
import { SetupService } from './setup.service';

@Module({
  imports: [SettingsModule],
  controllers: [SetupController],
  providers: [SetupService],
})
export class SetupModule {}
