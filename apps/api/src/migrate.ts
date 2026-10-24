import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import argon2 from 'argon2';
import {pool,type DB} from './lib/db.js';

const migrations=['001_init.sql','002_pilot_seed.sql','003_brand_and_staff.sql','004_guest_services.sql','005_game_rewards.sql'];

async function ensureInitialAdmin(client: DB) {
  const email=process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password=process.env.INITIAL_ADMIN_PASSWORD;
  const displayName=process.env.INITIAL_ADMIN_NAME?.trim()||'Administración';
  if (!email&&!password) return;
  if (!email||!password||password.length<12) {
    console.warn('Administrador inicial omitido: define INITIAL_ADMIN_EMAIL y una INITIAL_ADMIN_PASSWORD de mínimo 12 caracteres.');
    return;
  }
  const existing=await client.query("SELECT 1 FROM staff_users WHERE role='admin' LIMIT 1");
  if (existing.rowCount) return;
  const hash=await argon2.hash(password);
  await client.query(`INSERT INTO staff_users(email,password_hash,display_name,role)
    VALUES($1,$2,$3,'admin')`,[email,hash,displayName]);
  console.log('Administrador inicial creado. Retira INITIAL_ADMIN_PASSWORD de las variables del servidor.');
}

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
    await ensureInitialAdmin(client);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)',[8142026]).catch(()=>undefined);
    client.release();
  }
}
