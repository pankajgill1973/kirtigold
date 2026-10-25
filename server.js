const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_SESSION_TTL_MS = 30 * 60 * 1000;
const adminSessions = new Map();

// CORS is closed by default. Set ALLOWED_ORIGINS to a comma-separated list
// only if a separately hosted frontend genuinely needs cross-origin API access.
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(null, false);
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
}));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // unsafe-eval removed. Keep inline scripts/styles for current pages;
      // migrate them to external files/nonces before removing unsafe-inline.
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      frameSrc: ["'self'", 'https://www.youtube.com', 'https://www.youtube-nocookie.com']
    }
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

app.use(express.json({ limit: '20kb', strict: true }));
app.use(express.urlencoded({ extended: false, limit: '20kb', parameterLimit: 50 }));

// Lightweight per-process rate limiter. Use a shared store (for example Redis)
// if the app runs on multiple instances.
const rateLimitBuckets = new Map();
function rateLimit({ windowMs, max, message }) {
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    let bucket = rateLimitBuckets.get(key);
    if (!bucket || now - bucket.startedAt >= windowMs) {
      bucket = { startedAt: now, count: 0 };
      rateLimitBuckets.set(key, bucket);
    }
    bucket.count += 1;

    // Opportunistically remove expired entries to keep this map bounded over time.
    if (rateLimitBuckets.size > 5000) {
      for (const [bucketKey, value] of rateLimitBuckets) {
        if (now - value.startedAt >= windowMs) rateLimitBuckets.delete(bucketKey);
      }
    }

    res.set('RateLimit-Limit', String(max));
    res.set('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    if (bucket.count > max) {
      res.set('Retry-After', String(Math.ceil((windowMs - (now - bucket.startedAt)) / 1000)));
      return res.status(429).json({ success: false, message });
    }
    next();
  };
}

const publicFormRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many submissions. Please try again later.'
});
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts. Please try again in 15 minutes.'
});

// Path to runtime JSON data. Personal records are intentionally excluded from Git.
const DATA_DIR = path.join(__dirname, 'data');
const SUBSCRIBERS_FILE = path.join(DATA_DIR, 'subscribers.json');
const ENQUIRIES_FILE = path.join(DATA_DIR, 'enquiries.json');
const APPLICATIONS_FILE = path.join(DATA_DIR, 'applications.json');

async function initDatabase() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  for (const filePath of [SUBSCRIBERS_FILE, ENQUIRIES_FILE, APPLICATIONS_FILE]) {
    try {
      await fs.access(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await fs.writeFile(filePath, '[]\n', { flag: 'wx' });
    }
  }
  console.log('Runtime data files initialized.');
}

