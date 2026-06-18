import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { SetupBootstrapService } from './setup-bootstrap.service';
import { SetupController } from './setup.controller';
import { SetupService } from './setup.service';

@Module({
  imports: [SettingsModule],
  controllers: [SetupController],
  providers: [SetupService, SetupBootstrapService],
})
export class SetupModule {}
