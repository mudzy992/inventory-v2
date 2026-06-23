import { execFile } from 'node:child_process';
import {
  accessSync,
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const buildSofficeEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  LANG: 'C.UTF-8',
  LC_ALL: 'C.UTF-8',
  HOME: process.env.HOME ?? '/tmp',
});

const canReadFile = (absolutePath: string): boolean => {
  try {
    accessSync(absolutePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

export const resolveExpectedPdfPath = (docxAbsolutePath: string): string => {
  const base = docxAbsolutePath.replace(/\.docx$/i, '');
  return `${base}.pdf`;
};

export const resolveExpectedPdfPathInDir = (docxAbsolutePath: string, outDir: string): string => {
  const fileName = docxAbsolutePath.split(/[/\\]/).pop()?.replace(/\.docx$/i, '.pdf') ?? 'out.pdf';
  return join(outDir, fileName);
};

export const convertDocxToPdf = async (
  docxAbsolutePath: string,
  outDir?: string,
): Promise<string | null> => {
  if (!existsSync(docxAbsolutePath)) {
    console.error('[docx-to-pdf] source missing', { docxAbsolutePath });
    return null;
  }
  if (!canReadFile(docxAbsolutePath)) {
    console.error('[docx-to-pdf] source not readable', { docxAbsolutePath });
    return null;
  }
  const targetDir = outDir ?? dirname(docxAbsolutePath);
  const finalPdf = resolveExpectedPdfPathInDir(docxAbsolutePath, targetDir);
  const tempOutDir = mkdtempSync(join(tmpdir(), 'soffice-out-'));
  const profileDir = mkdtempSync(join(tmpdir(), 'soffice-'));
  const userInstallation = `file://${profileDir.replace(/\\/g, '/')}`;
  try {
    await execFileAsync(
      'soffice',
      [
        `-env:UserInstallation=${userInstallation}`,
        '--headless',
        '--norestore',
        '--convert-to',
        'pdf',
        '--outdir',
        tempOutDir,
        docxAbsolutePath,
      ],
      { timeout: 120_000, env: buildSofficeEnv() },
    );
    const tempPdf = resolveExpectedPdfPathInDir(docxAbsolutePath, tempOutDir);
    if (!existsSync(tempPdf)) {
      console.error('[docx-to-pdf] temp output missing after soffice', {
        docxAbsolutePath,
        tempPdf,
      });
      return null;
    }
    mkdirSync(targetDir, { recursive: true });
    copyFileSync(tempPdf, finalPdf);
    if (!existsSync(finalPdf)) {
      console.error('[docx-to-pdf] failed to copy pdf to target', {
        docxAbsolutePath,
        finalPdf,
      });
      return null;
    }
    return finalPdf;
  } catch (error) {
    const execError = error as NodeJS.ErrnoException & { stderr?: Buffer; stdout?: Buffer };
    const errno = execError.code;
    if (errno === 'EACCES' || errno === 'EPERM') {
      console.error('[docx-to-pdf] permission denied writing pdf — pokrenite scripts/fix-upload-permissions.sh na hostu', {
        docxAbsolutePath,
        finalPdf,
      });
    }
    console.error('[docx-to-pdf] soffice failed', {
      docxAbsolutePath,
      message: execError.message,
      stderr: execError.stderr?.toString().trim(),
      stdout: execError.stdout?.toString().trim(),
    });
    return null;
  } finally {
    try {
      rmSync(tempOutDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
};
