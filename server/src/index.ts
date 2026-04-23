import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import pg from 'pg';
import connectPgSimple from 'connect-pg-simple';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';
import { minimatch } from 'minimatch';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find project root (one level up from server/src -> server, then one more -> root)
const projectRoot = path.resolve(__dirname, '../..');
const publicDir = path.join(projectRoot, 'public');
const configPath = path.join(projectRoot, 'quartz.config.ts');

// Load environment variables from .env in root
dotenv.config({ path: path.join(projectRoot, '.env') });

// Database configuration
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
const PgSession = connectPgSimple(session);

const app = express();
const port = process.env.PORT || 3000;

// Health check for Coolify - returns 200 immediately
app.get('/health', (req, res) => res.send('OK'));

// Session & Passport setup
app.use(session({
  store: new PgSession({ pool, tableName: 'session' }),
  secret: process.env.SESSION_SECRET || 'quartz-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }
}));
app.use(passport.initialize());
app.use(passport.session());

// Google OAuth Strategy
const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackURL: `${baseUrl}/auth/google/callback`,
    proxy: true
  },
  async (accessToken, refreshToken, profile, done) => {
    const email = profile.emails?.[0].value;
    if (!email) return done(null, false);
    try {
      const result = await pool.query('SELECT * FROM allowed_users WHERE email = $1', [email]);
      return result.rows.length > 0 ? done(null, { email }) : done(null, false);
    } catch (err) { return done(err); }
  }
));

passport.serializeUser((user: any, done) => done(null, user.email));
passport.deserializeUser((email: string, done) => done(null, { email }));

// Dynamic Config Loader
function getProtectedRoutes() {
  try {
    if (!fs.existsSync(configPath)) return [];
    const content = fs.readFileSync(configPath, 'utf-8');
    const arrayMatch = content.match(/protectedRoutes:\s*\[([\s\S]*?)\]/);
    if (arrayMatch && arrayMatch[1]) {
      const items = arrayMatch[1].match(/(['"])(?:(?=(\\?))\2.)*?\1/g);
      return items ? items.map(s => s.slice(1, -1)) : [];
    }
  } catch (err) { console.error('Config load error:', err); }
  return [];
}

// Auth Routes
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/unauthorized' }), (req, res) => {
  const returnTo = (req.session as any).returnTo || '/';
  delete (req.session as any).returnTo;
  res.redirect(returnTo);
});
app.get('/unauthorized', (req, res) => res.status(403).send('<h1>Unauthorized</h1><p>Email not allowed.</p>'));

// Access Control Middleware
app.use((req, res, next) => {
  if (req.path.startsWith('/auth/') || req.path === '/unauthorized' || req.path === '/health') return next();

  const urlPath = req.path.startsWith('/') ? req.path.substring(1) : req.path;
  const protectedRoutes = getProtectedRoutes();

  const isProtected = protectedRoutes.some(pattern => {
    const tests = [urlPath, urlPath + '.html', path.join(urlPath, 'index.html')];
    return tests.some(p => minimatch(p, pattern, { dot: true, nocase: true }));
  });

  if (isProtected && !req.isAuthenticated()) {
    (req.session as any).returnTo = req.originalUrl;
    return res.redirect('/auth/google');
  }
  next();
});

// Static Serving
app.use(express.static(publicDir, { extensions: ['html'], index: 'index.html' }));

// Manual Fallback & SPA
app.get('*', (req, res) => {
  const possible = [
    path.join(publicDir, req.path),
    path.join(publicDir, req.path + '.html'),
    path.join(publicDir, req.path, 'index.html')
  ];
  for (const p of possible) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return res.sendFile(p);
  }
  const index = path.join(publicDir, 'index.html');
  if (fs.existsSync(index)) return res.sendFile(index);
  
  res.status(404).send('<h1>Site is still building...</h1><p>Please refresh in a few moments.</p>');
});

app.listen(port, () => {
  console.log(`Auth Server listening on port ${port}`);
  console.log(`Project Root: ${projectRoot}`);
  console.log(`Public Dir: ${publicDir}`);
  
  // Background build if public is empty
  if (!fs.existsSync(publicDir) || fs.readdirSync(publicDir).length === 0) {
    console.log('Public directory empty. Starting background Quartz build...');
    exec('npx quartz build', { cwd: projectRoot }, (err, stdout, stderr) => {
      if (err) console.error('Background build failed:', err);
      else console.log('Background build completed.');
    });
  }
});
