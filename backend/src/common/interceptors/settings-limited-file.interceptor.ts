import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  mixin,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { recordUploadReject } from '../upload/upload-reject.registry';
import { classifyMultipartReject } from '../upload/upload-reject.util';
import { SettingsService } from '../../modules/settings/settings.service';
import { resolveMaxUploadBytes } from '../utils/upload-limits.util';

const MAX_MULTIPART_FIELDS = 10;
const MAX_FIELD_NAME_BYTES = 100;
const MAX_FIELD_BYTES = 16 * 1024;

export const SettingsLimitedFileInterceptor = (fieldName: string) => {
  @Injectable()
  class SettingsLimitedFileInterceptorMixin implements NestInterceptor {
    constructor(
      readonly settingsService: SettingsService,
      readonly configService: ConfigService,
    ) {}

    async intercept(context: ExecutionContext, next: CallHandler) {
      const fallbackMaxMb = Number(this.configService.get<string>('MAX_UPLOAD_MB', '10'));
      const configuredMaxMb = await this.settingsService.getNumberValue(
        'upload.max_mb',
        fallbackMaxMb,
      );
      const maxBytes = resolveMaxUploadBytes(configuredMaxMb, fallbackMaxMb);
      const interceptorType = FileInterceptor(fieldName, {
        limits: {
          fileSize: maxBytes,
          files: 1,
          fields: MAX_MULTIPART_FIELDS,
          fieldNameSize: MAX_FIELD_NAME_BYTES,
          fieldSize: MAX_FIELD_BYTES,
        },
      });

      try {
        // Multer parsing errors are thrown before next.handle(), so catching
        // this await records only pre-parser rejections — not business errors
        // from the upload services (those record their own reason codes).
        return await new interceptorType().intercept(context, next);
      } catch (error) {
        const { reason, details } = classifyMultipartReject(error);
        recordUploadReject({
          operation: 'multipart',
          reason,
          details: { ...details, maxBytes },
        });
        throw error;
      }
    }
  }

  return mixin(SettingsLimitedFileInterceptorMixin);
};
