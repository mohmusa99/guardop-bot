const express = require('express');
const { handleWebhook, verifyWebhook } = require('./webhook');
const { initDb }   = require('./db');
const legalRoutes  = require('./legal');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ── Legal pages (public) ──────────────────────────────────────────────────────
app.use('/', legalRoutes);

// ── WhatsApp webhook ──────────────────────────────────────────────────────────
app.get('/webhook', verifyWebhook);
app.post('/webhook', handleWebhook);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.send('Guards OP Security Bot is running ✅'));

// ── Start ─────────────────────────────────────────────────────────────────────
initDb()
  .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
  .catch(err => { console.error('Failed to init DB:', err.message); process.exit(1); });
