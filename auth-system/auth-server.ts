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
const configPath = path.join(projectRoot, 'quartz.config.ts');

function getOutputDir() {
  try {
    if (!fs.existsSync(configPath)) return 'public';
    const content = fs.readFileSync(configPath, 'utf-8');
    const match = content.match(/outputDir:\s*["']([^"']+)["']/);
    return match ? match[1] : 'public';
  } catch (err) {
    console.error('Error reading outputDir from config:', err);
    return 'public';
  }
}

const publicDir = path.resolve(projectRoot, getOutputDir());

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

function isRouteProtected(reqPath: string) {
  const decodedPath = decodeURIComponent(reqPath.split('?')[0]);
  const urlPath = decodedPath.startsWith('/') ? decodedPath.substring(1) : decodedPath;
  const protectedRoutes = getProtectedRoutes();
  return protectedRoutes.some(pattern => {
    const tests = [urlPath, urlPath + '.html', path.join(urlPath, 'index.html')];
    return tests.some(p => minimatch(p, pattern, { dot: true, nocase: true }));
  });
}

async function notifyAdminOfAccessRequest() {
  try {
    await fetch('https://ntfy.sh/koeni-mgmt-access', {
      method: 'POST',
      body: 'New access request received. Review at: https://management.koeni.dev/admin',
      headers: {
        'Title': 'New Access Request',
        'Priority': 'high',
        'Tags': 'locked'
      }
    });
  } catch (err) {
    console.error('[Auth] Error notifying admin:', err);
  }
}

