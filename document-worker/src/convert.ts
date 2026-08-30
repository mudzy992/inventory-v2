import { execFile } from 'node:child_process';
import {
  accessSync,
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import type { WorkerConfig } from './config';
import { SUPPORTED_SOURCE_EXTENSIONS, type DocumentSourceFormat } from './types';

const execFileAsync = promisify(execFile);

export class ConversionError extends Error {}

/**
 * Sprečava path traversal — backend ionako kontroliše ove relativne
 * putanje (nisu direktan korisnički unos), ali defense-in-depth je jeftin
 * i ovdje pravilan: worker NIKAD ne smije čitati/pisati van UPLOAD_DIR-a
 * na osnovu payload sadržaja koji dolazi preko mreže (Redis).
 */
const safeResolveWithinRoot = (root: string, relativePath: string): string => {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(root, relativePath);
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(resolvedRoot + sep)) {
    throw new ConversionError(`Path traversal blocked: "${relativePath}" escapes upload root`);
  }
  return resolvedPath;
};

const canRead = (absolutePath: string): boolean => {
  try {
    accessSync(absolutePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

const buildSofficeEnv = (homeDir: string): NodeJS.ProcessEnv => ({
  ...process.env,
  LANG: 'C.UTF-8',
  LC_ALL: 'C.UTF-8',
  HOME: homeDir,
  XDG_CACHE_HOME: join(homeDir, '.cache'),
  XDG_CONFIG_HOME: join(homeDir, '.config'),
  TMPDIR: homeDir,
});

export interface ConvertToPdfInput {
  documentJobId: string;
  sourceFormat: DocumentSourceFormat;
  sourceRelativePath: string;
  resultRelativePath: string;
}

/**
 * Konvertuje jedan dokument (DOCX/XLSX/ODT) u PDF preko `soffice --headless
 * --convert-to pdf`. Svaki poziv dobija SVOJ izolovan `-env:UserInstallation`
 * profil i izlazni direktorij (mkdtempSync) — kritično za bezbjedan
 * `concurrency > 1` (LibreOffice profil-lock bi inače blokirao paralelne
 * konverzije ili ih tiho serijalizovao). Sav privremeni rad ide u OS tmp
 * (odvojeno od UPLOAD_DIR "generated" prostora), i BEZ OBZIRA na ishod
 * (uspjeh/timeout/crash) briše se u `finally`.
 *
 * Rezultat se upisuje ATOMSKI (piše se u `<cilj>.tmp-<jobId>` pa
 * `renameSync` na konačno ime) da eventualni paralelni čitalac (backend
 * download endpoint) nikad ne pročita polu-upisan PDF.
 */
export const convertToPdf = async (
  config: WorkerConfig,
  input: ConvertToPdfInput,
): Promise<string> => {
  const expectedExt = SUPPORTED_SOURCE_EXTENSIONS[input.sourceFormat];
  if (!expectedExt) {
    throw new ConversionError(`Unsupported sourceFormat: ${input.sourceFormat}`);
  }
  if (extname(input.sourceRelativePath).toLowerCase() !== expectedExt) {
    throw new ConversionError(
      `sourceRelativePath extension does not match sourceFormat ${input.sourceFormat}: ${input.sourceRelativePath}`,
    );
  }

  const sourceAbsolute = safeResolveWithinRoot(config.uploadDir, input.sourceRelativePath);
  const resultAbsolute = safeResolveWithinRoot(config.uploadDir, input.resultRelativePath);

  if (!existsSync(sourceAbsolute)) {
    throw new ConversionError(`Source file missing: ${sourceAbsolute}`);
  }
  if (!canRead(sourceAbsolute)) {
    throw new ConversionError(`Source file not readable: ${sourceAbsolute}`);
  }

  mkdirSync(config.tmpDir, { recursive: true });
  const jobTmpRoot = mkdtempSync(join(config.tmpDir, `job-${input.documentJobId}-`));
  const profileDir = join(jobTmpRoot, 'profile');
  const outDir = join(jobTmpRoot, 'out');
  mkdirSync(profileDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  const userInstallation = `file://${profileDir.replace(/\\/g, '/')}`;

  try {
    await execFileAsync(
      config.sofficeBinary,
      [
        `-env:UserInstallation=${userInstallation}`,
        '--headless',
        '--norestore',
        '--convert-to',
        'pdf',
        '--outdir',
        outDir,
        sourceAbsolute,
      ],
      {
        timeout: config.convertTimeoutMs,
        killSignal: 'SIGKILL', // soffice ponekad ignoriše SIGTERM — SIGKILL garantuje da posao ne visi
        env: buildSofficeEnv(profileDir),
      },
    );

    const sourceBaseName = sourceAbsolute
      .split(/[/\\]/)
      .pop()!
      .replace(new RegExp(`${expectedExt}$`, 'i'), '.pdf');
    const tempPdf = join(outDir, sourceBaseName);
    if (!existsSync(tempPdf)) {
      throw new ConversionError(
        `soffice reported success but expected output missing: ${tempPdf} (documentJobId=${input.documentJobId})`,
      );
    }

    // Atomski upis: piši pored konačnog imena pa rename (ista particija —
    // oboje su unutar UPLOAD_DIR-a), da paralelni čitalac (backend download
    // endpoint) nikad ne vidi polu-upisan fajl.
    mkdirSync(dirname(resultAbsolute), { recursive: true });
    const stagingPath = `${resultAbsolute}.tmp-${input.documentJobId}`;
    copyFileSync(tempPdf, stagingPath);
    renameSync(stagingPath, resultAbsolute);

    return resultAbsolute;
  } catch (error) {
    if (error instanceof ConversionError) {
      throw error;
    }
    const execError = error as NodeJS.ErrnoException & {
      killed?: boolean;
      signal?: string;
      stderr?: Buffer | string;
      stdout?: Buffer | string;
    };
    if (execError.killed || execError.signal === 'SIGKILL') {
      throw new ConversionError(
        `soffice timed out after ${config.convertTimeoutMs}ms and was killed (documentJobId=${input.documentJobId})`,
      );
    }
    throw new ConversionError(
      `soffice conversion failed: ${execError.message} ${execError.stderr ? `stderr=${execError.stderr.toString().trim()}` : ''}`,
    );
  } finally {
    // Cleanup je BEZUSLOVAN — bez obzira na uspjeh/neuspjeh/timeout, ne
    // smiju ostati siročad profil/izlazni/staging fajlovi na disku. Staging
    // fajl je već preimenovan (uklonjen) na uspješnom putu; force:true ga
    // bezopasno preskače ako ne postoji.
    rmSync(jobTmpRoot, { recursive: true, force: true });
  }
};
