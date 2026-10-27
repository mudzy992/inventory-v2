import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A fresh CI database always replays the CURRENT migration files, so editing
 * an already-applied migration (or changing schema.prisma without a migration)
 * is invisible to `prisma migrate deploy`. This module keeps a committed
 * snapshot of the schema + every migration SQL file and fails CI whenever the
 * checked-in history is rewritten or the snapshot was not regenerated.
 */

export interface MigrationManifestEntry {
  name: string;
  sha256: string;
}

export interface MigrationManifest {
  version: 1;
  provider: 'postgresql';
  schemaSha256: string;
  migrations: MigrationManifestEntry[];
  notes: string;
}

export interface MigrationSnapshot {
  schemaSha256: string;
  migrations: MigrationManifestEntry[];
  destructiveFindings: string[];
}

const MIGRATION_DIR_PATTERN = /^\d{14}_[a-z0-9_]+$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
export const REVIEW_MARKER = '-- migration-review:';

const PARTIAL_INDEX_NAME = 'document_jobs_active_source_unique';

const sha256 = (contents: Buffer): string =>
  createHash('sha256').update(contents).digest('hex');

const readRaw = (path: string): Buffer => readFileSync(path);

export const migrationDirectories = (migrationsPath: string): string[] =>
  readdirSync(migrationsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

/** Destructive DDL/DML must carry an explicit, human-written review marker. */
const DESTRUCTIVE_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: 'DROP TABLE', pattern: /^\s*drop\s+table\b/imu },
  { label: 'DROP COLUMN', pattern: /^\s*alter\s+table\b[\s\S]*?\bdrop\s+column\b/imu },
  { label: 'DROP INDEX', pattern: /^\s*drop\s+index\b/imu },
  { label: 'DROP TYPE/ENUM', pattern: /^\s*drop\s+(?:type|enum)\b/imu },
  { label: 'TRUNCATE', pattern: /^\s*truncate\b/imu },
  { label: 'DELETE', pattern: /^\s*delete\s+from\b/imu },
];

export const collectMigrationSnapshot = (backendRoot: string): MigrationSnapshot => {
  const migrationsPath = join(backendRoot, 'prisma', 'migrations');
  const schemaSha256 = sha256(readRaw(join(backendRoot, 'prisma', 'schema.prisma')));
  const migrations: MigrationManifestEntry[] = [];
  const destructiveFindings: string[] = [];

  for (const name of migrationDirectories(migrationsPath)) {
    const directory = join(migrationsPath, name);
    const files = readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
    if (!files.includes('migration.sql')) {
      // The violation is reported by verifyMigrationSnapshot; keep the hash
      // of the directory listing so the snapshot is still deterministic.
      migrations.push({ name, sha256: sha256(Buffer.from(files.sort().join('\n'))) });
      continue;
    }
    const sql = readRaw(join(directory, 'migration.sql'));
    migrations.push({ name, sha256: sha256(sql) });

    const text = sql.toString('utf8');
    const reviewed = text.includes(REVIEW_MARKER);
    if (!reviewed) {
      for (const { label, pattern } of DESTRUCTIVE_PATTERNS) {
        if (pattern.test(text)) {
          destructiveFindings.push(`${name}: ${label} requires ${REVIEW_MARKER} <reason>`);
        }
      }
    }
  }

  return { schemaSha256, migrations, destructiveFindings };
};

export const buildMigrationManifest = (backendRoot: string): MigrationManifest => {
  const snapshot = collectMigrationSnapshot(backendRoot);
  return {
    version: 1,
    provider: 'postgresql',
    schemaSha256: snapshot.schemaSha256,
    migrations: snapshot.migrations,
    notes:
      'Regenerate with `npm run prisma:manifest` AFTER adding a reviewed SQL migration. ' +
      'CI (`test:integration:migration-drift`) rejects rewritten migration files, ' +
      'unmanifested migrations and schema.prisma changes without a manifest update.',
  };
};

const isManifestEntry = (value: unknown): value is MigrationManifestEntry => {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<MigrationManifestEntry>;
  return (
    typeof entry.name === 'string' &&
    MIGRATION_DIR_PATTERN.test(entry.name) &&
    typeof entry.sha256 === 'string' &&
    SHA256_PATTERN.test(entry.sha256)
  );
};

export const parseMigrationManifest = (raw: string): MigrationManifest => {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') throw new Error('manifest must be a JSON object');
  const manifest = parsed as Partial<MigrationManifest>;
  if (manifest.version !== 1) throw new Error('manifest.version must be 1');
  if (manifest.provider !== 'postgresql') throw new Error('manifest.provider must be "postgresql"');
  if (typeof manifest.schemaSha256 !== 'string' || !SHA256_PATTERN.test(manifest.schemaSha256)) {
    throw new Error('manifest.schemaSha256 must be a lowercase sha256 hex digest');
  }
  if (!Array.isArray(manifest.migrations) || !manifest.migrations.every(isManifestEntry)) {
    throw new Error('manifest.migrations must be an array of { name, sha256 } entries');
  }
  if (typeof manifest.notes !== 'string' || manifest.notes.trim() === '') {
    throw new Error('manifest.notes must explain how to regenerate the snapshot');
  }
  return manifest as MigrationManifest;
};

