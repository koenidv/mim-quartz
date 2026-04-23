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

const projectRoot = process.cwd();
const publicDir = path.join(projectRoot, 'public');
const configPath = path.join(projectRoot, 'quartz.config.ts');

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const PgSession = connectPgSimple(session);
const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => res.send('OK'));

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
      // Upsert user: keep everyone logged in!
      const result = await pool.query(
        "INSERT INTO users (email) VALUES ($1) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING *",
        [email]
      );
      return done(null, result.rows[0]);
    } catch (err) { return done(err); }
  }
));

passport.serializeUser((user: any, done) => done(null, user.email));
passport.deserializeUser(async (email: string, done) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    done(null, result.rows[0]);
  } catch (err) {
    done(err);
  }
});

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

// Layout helper for styled pages
function renderPage(title: string, content: string) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | Flo's Notes</title>
  <link rel="stylesheet" href="/index.css">
  <style>
    :root {
      --font-body: "Source Sans Pro", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      --font-header: "Schibsted Grotesk", sans-serif;
    }
    body { 
      font-family: var(--font-body); 
      background-color: var(--light); 
      color: var(--dark); 
      padding: 2rem; 
      max-width: 800px; 
      margin: 0 auto;
      line-height: 1.6;
    }
    h1, h2, h3 { font-family: var(--font-header); color: var(--secondary); }
    a { color: var(--tertiary); text-decoration: none; border-bottom: 1px solid transparent; transition: border-color 0.2s; }
    a:hover { border-color: var(--tertiary); }
    .card { 
      border: 1px solid var(--lightgray); 
      padding: 2.5rem; 
      border-radius: 12px; 
      background: var(--light); 
      box-shadow: 0 8px 30px rgba(0,0,0,0.04);
      margin-top: 2rem;
    }
    button, .button { 
      background: var(--secondary); 
      color: var(--light);
      border: none; 
      padding: 0.8rem 1.5rem; 
      border-radius: 6px; 
      font-family: var(--font-header); 
      font-weight: 700;
      font-size: 1rem;
      cursor: pointer;
      display: inline-block;
      transition: opacity 0.2s;
    }
    button:hover, .button:hover { opacity: 0.9; color: var(--light); }
    button:disabled { background: var(--gray); cursor: not-allowed; }
    table { width: 100%; border-collapse: collapse; margin-top: 2rem; font-size: 0.9rem; }
    th, td { border-bottom: 1px solid var(--lightgray); padding: 1rem; text-align: left; }
    th { color: var(--gray); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
    .status-badge {
      display: inline-block;
      padding: 0.2rem 0.6rem;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
    }
    .status-requested { background: #fff3cd; color: #856404; }
    .status-approved { background: #d4edda; color: #155724; }
    .status-admin { background: #cce5ff; color: #004085; }
    .nav { margin-bottom: 2rem; display: flex; gap: 1rem; align-items: center; }
    .nav-spacer { flex-grow: 1; }
  </style>
</head>
<body>
  <div class="nav">
    <a href="/" style="font-weight: bold; color: var(--secondary);">Flo's Notes</a>
    <div class="nav-spacer"></div>
    <a href="/logout">Logout</a>
  </div>
  ${content}
</body>
</html>
  `;
}

app.get('/auth/google', (req, res, next) => {
  let returnTo = (req.session as any).returnTo || req.header('Referer') || '/';
  
  // Determine current origin for validation
  const currentProtocol = req.protocol;
  const currentHost = req.get('host');
  const currentOrigin = `${currentProtocol}://${currentHost}`;

  // Ensure returnTo is a relative path or on our domain to prevent open redirects
  try {
    const url = new URL(returnTo, currentOrigin);
    if (url.origin === currentOrigin) {
      returnTo = url.pathname + url.search + url.hash;
    } else {
      console.log(`[Auth] returnTo origin mismatch: ${url.origin} vs ${currentOrigin}`);
      returnTo = '/';
    }
  } catch (e) {
    console.error('[Auth] Error parsing returnTo:', e);
    returnTo = '/';
  }

  console.log(`[Auth] /auth/google - Referer: ${req.header('Referer')}, Final returnTo: ${returnTo}`);
  
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    state: Buffer.from(JSON.stringify({ returnTo })).toString('base64')
  })(req, res, next);
});

