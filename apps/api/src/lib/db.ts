import pg from 'pg';
import 'dotenv/config';

export const pool = new pg.Pool({connectionString: process.env.DATABASE_URL});
export async function inTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const result = await fn(c);
    await c.query('COMMIT');
    return result;
  } catch (error) {
    await c.query('ROLLBACK');
    throw error;
  } finally { c.release(); }
}
export type DB = pg.PoolClient;
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
