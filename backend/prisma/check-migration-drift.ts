import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  buildMigrationManifest,
  verifyMigrationSnapshot,
} from './utils/migration-drift.util';

/**
 * CI/release gate: schema.prisma and the checked-in SQL migration history must
 * match the committed snapshot. Runs without a database, so it also protects
 * branches before `prisma migrate deploy` is executed.
 *
 *   node --import tsx prisma/check-migration-drift.ts            # verify
 *   node --import tsx prisma/check-migration-drift.ts --update   # regenerate
 */

const main = (): void => {
  const root = resolve('.');
  const manifestPath = join(root, 'prisma', 'schema-drift.manifest.json');

  if (process.argv.includes('--update')) {
    const manifest = buildMigrationManifest(root);
    assert.equal(manifest.migrations.length > 0, true, 'no migration directories found');
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(
      `Updated migration snapshot: ${manifest.migrations.length} migrations, ` +
        `schema ${manifest.schemaSha256.slice(0, 12)}…`,
    );
    return;
  }

  const violations = verifyMigrationSnapshot(root);
  if (violations.length > 0) {
    console.error('Migration/schema drift detected:');
    for (const violation of violations) console.error(`  - ${violation}`);
    console.error('\nResolve the drift, then run `npm run prisma:manifest` and commit the manifest.');
    process.exitCode = 1;
    return;
  }

  const manifest = buildMigrationManifest(root);
  console.log(
    `Migration drift check passed (${manifest.migrations.length} immutable migrations, ` +
      'schema snapshot matches, no unreviewed destructive SQL).',
  );
};

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
