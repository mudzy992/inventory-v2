import { spawn } from 'node:child_process';
import {
  accessSync,
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  unlinkSync,
} from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import type { WorkerConfig } from './config';
import { SUPPORTED_SOURCE_EXTENSIONS, type DocumentSourceFormat } from './types';

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
    throw new ConversionError(`Path traversal blocked: escapes upload root`);
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

interface RunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  stderr: string;
}

/**
 * Pokreće soffice u SOPSTVENOJ process grupi (`detached: true` na POSIX-u —
 * uvijek POSIX u Docker/Linux okruženju) i, na timeout, ubija CIJELU grupu
 * (`process.kill(-pid, 'SIGKILL')`, negativan PID = signal cijeloj grupi),
 * ne samo neposredan child proces.
 *
 * OVO JE NAMJERNA ZAMJENA za `child_process.execFile`-ov ugrađeni `timeout`
 * — Node-ov built-in `timeout`/`killSignal` ubija ISKLJUČIVO proces koji je
 * sam pokrenuo (direktan child), NE i eventualne pod-procese koje taj child
 * dalje forkuje/exec-uje. Za LibreOffice (čije tačno stablo procesa zavisi
 * od distribucije/verzije — wrapper skripta koja exec-uje `soffice.bin`,
 * eventualni pomoćni procesi za embedded objekte...) to bi moglo ostaviti
 * "osirotjele" procese da žive dalje i troše CPU/RAM i nakon što mi
 * mislimo da smo posao ubili. Process-group kill garantovano pogađa sve.
 */
