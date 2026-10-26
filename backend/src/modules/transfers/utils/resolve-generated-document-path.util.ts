import { InternalServerErrorException } from '@nestjs/common';
import { isAbsolute, relative, resolve, sep } from 'node:path';

/**
 * Resolves a generated-document path stored in the database to an absolute
 * path below the upload root. Stored values are internal, but validating them
 * keeps a corrupted or tampered DB row from turning the download endpoint into
 * an arbitrary-file reader.
 */
export const resolveGeneratedDocumentPath = (uploadRoot: string, storedPath: string): string => {
  if (!storedPath || storedPath.includes('\0') || isAbsolute(storedPath)) {
    throw new InternalServerErrorException('Stored generated document path is invalid');
  }

  const absoluteRoot = resolve(uploadRoot);
  const absolutePath = resolve(absoluteRoot, storedPath);
  const relativePath = relative(absoluteRoot, absolutePath);
  if (
    relativePath === '' ||
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new InternalServerErrorException('Stored generated document path is outside the upload directory');
  }

  return absolutePath;
};
