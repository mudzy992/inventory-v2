import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  REVIEW_MARKER,
  buildMigrationManifest,
  parseMigrationManifest,
  verifyMigrationSnapshot,
  type MigrationManifest,
} from './migration-drift.util';

const INDEX_NAME = 'document_jobs_active_source_unique';
const FIRST = '20260101000000_init';
const SECOND = '20260102000000_partial_index';

const manifestPath = (root: string): string =>
  join(root, 'prisma', 'schema-drift.manifest.json');

const sqlPath = (root: string, name: string): string =>
  join(root, 'prisma', 'migrations', name, 'migration.sql');

const writeManifest = (root: string, manifest: MigrationManifest): void => {
  writeFileSync(manifestPath(root), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
};

const readManifest = (root: string): MigrationManifest =>
  parseMigrationManifest(readFileSync(manifestPath(root), 'utf8'));

const makeFixture = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'inventory-migration-drift-'));
  const migrations = join(root, 'prisma', 'migrations');
  mkdirSync(join(migrations, FIRST), { recursive: true });
  mkdirSync(join(migrations, SECOND), { recursive: true });
  writeFileSync(
    join(root, 'prisma', 'schema.prisma'),
    `// SQL-only index ${INDEX_NAME} is documented here.\nmodel DocumentJob { id String @id }\n`,
  );
  writeFileSync(join(migrations, 'README.md'), `# Migrations\n\nKeeps ${INDEX_NAME}.\n`);
  writeFileSync(join(migrations, 'migration_lock.toml'), 'provider = "postgresql"\n');
  writeFileSync(sqlPath(root, FIRST), 'CREATE TABLE "document_jobs" ("id" TEXT NOT NULL);\n');
  writeFileSync(
    sqlPath(root, SECOND),
    `CREATE UNIQUE INDEX "${INDEX_NAME}" ON "document_jobs"("id") WHERE "id" <> '';\n`,
  );
  writeManifest(root, buildMigrationManifest(root));
  return root;
};

const withFixture = (run: (root: string) => void): void => {
  const root = makeFixture();
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

const appendFile = (path: string, contents: string): void => {
  writeFileSync(path, `${readFileSync(path, 'utf8')}${contents}`);
};

describe('migration drift guard', () => {
  it('accepts a fixture whose schema and migration history match the manifest', () => {
    withFixture((root) => {
      assert.deepEqual(verifyMigrationSnapshot(root), []);
      assert.equal(readManifest(root).migrations.length, 2);
    });
  });

  it('fails when schema.prisma changes without a migration', () => {
    withFixture((root) => {
      appendFile(join(root, 'prisma', 'schema.prisma'), '\n// new field\n');
      assert.match(verifyMigrationSnapshot(root).join('\n'), /schema\.prisma changed/u);
    });
  });

  it('fails when an already-recorded migration SQL file is rewritten', () => {
    withFixture((root) => {
      writeFileSync(sqlPath(root, FIRST), 'CREATE TABLE "document_jobs" ("id" TEXT);\n');
      assert.match(verifyMigrationSnapshot(root).join('\n'), /was rewritten/u);
    });
  });

  it('fails when a new migration is added without regenerating the manifest', () => {
    withFixture((root) => {
      const added = '20260103000000_add_column';
      mkdirSync(join(root, 'prisma', 'migrations', added));
      writeFileSync(sqlPath(root, added), 'ALTER TABLE "document_jobs" ADD COLUMN "x" TEXT;\n');
      assert.match(verifyMigrationSnapshot(root).join('\n'), /migration list changed/u);
    });
  });

  it('fails when a manifested migration disappears', () => {
    withFixture((root) => {
      rmSync(join(root, 'prisma', 'migrations', FIRST), { recursive: true, force: true });
      assert.match(verifyMigrationSnapshot(root).join('\n'), /migration list changed/u);
    });
  });

  it('fails on invalid directory names and non-increasing manifest order', () => {
    withFixture((root) => {
      mkdirSync(join(root, 'prisma', 'migrations', 'not-a-timestamp'));
      writeFileSync(sqlPath(root, 'not-a-timestamp'), 'SELECT 1;\n');
      assert.match(verifyMigrationSnapshot(root).join('\n'), /invalid migration directory name/u);
    });

    withFixture((root) => {
      const manifest = readManifest(root);
      manifest.migrations.reverse();
      writeManifest(root, manifest);
      assert.match(verifyMigrationSnapshot(root).join('\n'), /manifest migration order/u);
    });
  });

  it('fails on extra files, empty SQL and a wrong provider lock', () => {
    withFixture((root) => {
      writeFileSync(join(root, 'prisma', 'migrations', FIRST, 'notes.txt'), 'oops');
      assert.match(verifyMigrationSnapshot(root).join('\n'), /exactly one file/u);
    });

    withFixture((root) => {
      writeFileSync(sqlPath(root, FIRST), '');
      assert.match(verifyMigrationSnapshot(root).join('\n'), /is empty/u);
    });

    withFixture((root) => {
      writeFileSync(join(root, 'prisma', 'migrations', 'migration_lock.toml'), 'provider = "mysql"\n');
      assert.match(verifyMigrationSnapshot(root).join('\n'), /must pin provider/u);
    });
  });

  it('requires an explicit review marker for destructive SQL', () => {
    withFixture((root) => {
      appendFile(sqlPath(root, FIRST), '\nDROP TABLE "document_jobs";\n');
      assert.match(verifyMigrationSnapshot(root).join('\n'), /DROP TABLE requires/u);
    });

    withFixture((root) => {
      appendFile(sqlPath(root, FIRST), `\n${REVIEW_MARKER} table replaced in 20260104\nDROP TABLE "document_jobs";\n`);
      writeManifest(root, buildMigrationManifest(root));
      assert.deepEqual(verifyMigrationSnapshot(root), []);
    });
  });

  it('guards the SQL-only partial index and its documentation', () => {
    withFixture((root) => {
      writeFileSync(sqlPath(root, SECOND), 'SELECT 1;\n');
      assert.match(verifyMigrationSnapshot(root).join('\n'), /expected exactly one migration creating/u);
    });

    withFixture((root) => {
      writeFileSync(join(root, 'prisma', 'schema.prisma'), 'model DocumentJob { id String @id }\n');
      assert.match(verifyMigrationSnapshot(root).join('\n'), /must still document/u);
    });

    withFixture((root) => {
      writeFileSync(join(root, 'prisma', 'migrations', 'README.md'), '# Migrations\n');
      assert.match(verifyMigrationSnapshot(root).join('\n'), /README must document/u);
    });
  });

  it('rejects a malformed manifest and accepts a regenerated one', () => {
    withFixture((root) => {
      writeFileSync(manifestPath(root), '{"version":1}');
      assert.match(verifyMigrationSnapshot(root).join('\n'), /manifest.*invalid/u);
    });

    withFixture((root) => {
      appendFile(sqlPath(root, FIRST), '\n-- harmless reviewed change\n');
      appendFile(join(root, 'prisma', 'schema.prisma'), '\n// schema change\n');
      writeManifest(root, buildMigrationManifest(root));
      assert.deepEqual(verifyMigrationSnapshot(root), []);
    });
  });
});
