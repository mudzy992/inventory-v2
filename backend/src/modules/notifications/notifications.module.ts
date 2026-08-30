import { Module, forwardRef } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [
    forwardRef(() => SettingsModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsGateway, NotificationsService],
  // NotificationsGateway je eksportovan pored NotificationsService da bi
  // moduli van notifications/ (npr. DocumentsModule) mogli emitovati
  // ciljane per-user evente (npr. document.job.updated) bez prolaska kroz
  // NotificationsService-ovu recipient-resolution logiku, koja je vezana
  // za domenske entitete (transferi, popisi) — Document Engine je
  // namjerno generički i ne poznaje te entitete.
  exports: [NotificationsService, NotificationsGateway],
})
export class NotificationsModule {}
