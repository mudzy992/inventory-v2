import assert from 'node:assert/strict';
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
    console.log('Verified SQL-only migration invariant: one active DocumentJob per source.');
  } finally {
    if (connected) {
      await client.end();
    }
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
