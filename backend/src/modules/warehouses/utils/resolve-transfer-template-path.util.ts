import { InternalServerErrorException } from '@nestjs/common';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const resolveTransferTemplatePath = (uploadRoot: string, templatePath: string): string => {
  if (!templatePath || templatePath.includes('\0') || isAbsolute(templatePath)) {
    throw new InternalServerErrorException('Stored transfer template path is invalid');
  }

  const absoluteRoot = resolve(uploadRoot);
  const absolutePath = resolve(absoluteRoot, templatePath);
  const relativePath = relative(absoluteRoot, absolutePath);
  if (
    relativePath === '' ||
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new InternalServerErrorException('Stored transfer template path is outside the upload directory');
  }

  return absolutePath;
};
