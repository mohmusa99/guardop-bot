const express = require('express');
const { handleWebhook, verifyWebhook } = require('./webhook');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Meta webhook verification (GET)
app.get('/webhook', verifyWebhook);

// Incoming messages (POST)
app.post('/webhook', handleWebhook);

// Health check
app.get('/', (req, res) => res.send('Security Bot is running'));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