/** Returns a list of human-readable drift violations; empty means clean. */
export const verifyMigrationSnapshot = (backendRoot: string): string[] => {
  const violations: string[] = [];
  const migrationsPath = join(backendRoot, 'prisma', 'migrations');
  const manifestPath = join(backendRoot, 'prisma', 'schema-drift.manifest.json');

  let manifest: MigrationManifest;
  try {
    manifest = parseMigrationManifest(readRaw(manifestPath).toString('utf8'));
  } catch (error) {
    return [`schema-drift.manifest.json is invalid: ${(error as Error).message}`];
  }

  const lock = readRaw(join(migrationsPath, 'migration_lock.toml')).toString('utf8');
  if (!/provider\s*=\s*["']postgresql["']/u.test(lock)) {
    violations.push('migration_lock.toml must pin provider = "postgresql"');
  }

  const snapshot = collectMigrationSnapshot(backendRoot);
  if (snapshot.schemaSha256 !== manifest.schemaSha256) {
    violations.push(
      'schema.prisma changed without a reviewed migration — add the SQL migration, ' +
        'then run `npm run prisma:manifest`',
    );
  }

  const expectedNames = manifest.migrations.map((entry) => entry.name);
  const actualNames = snapshot.migrations.map((entry) => entry.name);
  for (let index = 1; index < expectedNames.length; index += 1) {
    if (expectedNames[index - 1] >= expectedNames[index]) {
      violations.push(
        `manifest migration order is not strictly increasing: ${expectedNames[index - 1]} >= ${expectedNames[index]}`,
      );
    }
  }
  if (new Set(expectedNames).size !== expectedNames.length) {
    violations.push('manifest contains duplicate migration names');
  }
  if (expectedNames.join('\n') !== actualNames.join('\n')) {
    violations.push(
      `migration list changed (expected ${expectedNames.length}, found ${actualNames.length}) — ` +
        'never rewrite or reorder applied migrations; add a new one and run `npm run prisma:manifest`',
    );
  }

  for (const name of actualNames) {
    if (!MIGRATION_DIR_PATTERN.test(name)) {
      violations.push(`invalid migration directory name: ${name} (expected YYYYMMDDHHMMSS_slug)`);
    }
  }
  for (let index = 1; index < actualNames.length; index += 1) {
    if (actualNames[index - 1] >= actualNames[index]) {
      violations.push(
        `migration directories are not strictly increasing: ${actualNames[index - 1]} >= ${actualNames[index]}`,
      );
    }
  }

  for (const name of actualNames) {
    const directory = join(migrationsPath, name);
    const files = readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
    if (files.length !== 1 || files[0] !== 'migration.sql') {
      violations.push(`${name} must contain exactly one file: migration.sql (found ${files.join(', ')})`);
      continue;
    }
    const sql = readRaw(join(directory, 'migration.sql'));
    if (sql.length === 0) violations.push(`${name}/migration.sql is empty`);
    if (sql[0] === 0xef && sql[1] === 0xbb && sql[2] === 0xbf) {
      violations.push(`${name}/migration.sql must not contain a UTF-8 BOM`);
    }
  }

  const expectedHashes = new Map(manifest.migrations.map((entry) => [entry.name, entry.sha256]));
  for (const entry of snapshot.migrations) {
    const expected = expectedHashes.get(entry.name);
    if (expected !== undefined && expected !== entry.sha256) {
      violations.push(
        `${entry.name}/migration.sql was rewritten after being recorded — applied migrations are immutable`,
      );
    }
  }

  violations.push(...snapshot.destructiveFindings);

  // SQL-only object that Prisma's schema DSL cannot express. Losing it would
  // silently reintroduce the TOCTOU double-conversion race.
  const indexMigrations = actualNames.filter((name) => {
    const path = join(migrationsPath, name, 'migration.sql');
    let text: string;
    try {
      text = readRaw(path).toString('utf8');
    } catch {
      return false;
    }
    return new RegExp(`create\\s+unique\\s+index\\s+"?${PARTIAL_INDEX_NAME}"?`, 'iu').test(text);
  });
  if (indexMigrations.length !== 1) {
    violations.push(
      `expected exactly one migration creating ${PARTIAL_INDEX_NAME}, found ${indexMigrations.length}`,
    );
  }
  const schema = readRaw(join(backendRoot, 'prisma', 'schema.prisma')).toString('utf8');
  if (!schema.includes(PARTIAL_INDEX_NAME)) {
    violations.push(`schema.prisma must still document the SQL-only ${PARTIAL_INDEX_NAME} index`);
  }
  const readme = readRaw(join(migrationsPath, 'README.md')).toString('utf8');
  if (!readme.includes(PARTIAL_INDEX_NAME)) {
    violations.push(`migrations README must document the SQL-only ${PARTIAL_INDEX_NAME} index`);
  }

  return violations;
};
