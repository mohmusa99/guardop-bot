const axios = require('axios');

const BASE_URL = 'https://graph.facebook.com/v19.0';

// ── Get correct token and phone ID based on which number received the message ──
function getCredentials(receivingPhoneNumberId) {
  const id2 = process.env.PHONE_NUMBER_ID_2;
  if (id2 && receivingPhoneNumberId === id2) {
    return {
      token:       process.env.WHATSAPP_TOKEN_2,
      phoneNumberId: id2,
    };
  }
  return {
    token:         process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.PHONE_NUMBER_ID,
  };
}

// ── Send a text message ───────────────────────────────────────────────────────
async function sendMessage(to, text, receivingPhoneNumberId) {
  const { token, phoneNumberId } = getCredentials(receivingPhoneNumberId);
  const url = `${BASE_URL}/${phoneNumberId}/messages`;

  await axios.post(url, {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text },
  }, {
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}

// ── Download media from WhatsApp ──────────────────────────────────────────────
async function downloadMedia(mediaId, receivingPhoneNumberId) {
  const { token } = getCredentials(receivingPhoneNumberId);

  const metaRes = await axios.get(`${BASE_URL}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const fileRes = await axios.get(metaRes.data.url, {
    responseType: 'arraybuffer',
    headers:      { Authorization: `Bearer ${token}` },
  });

  return Buffer.from(fileRes.data);
}

// ── Get media URL ─────────────────────────────────────────────────────────────
async function getMediaUrl(mediaId, receivingPhoneNumberId) {
  const { token } = getCredentials(receivingPhoneNumberId);

  const res = await axios.get(`${BASE_URL}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.url;
}

module.exports = { sendMessage, downloadMedia, getMediaUrl };