async function readData(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) throw new Error('Stored data must be a JSON array.');
    return parsed;
  } catch (error) {
    // Only create an empty store for a missing file; don't silently hide corrupt data.
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeData(filePath, data) {
  const tempPath = filePath + '.tmp';
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  await fs.rename(tempPath, filePath);
}

function isObjectBody(body) {
  return body !== null && typeof body === 'object' && !Array.isArray(body);
}
function validText(value, maxLength, optional = false) {
  if (optional && (value === undefined || value === null || value === '')) return true;
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
}
function validEmail(value) {
  return typeof value === 'string' &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
function normalizeEmail(value) {
  return value.trim().toLowerCase();
}
function serverError(res, error, message) {
  console.error(message, error);
  return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
}

app.use(express.static(path.join(__dirname, 'public')));

// Newsletter subscription
app.post('/api/newsletter', publicFormRateLimit, async (req, res) => {
  const body = req.body;
  if (!isObjectBody(body) || !validEmail(body.email)) {
    return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
  }

  try {
    const email = normalizeEmail(body.email);
    const subscribers = await readData(SUBSCRIBERS_FILE);
    if (subscribers.some((subscriber) =>
      typeof subscriber.email === 'string' && subscriber.email.toLowerCase() === email
    )) {
      return res.status(200).json({ success: true, message: 'Already subscribed! Thank you.' });
    }

    subscribers.push({ email, subscribedAt: new Date().toISOString() });
    await writeData(SUBSCRIBERS_FILE, subscribers);
    return res.status(200).json({ success: true, message: 'Subscription successful! Thank you.' });
  } catch (error) {
    return serverError(res, error, 'Newsletter submission failed:');
  }
});

// Product enquiries and general messages
app.post('/api/enquire', publicFormRateLimit, async (req, res) => {
  const body = req.body;
  if (!isObjectBody(body) ||
      !validText(body.name, 100) ||
      !validEmail(body.email) ||
      !validText(body.message, 2000) ||
      !validText(body.phone, 30, true) ||
      !validText(body.product, 120, true)) {
    return res.status(400).json({
      success: false,
      message: 'Enter a valid name, email, and message. Optional fields must also be valid.'
    });
  }

  try {
    const enquiries = await readData(ENQUIRIES_FILE);
    enquiries.push({
      id: 'ENQ-' + crypto.randomUUID(),
      name: body.name.trim(),
      email: normalizeEmail(body.email),
      phone: body.phone ? body.phone.trim() : 'N/A',
      product: body.product ? body.product.trim() : 'General Inquiry',
      message: body.message.trim(),
      createdAt: new Date().toISOString(),
      status: 'Pending'
    });
    await writeData(ENQUIRIES_FILE, enquiries);
    console.log('[EMAIL SIMULATOR] Enquiry confirmation queued for an address supplied by the submitter.');
    return res.status(200).json({
      success: true,
      message: 'Your inquiry has been submitted! Our team will contact you shortly.'
    });
  } catch (error) {
    return serverError(res, error, 'Enquiry submission failed:');
  }
});

// Distributor / partner onboarding
app.post('/api/distributor', publicFormRateLimit, async (req, res) => {
  const body = req.body;
  if (!isObjectBody(body) ||
      !validText(body.companyName, 150) ||
      !validText(body.contactPerson, 100) ||
      !validEmail(body.email) ||
      !validText(body.phone, 30) ||
      !validText(body.state, 100) ||
      !validText(body.city, 100) ||
      !validText(body.experience, 50, true) ||
      !validText(body.investment, 100, true) ||
      !validText(body.message, 2000, true)) {
    return res.status(400).json({
      success: false,
      message: 'Please check all mandatory fields and make sure each field is within the allowed length.'
    });
  }

  try {
    const applications = await readData(APPLICATIONS_FILE);
    applications.push({
      id: 'APP-' + crypto.randomUUID(),
      companyName: body.companyName.trim(),
      contactPerson: body.contactPerson.trim(),
      email: normalizeEmail(body.email),
      phone: body.phone.trim(),
      state: body.state.trim(),
      city: body.city.trim(),
      experience: body.experience ? body.experience.trim() : 'None',
      investment: body.investment ? body.investment.trim() : 'N/A',
      message: body.message ? body.message.trim() : 'N/A',
      createdAt: new Date().toISOString(),
      status: 'Pending'
    });
    await writeData(APPLICATIONS_FILE, applications);
    console.log('[EMAIL SIMULATOR] Partnership application confirmation queued.');
    return res.status(200).json({
      success: true,
      message: 'Thank you for your interest! Your distributor application was successfully submitted.'
    });
  } catch (error) {
    return serverError(res, error, 'Distributor submission failed:');
  }
});

// Admin credentials must be supplied through deployment environment settings.
// No password or reusable bearer token is stored in source code.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
function secureStringEquals(provided, expected) {
  const providedHash = crypto.createHash('sha256').update(String(provided)).digest();
  const expectedHash = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(providedHash, expectedHash);
}
function adminAuth(req, res, next) {
  const match = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
  if (!match) {
    return res.status(401).json({ success: false, message: 'Unauthorized access.' });
  }
  const session = adminSessions.get(match[1]);
  if (!session || session.expiresAt <= Date.now()) {
    adminSessions.delete(match[1]);
    return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
  }
  session.expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;
  req.adminToken = match[1];
  next();
}

app.post('/api/admin/login', loginRateLimit, (req, res) => {
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
    return res.status(503).json({
      success: false,
      message: 'Admin access is not configured. Set a strong ADMIN_PASSWORD environment variable.'
    });
  }
  if (!isObjectBody(req.body) || typeof req.body.password !== 'string' ||
      !secureStringEquals(req.body.password, ADMIN_PASSWORD)) {
    return res.status(401).json({ success: false, message: 'Invalid credentials.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  adminSessions.set(token, { expiresAt: Date.now() + ADMIN_SESSION_TTL_MS });
  return res.status(200).json({ success: true, token, message: 'Login successful.' });
});

app.post('/api/admin/logout', adminAuth, (req, res) => {
  adminSessions.delete(req.adminToken);
  return res.status(200).json({ success: true, message: 'Logged out.' });
});

app.get('/api/admin/data', adminAuth, async (req, res) => {
  try {
    const [subscribers, enquiries, applications] = await Promise.all([
      readData(SUBSCRIBERS_FILE),
      readData(ENQUIRIES_FILE),
      readData(APPLICATIONS_FILE)
    ]);
    return res.status(200).json({ success: true, subscribers, enquiries, applications });
  } catch (error) {
    console.error('Failed to retrieve admin data:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve admin data.' });
  }
});

// Clean URLs
app.get('/about', (req, res) => res.sendFile(path.join(__dirname, 'public', 'about.html')));
app.get('/products', (req, res) => res.sendFile(path.join(__dirname, 'public', 'products.html')));
app.get('/network', (req, res) => res.sendFile(path.join(__dirname, 'public', 'network.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

async function startServer() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log('KIRTI GOLD SERVER RUNNING ON PORT ' + PORT);
      console.log('Local URL: http://localhost:' + PORT);
      console.log('Admin Panel: http://localhost:' + PORT + '/admin');
      if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
        console.warn('WARNING: Set ADMIN_PASSWORD (at least 12 characters) in the deployment environment to enable admin login.');
      }
    });
  } catch (error) {
    console.error('Failed to initialize the server:', error);
    process.exitCode = 1;
  }
}

startServer();
