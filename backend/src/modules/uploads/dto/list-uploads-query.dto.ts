import { IsIn, IsUUID } from 'class-validator';
import {
  UPLOAD_READABLE_ENTITY_TYPES,
  type UploadReadableEntityType,
} from '../upload-access-policy.util';

/**
 * GET /uploads?entityType=...&entityId=... used to take two unvalidated
 * `@Query('...') string` params. With the global ValidationPipe
 * (whitelist + forbidNonWhitelisted) this DTO rejects unknown entity types,
 * malformed ids, missing values and extra query parameters before the
 * service is called.
 */
export class ListUploadsQueryDto {
  @IsIn(UPLOAD_READABLE_ENTITY_TYPES)
  entityType!: UploadReadableEntityType;

  @IsUUID()
  entityId!: string;
}
