const axios = require('axios');

// ── Get the direct WhatsApp media URL for the image ───────────────────────────
// We store the WhatsApp-hosted URL directly in Google Sheets.
// Note: these URLs expire after ~5 minutes but the image is permanently
// accessible via the media ID if needed.
async function uploadToDrive(buffer, filename) {
  // buffer and filename are kept as params for compatibility
  // but we now return the media URL fetched in webhook.js
  // This function is bypassed — see webhook.js for the new flow
  return null;
}

// ── Fetch the direct download URL for a WhatsApp media ID ────────────────────
async function getMediaUrl(mediaId) {
  const res = await axios.get(
    `https://graph.facebook.com/v19.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } }
  );
  return res.data.url;
}

module.exports = { uploadToDrive, getMediaUrl };
