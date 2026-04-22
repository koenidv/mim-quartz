import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envConfig = dotenv.config({ path: path.resolve(__dirname, '../../.env') }).parsed;

const dbConfig = {
  connectionString: envConfig?.DATABASE_URL || process.env.DATABASE_URL,
};
console.log('Connecting to:', dbConfig.connectionString?.replace(/:[^:@]+@/, ':***@'));

const pool = new pg.Pool(dbConfig);

const initDb = async () => {
  try {
    // Create allowed_users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS allowed_users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table "allowed_users" created or already exists.');

    // Create session table for connect-pg-simple
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL PRIMARY KEY,
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);
    console.log('Table "session" created or already exists.');

    // Add a test user if specified in env
    if (process.env.INITIAL_ALLOWED_USER) {
      await pool.query('INSERT INTO allowed_users (email) VALUES ($1) ON CONFLICT (email) DO NOTHING', [process.env.INITIAL_ALLOWED_USER]);
      console.log(`Added initial user: ${process.env.INITIAL_ALLOWED_USER}`);
    }

  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    await pool.end();
  }
};

initDb();
