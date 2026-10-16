require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

const connectDB = require('./config/db');
const { errorHandler, notFound } = require('./middleware/helpers');
const { requireAuth } = require('./middleware/auth');

const isProd = process.env.NODE_ENV === 'production';

// Fail fast on weak/missing secrets.
for (const k of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
  const v = process.env[k];
  if (!v || v.length < 32 || /change-me/i.test(v)) {
    if (isProd) {
      console.error(`FATAL: ${k} must be set to a random string of at least 32 characters`);
      process.exit(1);
    }
    console.warn(`WARNING: ${k} is weak or missing — acceptable for local development only`);
    process.env[k] = v && v.length >= 32 ? v : `dev-only-${k}-0123456789abcdef0123456789abcdef`;
  }
}
if (process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
  console.error('FATAL: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // behind one reverse proxy (Render, Railway, Nginx, ...)

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
  })
);

const origins = (process.env.CLIENT_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: origins.length ? origins : false, credentials: true }));
app.use(compression());
if (!isProd) app.use(morgan('dev'));
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());
app.use(mongoSanitize()); // strips $ and . operators from user input (NoSQL injection)
app.use(hpp()); // HTTP parameter pollution

const limiter = (windowMs, max, extra = {}) =>
  rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many requests, slow down.' }, ...extra });

app.use('/api', limiter(15 * 60 * 1000, 600));
app.use(['/api/auth/login', '/api/auth/register'], limiter(15 * 60 * 1000, 20));
app.use('/api/auth/refresh', limiter(15 * 60 * 1000, 120));
const aiLimiter = limiter(15 * 60 * 1000, 60, { keyGenerator: (req) => req.userId });

app.get('/api/health', (_req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tasks', requireAuth, require('./routes/tasks'));
app.use('/api/ai', requireAuth, aiLimiter, require('./routes/ai'));
app.use('/api', notFound);

// Serve the built React app (single origin => cookies just work on phone and laptop).
const dist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  connectDB()
    .then(() => {
      const server = app.listen(PORT, () => console.log(`API listening on :${PORT}`));
      const shutdown = () => server.close(() => mongoose.disconnect().then(() => process.exit(0)));
      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    })
    .catch((e) => {
      console.error('Failed to start:', e.message);
      process.exit(1);
    });
}

module.exports = app;
