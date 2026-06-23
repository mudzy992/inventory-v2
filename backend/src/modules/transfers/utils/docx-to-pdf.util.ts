import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
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
    return null;
  }
  const targetDir = outDir ?? dirname(docxAbsolutePath);
  const expectedPdf = resolveExpectedPdfPathInDir(docxAbsolutePath, targetDir);
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
        targetDir,
        docxAbsolutePath,
      ],
      { timeout: 120_000, env: buildSofficeEnv() },
    );
    return existsSync(expectedPdf) ? expectedPdf : null;
  } catch {
    return null;
  } finally {
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
};
