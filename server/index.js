/**
 * server/index.js — Aiyashi API
 * Express + Socket.io on a single port
 */
require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: {
    origin:      process.env.CLIENT_URL || '*',
    methods:     ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout:  60000,
  pingInterval: 25000,
});

const PORT = process.env.PORT || 3000;

// ── Security ────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,   // we serve our own HTML
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin:      process.env.CLIENT_URL || '*',
  credentials: true,
}));

// ── Body parsing ────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ── Rate limiting ────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 min
  max:      200,               // 200 requests per window — generous for 300 users
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many requests, please try again later' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      20,                // strict for login/register
  message: { error: 'Too many auth attempts, please try again in 15 minutes' },
});

app.use('/api', apiLimiter);
app.use('/api/auth/login',    authLimiter);
app.use('/api/auth/register', authLimiter);

// ── Static files ─────────────────────────────────────────────────────
// Serve uploaded photos
app.use('/uploads', express.static(
  path.join(__dirname, '..', 'public', 'uploads'),
  { maxAge: '7d' }
));

// Serve the frontend (HTML/CSS/JS)
app.use(express.static(path.join(__dirname, '..'), {
  index: 'index.html',
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
}));

// ── API Routes ────────────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/profiles', require('./routes/profiles'));
app.use('/api/swipes',   require('./routes/swipes'));
app.use('/api/matches',  require('./routes/matches'));
app.use('/api/safety',   require('./routes/safety'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});

// ── SPA fallback — serve index.html for all non-API routes ───────────
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
  } else {
    res.status(404).json({ error: 'API route not found' });
  }
});

// ── Error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large' });
  }
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ── Socket.io ─────────────────────────────────────────────────────────
require('./socket/chat')(io);

// ── Start ─────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║   Aiyashi Server             ║
  ║   http://localhost:${PORT}              ║
  ║   ENV: ${(process.env.NODE_ENV || 'development').padEnd(26)}║
  ╚══════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => process.exit(0));
});
