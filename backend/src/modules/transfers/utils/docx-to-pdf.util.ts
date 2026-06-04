import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const convertDocxToPdf = async (
  docxAbsolutePath: string,
  pdfAbsolutePath: string,
): Promise<boolean> => {
  if (!existsSync(docxAbsolutePath)) {
    return false;
  }
  const outDir = dirname(pdfAbsolutePath);
  try {
    await execFileAsync(
      'soffice',
      ['--headless', '--convert-to', 'pdf', '--outdir', outDir, docxAbsolutePath],
      { timeout: 120_000 },
    );
    return existsSync(pdfAbsolutePath);
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
