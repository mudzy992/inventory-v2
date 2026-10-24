import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  mixin,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { SettingsService } from '../../modules/settings/settings.service';
import { resolveMaxUploadBytes } from '../utils/upload-limits.util';

const MAX_MULTIPART_FIELDS = 10;
const MAX_FIELD_NAME_BYTES = 100;
const MAX_FIELD_BYTES = 16 * 1024;

export const SettingsLimitedFileInterceptor = (fieldName: string) => {
  @Injectable()
  class SettingsLimitedFileInterceptorMixin implements NestInterceptor {
    constructor(
      private readonly settingsService: SettingsService,
      private readonly configService: ConfigService,
    ) {}

    async intercept(context: ExecutionContext, next: CallHandler) {
      const fallbackMaxMb = Number(this.configService.get<string>('MAX_UPLOAD_MB', '10'));
      const configuredMaxMb = await this.settingsService.getNumberValue(
        'upload.max_mb',
        fallbackMaxMb,
      );
      const interceptorType = FileInterceptor(fieldName, {
        limits: {
          fileSize: resolveMaxUploadBytes(configuredMaxMb, fallbackMaxMb),
          files: 1,
          fields: MAX_MULTIPART_FIELDS,
          fieldNameSize: MAX_FIELD_NAME_BYTES,
          fieldSize: MAX_FIELD_BYTES,
        },
      });

      return new interceptorType().intercept(context, next);
    }
  }

  return mixin(SettingsLimitedFileInterceptorMixin);
};
