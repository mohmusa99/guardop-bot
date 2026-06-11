const express = require('express');
const { handleWebhook, verifyWebhook } = require('./webhook');
const { initDb } = require('./db');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get('/webhook', verifyWebhook);
app.post('/webhook', handleWebhook);
app.get('/', (req, res) => res.send('Security Bot is running ✅'));

// Init DB then start server
initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('Failed to init DB:', err.message);
    process.exit(1);
  });
