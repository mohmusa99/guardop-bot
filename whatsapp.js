const axios = require('axios');

const BASE_URL = 'https://graph.facebook.com/v19.0';

// ── Send a text message to a WhatsApp number ──────────────────────────────────
async function sendMessage(to, text) {
  const url = `${BASE_URL}/${process.env.PHONE_NUMBER_ID}/messages`;

  await axios.post(url, {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text },
  }, {
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
}

// ── Download media (image) from WhatsApp servers ──────────────────────────────
async function downloadMedia(mediaId) {
  // Step 1: get the media URL
  const metaRes = await axios.get(`${BASE_URL}/${mediaId}`, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
  });

  const mediaUrl = metaRes.data.url;

  // Step 2: download the actual file bytes
  const fileRes = await axios.get(mediaUrl, {
    responseType: 'arraybuffer',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
  });

  return Buffer.from(fileRes.data);
}

module.exports = { sendMessage, downloadMedia };
