import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const SOFFICE_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  LANG: 'C.UTF-8',
  LC_ALL: 'C.UTF-8',
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
    return null;
  }
  const targetDir = outDir ?? dirname(docxAbsolutePath);
  const expectedPdf = resolveExpectedPdfPathInDir(docxAbsolutePath, targetDir);
  try {
    await execFileAsync(
      'soffice',
      ['--headless', '--convert-to', 'pdf', '--outdir', targetDir, docxAbsolutePath],
      { timeout: 120_000, env: SOFFICE_ENV },
    );
    return existsSync(expectedPdf) ? expectedPdf : null;
  } catch {
    return null;
  }
};
