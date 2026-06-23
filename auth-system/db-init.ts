import pg from 'pg';
import dotenv from 'dotenv';

// Run from root
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const initDb = async () => {
  try {
    // Create users table with roles and access request tracking
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        access_requested BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
    `);
    console.log('Table "users" created/exists with name column.');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL PRIMARY KEY,
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);
    console.log('Table "session" created/exists.');

    // Add initial admin user
    const initialAdmin = process.env.INITIAL_ADMIN_EMAIL;
    if (initialAdmin) {
      await pool.query(
        "INSERT INTO users (email, role) VALUES ($1, 'admin') ON CONFLICT (email) DO UPDATE SET role = 'admin'",
        [initialAdmin]
      );
      console.log(`Ensured initial admin user: ${initialAdmin}`);
    } else {
      console.warn('No INITIAL_ADMIN_EMAIL found in environment variables.');
    }

    // If there's another initial user from env, add them as approved
    if (process.env.INITIAL_ALLOWED_USER && process.env.INITIAL_ALLOWED_USER !== initialAdmin) {
      await pool.query(
        "INSERT INTO users (email, role) VALUES ($1, 'approved') ON CONFLICT (email) DO NOTHING",
        [process.env.INITIAL_ALLOWED_USER]
      );
      console.log(`Added initial allowed user from env: ${process.env.INITIAL_ALLOWED_USER}`);
    }
  } catch (err) {
    console.error('DB Init Error:', err);
  } finally {
    await pool.end();
  }
};

initDb();
