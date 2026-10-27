import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { isUUID } from 'class-validator';

/**
 * N-9: every path parameter named `id` / `*Id` is a Prisma UUID. Validating
 * them globally prevents malformed ids from reaching Prisma (which would
 * otherwise throw an opaque driver error) and documents the API contract.
 * Params such as `key` (settings) are intentionally left untouched.
 */
@Injectable()
export class UuidParamPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type !== 'param' || !metadata.data) return value;
    if (!/^(?:id|[A-Za-z]*Id)$/u.test(metadata.data)) return value;
    if (typeof value !== 'string' || !isUUID(value)) {
      throw new BadRequestException(`${metadata.data} must be a UUID`);
    }
    return value;
  }
}