// Global middleware to handle auth and routing
app.use(async (req, res, next) => {
  const outputFolderName = path.basename(getOutputDir());
  
  // Normalize path: if it starts with the output folder name, strip it
  // This handles cases where the proxy does NOT strip the prefix.
  if (req.path.startsWith(`/${outputFolderName}/`)) {
    req.url = req.url.substring(outputFolderName.length + 1);
  } else if (req.path === `/${outputFolderName}`) {
    // Redirect /out to /out/ to ensure relative paths work in the browser
    return res.redirect(301, `/${outputFolderName}/`);
  }

  const reqPath = req.path;
  
  if (process.env.DEBUG) {
    console.log(`[Auth] Request: ${req.method} ${req.originalUrl} -> Resolved Path: ${reqPath}`);
  }

  // 1. Skip auth for internal system routes and common Quartz assets
  const isSystemRoute = 
    reqPath.startsWith('/auth/') || 
    reqPath === '/health' || 
    reqPath === '/logout' || 
    reqPath === '/request-access' || 
    reqPath.startsWith('/admin') || 
    reqPath === '/unauthorized';

  const isPublicAsset = 
    reqPath === '/index.css' ||
    reqPath.startsWith('/static/') ||
    reqPath.endsWith('.js') ||
    reqPath.endsWith('.css') ||
    reqPath.endsWith('.png') ||
    reqPath.endsWith('.webp') ||
    reqPath.endsWith('.ico');

  if (isSystemRoute || isPublicAsset) {
    // For public assets, we still need to check if the specific file is protected
    if (!isRouteProtected(reqPath)) {
      return next();
    }
  }

  const isProtected = isRouteProtected(reqPath);

  // 2. Fast Path for non-protected static assets (images, scripts, etc.)
  const ext = path.extname(reqPath).toLowerCase();
  const isStaticAsset = ext && ext !== '.html';
  
  if (isStaticAsset && !isProtected) {
    return express.static(publicDir)(req, res, next);
  }

  // 3. Authorization Logic for Pages and Protected Assets
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
      
      // Automatically request access if not already done
      if (!user.access_requested) {
        try {
          await pool.query('UPDATE users SET access_requested = true WHERE email = $1', [user.email]);
          user.access_requested = true;
          console.log(`[Auth] Automatically requested access for ${user.email}`);
          await notifyAdminOfAccessRequest();
        } catch (err) {
          console.error('[Auth] Error automatically requesting access:', err);
        }
      }

      const content = `<h1>Request Pending</h1>
                       <p>Your access request has been automatically submitted and is being reviewed.</p>
                       <p>Please check back later or send me a message if you believe you should already have access.</p>`;
      
      return res.status(403).send(renderPage('Flo\'s Notes: Access Pending', `<div class="card">${content}</div>`));
    }
  }

  next();
});

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
      max-width: 900px; 
      margin: 0 auto;
      line-height: 1.6;
    }
    h1, h2, h3 { font-family: var(--font-header); color: var(--secondary); margin-bottom: 1rem; }
    h1 { font-size: 2.2rem; }
    h2 { font-size: 1.5rem; margin-top: 2rem; border-bottom: 1px solid var(--lightgray); padding-bottom: 0.5rem; }
    
    a { color: var(--tertiary); text-decoration: none; border-bottom: 1px solid transparent; transition: border-color 0.2s; }
    a:hover { border-color: var(--tertiary); }
    
    .card { 
      border: 1px solid var(--lightgray); 
      padding: 2rem; 
      border-radius: 12px; 
      background: var(--light); 
      box-shadow: 0 4px 20px rgba(0,0,0,0.03);
      margin-top: 1.5rem;
    }
    
    .button-group { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    
    button, .button { 
      background: var(--secondary); 
      color: var(--light);
      border: none; 
      padding: 0.6rem 1.2rem; 
      border-radius: 6px; 
      font-family: var(--font-header); 
      font-weight: 700;
      font-size: 0.9rem;
      cursor: pointer;
      display: inline-block;
      transition: transform 0.1s, opacity 0.2s;
      margin-top: 0.5rem;
    }
    button:hover, .button:hover { opacity: 0.9; transform: translateY(-1px); color: var(--light); }
    button:active { transform: translateY(0); }
    button:disabled { background: var(--gray); cursor: not-allowed; }
    
    .button-secondary { background: var(--lightgray); color: var(--darkgray); }
    .button-approve { background: #28a745; }
    .button-decline { background: #dc3545; }
    
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 0.9rem; }
    th, td { border-bottom: 1px solid var(--lightgray); padding: 1rem; text-align: left; vertical-align: middle; }
    th { color: var(--gray); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.8rem; }
    
    .status-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .status-requested { background: #fff3cd; color: #856404; border: 1px solid #ffeeba; }
    .status-approved { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
    .status-admin { background: #cce5ff; color: #004085; border: 1px solid #b8daff; }
    .status-user { background: var(--lightgray); color: var(--darkgray); }

    .nav { margin-bottom: 3rem; display: flex; gap: 1.5rem; align-items: center; border-bottom: 1px solid var(--lightgray); padding-bottom: 1rem; }
    .nav-spacer { flex-grow: 1; }
    .nav a { font-family: var(--font-header); font-weight: 600; color: var(--darkgray); font-size: 0.95rem; }
    .nav a:hover { color: var(--secondary); }
    
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
    .stat-card { padding: 1.5rem; border-radius: 12px; border: 1px solid var(--lightgray); text-align: center; }
    .stat-value { font-size: 2rem; font-weight: 700; color: var(--secondary); font-family: var(--font-header); }
    .stat-label { font-size: 0.8rem; color: var(--gray); text-transform: uppercase; letter-spacing: 0.1em; }
    
    select { padding: 0.5rem; border-radius: 6px; border: 1px solid var(--lightgray); font-family: var(--font-body); color: var(--dark); background: var(--light); }
    
    .empty-state { text-align: center; padding: 3rem; color: var(--gray); font-style: italic; }
  </style>
</head>
<body>
  <div class="nav">
    <a href="/" style="font-size: 1.2rem; color: var(--secondary); border: none;">Flo's Notes</a>
    <div class="nav-spacer"></div>
    <a href="/admin">Dashboard</a>
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
    const user = req.user as any;
    if (!user.access_requested) {
      await pool.query('UPDATE users SET access_requested = true WHERE email = $1', [user.email]);
      user.access_requested = true;
      await notifyAdminOfAccessRequest();
    }
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

  const totalUsers = users.length;
  const approvedUsers = users.filter(u => u.role === 'approved' || u.role === 'admin').length;
  const pendingRequests = users.filter(u => u.access_requested).length;

  const requests = users.filter(u => u.access_requested);
  const otherUsers = users.filter(u => !u.access_requested);

  const renderUserRow = (u: any) => `
    <tr>
      <td style="font-weight: 500;">${u.email}</td>
      <td>
        <span class="status-badge status-${u.role}">${u.role}</span>
        ${u.access_requested ? '<span class="status-badge status-requested" style="margin-left: 0.3rem;">Pending</span>' : ''}
      </td>
      <td>
        <div class="button-group">
          <form action="/admin/users/update" method="POST" style="display:inline-flex; gap: 0.5rem; align-items: center;">
            <input type="hidden" name="email" value="${u.email}">
            <select name="role">
              <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
              <option value="approved" ${u.role === 'approved' ? 'selected' : ''}>Approved</option>
              <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
            </select>
            <button type="submit" class="button-secondary" style="margin-top: 0;">Update</button>
          </form>
          ${u.access_requested ? `
            <form action="/admin/users/approve" method="POST" style="display:inline;">
              <input type="hidden" name="email" value="${u.email}">
              <button type="submit" class="button-approve" style="margin-top: 0;">Approve</button>
            </form>
            <form action="/admin/users/decline" method="POST" style="display:inline;">
              <input type="hidden" name="email" value="${u.email}">
              <button type="submit" class="button-decline" style="margin-top: 0;">Decline</button>
            </form>
          ` : ''}
        </div>
      </td>
    </tr>
  `;

  const requestSection = requests.length > 0 ? `
    <h2>Access Requests</h2>
    <div class="card" style="border-left: 4px solid #ffc107;">
      <table>
        <thead>
          <tr><th>Email</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${requests.map(renderUserRow).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  const userListSection = `
    <h2>All Users</h2>
    <div class="card">
      ${otherUsers.length > 0 ? `
        <table>
          <thead>
            <tr><th>Email</th><th>Role</th><th>Management</th></tr>
          </thead>
          <tbody>
            ${otherUsers.map(renderUserRow).join('')}
          </tbody>
        </table>
      ` : '<div class="empty-state">No other users found.</div>'}
    </div>
  `;

  res.send(renderPage('Admin Dashboard', `
    <h1>Admin Dashboard</h1>
    
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${totalUsers}</div>
        <div class="stat-label">Total Users</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${approvedUsers}</div>
        <div class="stat-label">Approved</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${pendingRequests}</div>
        <div class="stat-label">Pending Requests</div>
      </div>
    </div>

    ${requestSection}
    ${userListSection}
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
