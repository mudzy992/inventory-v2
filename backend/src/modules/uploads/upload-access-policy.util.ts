import { isAbsolute, resolve, sep } from 'node:path';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

/**
 * Read-side allow-list for uploads.
 *
 * The Prisma enum has three values (`transfer`, `equipment`, `other`), but
 * only `transfer` currently has an authorizer: TransfersService.findOne()
 * applies the user's warehouse/org scope. Previously both read paths used
 * `if (entityType === 'transfer') { authorize() }`, so ANY other value —
 * including rows of a future entity type — silently skipped authorisation
 * and returned upload metadata. Every readable type must be listed here AND
 * have a branch in UploadsService.authorizeUploadRead(); an unknown value is
 * denied (fail closed), never treated as public.
 */
export const UPLOAD_READABLE_ENTITY_TYPES = ['transfer'] as const;
export type UploadReadableEntityType = (typeof UPLOAD_READABLE_ENTITY_TYPES)[number];

export const isReadableUploadEntityType = (value: unknown): value is UploadReadableEntityType =>
  typeof value === 'string' &&
  (UPLOAD_READABLE_ENTITY_TYPES as readonly string[]).includes(value);

/** Boundary/service-level validation of a client-supplied entityType. */
export const requireReadableUploadEntityType = (value: unknown): UploadReadableEntityType => {
  if (!isReadableUploadEntityType(value)) {
    throw new BadRequestException(
      `Unsupported upload entity type. Allowed: ${UPLOAD_READABLE_ENTITY_TYPES.join(', ')}.`,
    );
  }
  return value;
};

/** Validation of a stored upload row before any file/metadata is returned. */
export const requireAuthorizableStoredUpload = (
  entityType: unknown,
  entityId: string | null,
): { type: UploadReadableEntityType; entityId: string } => {
  if (!entityId) {
    throw new ForbiddenException('Upload is not linked to an authorizable entity');
  }
  if (!isReadableUploadEntityType(entityType)) {
    throw new ForbiddenException(
      `No read policy is registered for upload entity type ${String(entityType)}`,
    );
  }
  return { type: entityType, entityId };
};

/**
 * Resolves an upload's relative DB path against the configured root and
 * rejects anything that escapes it. Defends against a corrupted/migrated DB
 * row containing `../`, an absolute path, a Windows drive prefix, mixed
 * separators or a NUL byte. Symlinks are not dereferenced (the file may not
 * exist yet on the write path); the upload root must be a trusted directory.
 */
export const resolveUploadAbsolutePath = (root: string, relativePath: string): string => {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    throw new BadRequestException('Upload path is empty');
  }
  if (relativePath.includes('\0')) {
    throw new BadRequestException('Upload path contains a NUL byte');
  }
  if (relativePath.includes('\\')) {
    throw new BadRequestException('Upload path must use forward slashes');
  }
  if (isAbsolute(relativePath) || /^[A-Za-z]:/u.test(relativePath)) {
    throw new BadRequestException('Upload path must be relative to the upload root');
  }
  const rootResolved = resolve(root);
  const candidate = resolve(rootResolved, relativePath);
  if (candidate === rootResolved || !candidate.startsWith(`${rootResolved}${sep}`)) {
    throw new BadRequestException('Upload path escapes the configured upload root');
  }
  return candidate;
};