app.get('/auth/google/callback', (req, res, next) => {
  let stateReturnTo = '/';
  try {
    if (req.query.state) {
      const state = JSON.parse(Buffer.from(req.query.state as string, 'base64').toString());
      stateReturnTo = state.returnTo;
    }
  } catch (e) {
    console.error('[Auth] Error parsing state:', e);
  }

  passport.authenticate('google', { failureRedirect: '/unauthorized' }, (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.redirect('/unauthorized');
    
    req.logIn(user, (err) => {
      if (err) return next(err);
      
      const returnTo = stateReturnTo || (req.session as any).returnTo || '/';
      console.log(`[Auth] Callback success. stateReturnTo: ${stateReturnTo}, sessionReturnTo: ${(req.session as any).returnTo}. Redirecting to: ${returnTo}`);
      
      delete (req.session as any).returnTo;
      req.session.save((err) => {
        if (err) console.error('[Auth] Session save error in callback:', err);
        res.redirect(returnTo);
      });
    });
  })(req, res, next);
});

app.get('/unauthorized', (req, res) => {
  res.status(401).send(renderPage('Unauthorized', '<div class="card"><h1>Unauthorized</h1><p>Authentication failed. Please try again.</p><a href="/auth/google" class="button">Try Again</a></div>'));
});

app.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect('/');
  });
});

app.post('/request-access', async (req, res) => {
  if (req.isAuthenticated()) {
    await pool.query('UPDATE users SET access_requested = true WHERE email = $1', [(req.user as any).email]);
  }
  res.redirect(req.header('Referer') || '/');
});

// Admin routes
app.get('/admin', async (req, res) => {
  if (!req.isAuthenticated() || (req.user as any).role !== 'admin') {
    return res.status(403).send(renderPage('Access Denied', '<h1>Admin Access Required</h1><p>You do not have permission to view this page.</p>'));
  }

  const result = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
  const users = result.rows;

  const userRows = users.map(u => `
    <tr>
      <td>${u.email}</td>
      <td>
        <span class="status-badge status-${u.role}">${u.role}</span>
        ${u.access_requested ? '<span class="status-badge status-requested">Requested</span>' : ''}
      </td>
      <td>
        <form action="/admin/users/update" method="POST" style="display:inline-flex; gap: 0.5rem;">
          <input type="hidden" name="email" value="${u.email}">
          <select name="role" style="padding: 0.3rem;">
            <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
            <option value="approved" ${u.role === 'approved' ? 'selected' : ''}>Approved</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
          </select>
          <button type="submit" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;">Update</button>
        </form>
        ${u.access_requested ? `
          <form action="/admin/users/approve" method="POST" style="display:inline;">
            <input type="hidden" name="email" value="${u.email}">
            <button type="submit" style="padding: 0.3rem 0.6rem; font-size: 0.8rem; background: #28a745;">Approve</button>
          </form>
          <form action="/admin/users/decline" method="POST" style="display:inline;">
            <input type="hidden" name="email" value="${u.email}">
            <button type="submit" style="padding: 0.3rem 0.6rem; font-size: 0.8rem; background: #dc3545;">Decline</button>
          </form>
        ` : ''}
      </td>
    </tr>
  `).join('');

  res.send(renderPage('Admin Dashboard', `
    <h1>Admin Dashboard</h1>
    <div class="card">
      <h2>User Management</h2>
      <table>
        <thead>
          <tr><th>Email</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${userRows}
        </tbody>
      </table>
    </div>
  `));
});

app.post('/admin/users/update', async (req, res) => {
  if (!req.isAuthenticated() || (req.user as any).role !== 'admin') return res.sendStatus(403);
  const { email, role } = req.body;
  await pool.query('UPDATE users SET role = $1 WHERE email = $2', [role, email]);
  res.redirect('/admin');
});

