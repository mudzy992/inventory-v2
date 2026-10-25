import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

const main = async (): Promise<void> => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to verify PostgreSQL migration invariants');
  }

  const parsedConnectionString = new URL(connectionString);
  parsedConnectionString.searchParams.delete('schema');
  const client = new Client({ connectionString: parsedConnectionString.toString() });

  let connected = false;
  let transactionOpen = false;
  try {
    await client.connect();
    connected = true;
    const result = await client.query<{
      isUnique: boolean;
      isPartial: boolean;
      indexDefinition: string;
    }>(
      `SELECT
         index_info.indisunique AS "isUnique",
         index_info.indpred IS NOT NULL AS "isPartial",
         pg_get_indexdef(index_info.indexrelid) AS "indexDefinition"
       FROM pg_index AS index_info
       JOIN pg_class AS index_class ON index_class.oid = index_info.indexrelid
       JOIN pg_namespace AS namespace ON namespace.oid = index_class.relnamespace
       WHERE namespace.nspname = current_schema()
         AND index_class.relname = $1`,
      ['document_jobs_active_source_unique'],
    );

    const index = result.rows[0];
    assert.ok(index, 'the active DocumentJob unique index must be installed by migrations');
    assert.equal(index.isUnique, true, 'the active DocumentJob index must be unique');
    assert.equal(index.isPartial, true, 'the active DocumentJob index must remain partial');

    const definition = index.indexDefinition.toLowerCase();
    assert.match(definition, /sourcetype/);
    assert.match(definition, /sourceid/);
    assert.match(definition, /queued/);
    assert.match(definition, /running/);

    const sourceType = 'ci-migration-invariant';
    const sourceId = `ci-${randomUUID()}`;
    const firstJobId = randomUUID();
    const secondJobId = randomUUID();
    const insertJob = (id: string) =>
      client.query(
        `INSERT INTO document_jobs (
           id, "sourceType", "sourceId", "sourceFormat", "sourceRelativePath",
           "resultRelativePath", "updatedAt"
         ) VALUES ($1, $2, $3, 'docx', $4, $5, NOW())`,
        [
          id,
          sourceType,
          sourceId,
          `ci/${id}.docx`,
          `ci/${id}.pdf`,
        ],
      );

    await client.query('BEGIN');
    transactionOpen = true;
    await insertJob(firstJobId);
    await client.query('SAVEPOINT before_duplicate_active_job');

    let duplicateRejectedByUniqueIndex = false;
    try {
      await insertJob(secondJobId);
    } catch (error: unknown) {
      duplicateRejectedByUniqueIndex =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505';
    }
    assert.equal(
      duplicateRejectedByUniqueIndex,
      true,
      'PostgreSQL must reject a second queued job for the same source',
    );

    await client.query('ROLLBACK TO SAVEPOINT before_duplicate_active_job');
    await client.query('RELEASE SAVEPOINT before_duplicate_active_job');
    await client.query(`UPDATE document_jobs SET status = 'done' WHERE id = $1`, [firstJobId]);
    await insertJob(secondJobId);

    const activeJobs = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM document_jobs
       WHERE "sourceType" = $1
         AND "sourceId" = $2
         AND status IN ('queued', 'running')`,
      [sourceType, sourceId],
    );
    assert.equal(
      activeJobs.rows[0]?.count,
      '1',
      'a completed job must not prevent a new active job for the same source',
    );

    await client.query('ROLLBACK');
    transactionOpen = false;
    console.log(
      'Verified PostgreSQL migration invariant: one active DocumentJob per source, with completed jobs reusable.',
    );
  } finally {
    if (connected) {
      if (transactionOpen) {
        await client.query('ROLLBACK');
      }
      await client.end();
    }
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
