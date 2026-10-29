import { Module, OnModuleInit } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { TransfersModule } from '../transfers/transfers.module';
import { MailConfigService } from './mail-config.service';
import { MailController } from './mail.controller';
import { MailTemplatesService } from './mail-templates.service';
import { MailService } from './mail.service';
import { TransferMailService } from './transfer-mail.service';

@Module({
  imports: [SettingsModule, TransfersModule],
  controllers: [MailController],
  providers: [MailConfigService, MailTemplatesService, MailService, TransferMailService],
  exports: [MailService, MailConfigService],
})
export class MailModule implements OnModuleInit {
  constructor(private readonly templatesService: MailTemplatesService) {}

  async onModuleInit(): Promise<void> {
    await this.templatesService.ensureSeeded();
  }
}