const runSofficeWithHardTimeout = (
  binary: string,
  args: string[],
  opts: { timeoutMs: number; env: NodeJS.ProcessEnv },
): Promise<RunResult> =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(binary, args, {
      env: opts.env,
      detached: true, // child postaje lider SVOJE process grupe (pgid === pid)
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let timedOut = false;
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      if (typeof child.pid === 'number') {
        try {
          // Negativan PID == "pošalji signal cijeloj process grupi", ne
          // samo jednom procesu (Node/POSIX konvencija za process.kill).
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          // Grupa je možda već nestala (proces upravo završio u istom
          // trenutku) — bezopasno, ignorišemo.
        }
      }
    }, opts.timeoutMs);

    child.stderr?.on('data', (chunk: Buffer) => {
      // Ograničavamo koliko stderr-a čuvamo u memoriji — dovoljno za
      // dijagnostiku, ne toliko da "brbljivi" proces isprazni RAM.
      if (stderr.length < 8192) stderr += chunk.toString('utf8');
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Proces je izašao, ali eventualna "osirotjela" braća/djeca iz iste
      // grupe (ako ih je bilo, mimo glavnog procesa) mogu i dalje raditi
      // ako sam glavni proces izašao PRIJE njih. Best-effort: pokušaj
      // ubiti ostatak grupe i na čistom izlasku — ako grupe više nema,
      // poziv samo baci (ignorisanu) grešku.
      if (typeof child.pid === 'number') {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          // grupa već prazna — očekivano u normalnom slučaju
        }
      }
      resolvePromise({ code, signal, timedOut, stderr });
    });
  });

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
      `sourceRelativePath extension does not match sourceFormat ${input.sourceFormat}`,
    );
  }
  // Zaštita od "pogrešnog fajla overwrite-a": resultRelativePath dolazi iz
  // BullMQ payload-a (backend-kontrolisan, ali defense-in-depth je jeftin)
  // — bez ove provjere, pogrešno/buduće izmijenjen pozivalac bi mogao
  // proslijediti npr. putanju POSTOJEĆEG .docx obrasca kao "rezultat" i
  // worker bi ga nesvjesno prepisao PDF bajtovima pod pogrešnim imenom.
  if (extname(input.resultRelativePath).toLowerCase() !== '.pdf') {
    throw new ConversionError(`resultRelativePath must end with .pdf`);
  }

  const sourceAbsolute = safeResolveWithinRoot(config.uploadDir, input.sourceRelativePath);
  const resultAbsolute = safeResolveWithinRoot(config.uploadDir, input.resultRelativePath);

  if (!existsSync(sourceAbsolute)) {
    throw new ConversionError(`Source file missing`);
  }
  if (!canRead(sourceAbsolute)) {
    throw new ConversionError(`Source file not readable`);
  }

  mkdirSync(config.tmpDir, { recursive: true });
  const jobTmpRoot = mkdtempSync(join(config.tmpDir, `job-${input.documentJobId}-`));
  const profileDir = join(jobTmpRoot, 'profile');
  const outDir = join(jobTmpRoot, 'out');
  mkdirSync(profileDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  const userInstallation = `file://${profileDir.replace(/\\/g, '/')}`;

  // LibreOffice, čak i u --headless --convert-to (batch) modu, u nekim
  // verzijama i dalje prolazi kroz "otvori pa eksportuj" tok i može
  // ostaviti collision-detection lock fajl (`.~lock.<ime>#`) POKRAJ
  // IZVORNOG fajla (u UPLOAD_DIR-u, ne u našem privremenom profilu) —
  // najčešće se sam ukloni na čist izlazak, ali NE i nakon SIGKILL-a.
  // Čistimo ga best-effort i prije i poslije, da se ne gomilaju "smeće"
  // fajlovi u dijeljenom uploads volume-u nakon timeout-ovanih poslova.
  const lockFilePath = join(dirname(sourceAbsolute), `.~lock.${sourceAbsolute.split(/[/\\]/).pop()}#`);
  const cleanupLockFile = (): void => {
    try {
      unlinkSync(lockFilePath);
    } catch {
      // nije ni postojao — očekivano u velikoj većini slučajeva
    }
  };

  try {
    cleanupLockFile();

    const result = await runSofficeWithHardTimeout(
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
      { timeoutMs: config.convertTimeoutMs, env: buildSofficeEnv(profileDir) },
    );

    if (result.timedOut) {
      throw new ConversionError(
        `soffice timed out after ${config.convertTimeoutMs}ms and was killed (process group)`,
      );
    }
    if (result.code !== 0) {
      throw new ConversionError(
        `soffice exited with code=${result.code} signal=${result.signal ?? 'none'}` +
          (result.stderr ? ` stderr=${result.stderr.trim().slice(0, 500)}` : ''),
      );
    }

    const sourceBaseName = sourceAbsolute
      .split(/[/\\]/)
      .pop()!
      .replace(new RegExp(`${expectedExt}$`, 'i'), '.pdf');
    const tempPdf = join(outDir, sourceBaseName);
    if (!existsSync(tempPdf)) {
      throw new ConversionError(`soffice reported success but expected output file is missing`);
    }

    // Atomski upis: piši pored konačnog imena pa rename (ista particija —
    // oboje su unutar UPLOAD_DIR-a), da paralelni čitalac (backend download
    // endpoint) nikad ne vidi polu-upisan fajl.
    mkdirSync(dirname(resultAbsolute), { recursive: true });
    const stagingPath = `${resultAbsolute}.tmp-${input.documentJobId}`;
    try {
      copyFileSync(tempPdf, stagingPath);
      renameSync(stagingPath, resultAbsolute);
    } catch (writeErr) {
      // Ako je copy uspio ali rename nije (npr. neočekivan FS problem),
      // ne ostavljamo "tmp-*" smeće u UPLOAD_DIR-u (van naše jobTmpRoot
      // čistke ispod, jer je staging namjerno u KRAJNJEM direktoriju, ne
      // u privremenom).
      try {
        unlinkSync(stagingPath);
      } catch {
        // stagingPath možda nikad nije ni kreiran (copyFileSync je taj koji
        // je pao) — bezopasno.
      }
      throw writeErr;
    }

    return resultAbsolute;
  } catch (error) {
    if (error instanceof ConversionError) {
      throw error;
    }
    const err = error as NodeJS.ErrnoException;
    throw new ConversionError(`soffice conversion failed: ${err.message}`);
  } finally {
    // Cleanup je BEZUSLOVAN — bez obzira na uspjeh/neuspjeh/timeout, ne
    // smiju ostati siročad profil/izlazni direktoriji na disku.
    rmSync(jobTmpRoot, { recursive: true, force: true });
    cleanupLockFile();
  }
};
