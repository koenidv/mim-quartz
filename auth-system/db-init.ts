import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Run from root
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const initDb = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS allowed_users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table "allowed_users" created/exists.');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL PRIMARY KEY,
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);
    console.log('Table "session" created/exists.');

    if (process.env.INITIAL_ALLOWED_USER) {
      await pool.query('INSERT INTO allowed_users (email) VALUES ($1) ON CONFLICT (email) DO NOTHING', [process.env.INITIAL_ALLOWED_USER]);
      console.log(`Added initial user: ${process.env.INITIAL_ALLOWED_USER}`);
    }
  } catch (err) {
    console.error('DB Init Error:', err);
  } finally {
    await pool.end();
  }
};

initDb();
