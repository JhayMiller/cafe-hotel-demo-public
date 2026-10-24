import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {pool} from './lib/db.js';

const migrations=['001_init.sql','002_pilot_seed.sql'];

export async function runMigrations() {
  const client=await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)',[8142026]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    for (const name of migrations) {
      const applied=await client.query('SELECT 1 FROM schema_migrations WHERE name=$1',[name]);
      if (applied.rowCount) continue;
      const file=fileURLToPath(new URL(`../sql/${name}`,import.meta.url));
      await client.query(await fs.readFile(file,'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]);
      console.log(`Migración aplicada: ${name}`);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)',[8142026]).catch(()=>undefined);
    client.release();
  }
}
