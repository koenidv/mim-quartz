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

// ROBUST PATH RESOLUTION
// In Docker with WORKDIR /usr/app, the public folder is at /usr/app/public
// If this script is at /usr/app/server/src/index.ts, the root is ../..
const projectRoot = path.resolve(__dirname, '../..');
const publicDir = path.join(projectRoot, 'public');
const configPath = path.join(projectRoot, 'quartz.config.ts');

// Load environment variables
dotenv.config({ path: path.join(projectRoot, '.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const PgSession = connectPgSimple(session);
const app = express();
const port = process.env.PORT || 3000;

app.get('/health', (req, res) => res.send('OK'));

app.get('/_debug/paths', (req, res) => {
    res.json({
        __dirname,
        projectRoot,
        publicDir,
        publicDirExists: fs.existsSync(publicDir),
        indexHtmlExists: fs.existsSync(path.join(publicDir, 'index.html')),
        publicItemsCount: fs.existsSync(publicDir) ? fs.readdirSync(publicDir).length : 0,
        cwd: process.cwd(),
    });
});

app.use(session({
  store: new PgSession({ pool, tableName: 'session' }),
  secret: process.env.SESSION_SECRET || 'quartz-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }
}));
app.use(passport.initialize());
app.use(passport.session());

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

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/unauthorized' }), (req, res) => {
  const returnTo = (req.session as any).returnTo || '/';
  delete (req.session as any).returnTo;
  res.redirect(returnTo);
});
app.get('/unauthorized', (req, res) => res.status(403).send('<h1>Unauthorized</h1><p>Email not allowed.</p>'));

app.use((req, res, next) => {
  if (req.path.startsWith('/auth/') || req.path === '/unauthorized' || req.path === '/health' || req.path.startsWith('/_debug/')) return next();
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

app.use(express.static(publicDir, { extensions: ['html'], index: 'index.html' }));

app.get('*', (req, res) => {
  const cleanPath = req.path.split('?')[0];
  const possible = [
    path.join(publicDir, cleanPath),
    path.join(publicDir, cleanPath + '.html'),
    path.join(publicDir, cleanPath, 'index.html')
  ];
  
  for (const p of possible) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        return res.sendFile(p);
    }
  }

  const indexFile = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
  
  res.status(404).send(`
    <h1>Site is still building...</h1>
    <p>Please refresh in a few moments.</p>
    <hr>
    <small>Debug: Looking for <code>${indexFile}</code></small>
  `);
});

app.listen(port, () => {
  console.log(`Auth Server listening on port ${port}`);
  console.log(`Resolved Public Dir: ${publicDir}`);
  
  const startBuild = () => {
    console.log('Starting background Quartz build...');
    const child = exec('npx quartz build', { cwd: projectRoot });
    child.stdout?.on('data', data => console.log(`[Build] ${data.trim()}`));
    child.stderr?.on('data', data => console.error(`[Build-Error] ${data.trim()}`));
    child.on('close', code => console.log(`[Build] Finished with code ${code}`));
  };

  if (!fs.existsSync(publicDir) || fs.readdirSync(publicDir).length === 0) {
    startBuild();
  } else {
    console.log(`Public directory has ${fs.readdirSync(publicDir).length} items.`);
  }
});
