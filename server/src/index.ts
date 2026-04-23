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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env in root or server directory
const envConfig = dotenv.config({ path: path.resolve(__dirname, '../../.env') }).parsed || {};
// Inject into process.env to make it available to other libs
for (const k in envConfig) { process.env[k] = envConfig[k]; }

// Database configuration
const dbConfig = {
  connectionString: process.env.DATABASE_URL,
};
console.log('Using database:', dbConfig.connectionString?.replace(/:[^:@]+@/, ':***@'));

const pool = new pg.Pool(dbConfig);
const PgSession = connectPgSimple(session);

const app = express();
const port = process.env.PORT || 3000;

// Construct callback URL from environment
const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
const callbackURL = `${baseUrl}/auth/google/callback`;
console.log('OAuth Callback URL:', callbackURL);

// Passport configuration
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackURL: callbackURL,
    proxy: true
  },
  async (accessToken, refreshToken, profile, done) => {
    const email = profile.emails?.[0].value;
    console.log(`[Auth] Google login attempt for email: ${email}`);
    if (!email) return done(null, false);

    try {
      const result = await pool.query('SELECT * FROM allowed_users WHERE email = $1', [email]);
      if (result.rows.length > 0) {
        console.log(`[Auth] User ${email} authorized via database`);
        return done(null, { email });
      } else {
        console.log(`[Auth] User ${email} NOT found in allowed_users table`);
        return done(null, false, { message: 'Unauthorized' });
      }
    } catch (err) {
      console.error('[Auth] Database error during user check:', err);
      return done(err);
    }
  }
));

passport.serializeUser((user: any, done) => {
  done(null, user.email);
});

passport.deserializeUser((email: string, done) => {
  done(null, { email });
});

// Session configuration
app.use(session({
  store: new PgSession({
    pool,
    tableName: 'session'
  }),
  secret: process.env.SESSION_SECRET || 'quartz-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
}));

app.use(passport.initialize());
app.use(passport.session());

// Function to load Quartz configuration dynamically
function getProtectedRoutes() {
  try {
    const configPath = path.resolve(__dirname, '../../quartz.config.ts');
    if (!fs.existsSync(configPath)) {
        // Try root relative to CWD as well
        const rootConfigPath = path.resolve(process.cwd(), '../quartz.config.ts');
        if (!fs.existsSync(rootConfigPath)) return [];
        return parseProtectedRoutes(rootConfigPath);
    }
    return parseProtectedRoutes(configPath);
  } catch (err) {
    console.error('Error reloading quartz.config.ts:', err);
  }
  return [];
}

function parseProtectedRoutes(configPath: string) {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const arrayContentMatch = configContent.match(/protectedRoutes:\s*\[([\s\S]*?)\]/);
    if (arrayContentMatch && arrayContentMatch[1]) {
      const rawItems = arrayContentMatch[1].match(/(['"])(?:(?=(\\?))\2.)*?\1/g);
      if (rawItems) {
        return rawItems.map(s => s.slice(1, -1));
      }
    }
    return [];
}

// Auth routes
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/unauthorized' }),
  (req, res) => {
    const returnTo = (req.session as any).returnTo || '/';
    delete (req.session as any).returnTo;
    res.redirect(returnTo);
  });

app.get('/unauthorized', (req, res) => {
  res.status(403).send('<h1>Unauthorized</h1><p>Your email is not on the allowed list. Please contact the administrator.</p><a href="/auth/google">Try again</a>');
});

app.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect('/');
  });
});

// Middleware to check access control
app.use((req, res, next) => {
  const originalPath = req.path;
  
  // Skip auth for auth-related routes
  if (req.path.startsWith('/auth/') || req.path === '/unauthorized' || req.path === '/logout') {
    return next();
  }

  // Normalize path: remove leading slash
  let urlPath = originalPath.startsWith('/') ? originalPath.substring(1) : originalPath;
  
  // Load protected routes dynamically on every request
  const protectedRoutes = getProtectedRoutes();

  const isProtected = protectedRoutes.some(pattern => {
    const pathsToTest = [urlPath];
    if (urlPath === '' || urlPath.endsWith('/')) {
      pathsToTest.push(urlPath + 'index.html');
    } else {
      pathsToTest.push(urlPath + '.html');
      pathsToTest.push(urlPath + '/index.html');
    }

    const match = pathsToTest.some(p => {
      const m = minimatch(p, pattern, { dot: true, nocomment: true, nocase: true });
      return m;
    });

    return match;
  });

  if (isProtected) {
    console.log(`[Auth] PROTECTED: ${originalPath}`);
    if (req.isAuthenticated()) {
      return next();
    } else {
      console.log(`[Auth] BLOCKED: Redirecting to login`);
      (req.session as any).returnTo = req.originalUrl || originalPath;
      return res.redirect('/auth/google');
    }
  }

  next();
});

// Serve static files
// We resolve publicDir relative to the project root
const publicDir = path.resolve(process.cwd(), '../public');
console.log(`Serving static files from: ${publicDir}`);

// Verify publicDir contents once on start
try {
    if (fs.existsSync(publicDir)) {
        const files = fs.readdirSync(publicDir);
        console.log(`Found ${files.length} items in public directory.`);
        if (files.length < 5) console.log('Items:', files);
    } else {
        console.warn(`WARNING: Public directory does not exist: ${publicDir}`);
    }
} catch (e) {
    console.error('Error reading public directory:', e);
}

app.use(express.static(publicDir, {
  extensions: ['html'],
  index: 'index.html'
}));

// Fallback for SPA or other routes
app.get('*', (req, res) => {
  const originalPath = req.path;
  let urlPath = originalPath.startsWith('/') ? originalPath.substring(1) : originalPath;
  
  // Try to find the file manually if express.static missed it
  const possiblePaths = [
    path.join(publicDir, urlPath),
    path.join(publicDir, urlPath + '.html'),
    path.join(publicDir, urlPath, 'index.html')
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      console.log(`[404-Fix] Manual match found for ${originalPath} at ${p}`);
      return res.sendFile(p);
    }
  }

  const indexPath = path.join(publicDir, 'index.html');
  console.log(`[404] Resource not found: ${req.path}.`);
  
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send(`<h1>Not Found</h1><p>The requested resource <code>${req.path}</code> was not found.</p>`);
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
