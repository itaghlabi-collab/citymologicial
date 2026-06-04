/**
 * CITYMO ERP – Express API Server
 * Entry point
 *
 * Usage:
 *   npm run migrate   → create/update DB schema
 *   npm run seed      → seed departments + demo data
 *   npm start         → start server (PORT env var or 3000)
 *   npm run dev       → nodemon watch mode
 */

require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const path         = require('path');

// ── DB bootstrap ─────────────────────────────────────────────────────────────
// Run migrations automatically on every start (idempotent DDL)
require('./db/migrate');

// ── Routes ───────────────────────────────────────────────────────────────────
const authRouter           = require('./routes/auth');
const prospectsRouter      = require('./routes/prospects');
const devisRouter          = require('./routes/devis');
const rdvRouter            = require('./routes/rdv');
const comptesRendusRouter  = require('./routes/comptesRendus');
const actionsMarketingRouter = require('./routes/actionsMarketing');
const depensesRouter       = require('./routes/depenses');
const propositionsRouter   = require('./routes/propositions');
const notificationsRouter  = require('./routes/notifications');
const dashboardRouter      = require('./routes/dashboard');
const existingRouter       = require('./routes/existing');
const ocrRouter            = require('./routes/ocr');

// ── Middleware ────────────────────────────────────────────────────────────────
const { errorHandler }    = require('./middleware/errorHandler');
const { requireAuth }     = require('./middleware/auth');

// ── CRON jobs ─────────────────────────────────────────────────────────────────
const { startCronJobs } = require('./jobs/cronJobs');

// ─────────────────────────────────────────────────────────────────────────────

const app  = express();
const PORT = process.env.PORT || 3000;

// ── CORS ─────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS bloqué pour l'origine: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: 'CITYMO ERP API', ts: new Date().toISOString() });
});

// ── Authentication (public – no token required) ───────────────────────────────
app.use('/api/auth', authRouter);

// ── Commercial / Marketing module (JWT protected) ─────────────────────────────
app.use('/api/prospects',          requireAuth, prospectsRouter);
app.use('/api/devis',              requireAuth, devisRouter);
app.use('/api/rdv',                requireAuth, rdvRouter);
app.use('/api/comptes-rendus',     requireAuth, comptesRendusRouter);
app.use('/api/actions-marketing',  requireAuth, actionsMarketingRouter);
app.use('/api/depenses',           requireAuth, depensesRouter);
app.use('/api/propositions',       requireAuth, propositionsRouter);
app.use('/api/notifications',      requireAuth, notificationsRouter);
app.use('/api/dashboard',          requireAuth, dashboardRouter);

// ── OCR module (CORS — clé Mindee côté serveur uniquement) ───────────────────
app.use('/api/ocr', ocrRouter);

// ── Legacy / existing module endpoints (HR, Finance, Stock, etc.) ─────────────
// Must be mounted AFTER specific routes to avoid prefix conflicts
app.use('/api', requireAuth, existingRouter);

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint introuvable' });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════════╗`);
  console.log(`  ║   CITYMO ERP API — http://localhost:${PORT}  ║`);
  console.log(`  ╚══════════════════════════════════════════╝\n`);

  // Start background jobs after server is up
  startCronJobs();
});

module.exports = app;