app.post('/admin/users/approve', async (req, res) => {
  if (!req.isAuthenticated() || (req.user as any).role !== 'admin') return res.sendStatus(403);
  const { email } = req.body;
  await pool.query("UPDATE users SET role = 'approved', access_requested = false WHERE email = $1", [email]);
  res.redirect('/admin');
});

app.post('/admin/users/decline', async (req, res) => {
  if (!req.isAuthenticated() || (req.user as any).role !== 'admin') return res.sendStatus(403);
  const { email } = req.body;
  await pool.query('UPDATE users SET access_requested = false WHERE email = $1', [email]);
  res.redirect('/admin');
});

app.use((req, res, next) => {
  if (req.path.startsWith('/auth/') || req.path === '/health' || req.path === '/logout' || req.path === '/request-access' || req.path.startsWith('/admin') || req.path === '/unauthorized') return next();
  
  const decodedPath = decodeURIComponent(req.path.split('?')[0]);
  const urlPath = decodedPath.startsWith('/') ? decodedPath.substring(1) : decodedPath;
  const protectedRoutes = getProtectedRoutes();
  const isProtected = protectedRoutes.some(pattern => {
    const tests = [urlPath, urlPath + '.html', path.join(urlPath, 'index.html')];
    return tests.some(p => minimatch(p, pattern, { dot: true, nocase: true }));
  });
if (isProtected) {
  if (!req.isAuthenticated()) {
    console.log(`[Auth] Protected route hit (unauthenticated): ${req.originalUrl}. Setting returnTo and redirecting to login.`);
    (req.session as any).returnTo = req.originalUrl;
    return req.session.save((err) => {
      if (err) console.error('[Auth] Session save error in middleware:', err);
      res.redirect('/auth/google');
    });
  }

  const user = req.user as any;
  if (user.role !== 'admin' && user.role !== 'approved') {
    console.log(`[Auth] Protected route hit (unapproved): ${req.originalUrl} by ${user.email}`);
    const content = user.access_requested 
...
        ? `<h1>Request Pending</h1><p>Your request for access to <strong>${req.path}</strong> is currently being reviewed by an administrator.</p><p>We will notify you once you have been approved.</p>`
        : `<h1>Access Restricted</h1><p>You need to be an approved user to view <strong>${req.path}</strong>.</p>
           <form action="/request-access" method="POST">
             <button type="submit">Request Access</button>
           </form>`;
      
      return res.status(403).send(renderPage('Access Restricted', `<div class="card">${content}</div>`));
    }
  }
  next();
});

app.use(express.static(publicDir, { extensions: ['html'], index: 'index.html' }));

app.get('*', (req, res) => {
  const decodedPath = decodeURIComponent(req.path.split('?')[0]);
  const possible = [
    path.join(publicDir, decodedPath),
    path.join(publicDir, decodedPath + '.html'),
    path.join(publicDir, decodedPath, 'index.html')
  ];
  
  for (const p of possible) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return res.sendFile(p);
  }

  // Only fall back to index.html if the request is for a page (no extension or .html)
  const ext = path.extname(decodedPath).toLowerCase();
  if (ext === '' || ext === '.html') {
    const indexFile = path.join(publicDir, 'index.html');
    if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
  }
  
  res.status(404).send(renderPage('404 Not Found', '<div class="card"><h1>404 Not Found</h1><p>The requested file could not be found. It might still be building or was moved.</p></div>'));
});

app.listen(port, () => {
  console.log(`Auth Server listening on port ${port}`);
  if (!fs.existsSync(publicDir) || fs.readdirSync(publicDir).length === 0) {
    console.log('Public directory empty. Starting background Quartz build...');
    const child = exec('npx quartz build');
    child.stdout?.on('data', data => console.log(`[Build] ${data.trim()}`));
    child.stderr?.on('data', data => console.error(`[Build-Error] ${data.trim()}`));
    child.on('close', code => console.log(`[Build] Finished with code ${code}`));
  }
});
