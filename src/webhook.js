const { sendMessage } = require('./whatsapp');
const { appendToSheet } = require('./sheets');
const { getMediaUrl } = require('./drive');

// Temporary store to collect location + image per guard per session
// Key: phone number, Value: { location, imageUrl, timestamp }
const sessions = {};

// ── Webhook verification (Meta calls this when you register the webhook) ──────
function verifyWebhook(req, res) {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    console.log('Webhook verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
}

// ── Main message handler ───────────────────────────────────────────────────────
async function handleWebhook(req, res) {
  // Always respond 200 immediately so Meta doesn't retry
  res.sendStatus(200);

  try {
    const entry   = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;

    if (!value?.messages) return; // ignore status updates

    const message = value.messages[0];
    const from    = message.from;          // guard's phone number
    const type    = message.type;
    const contact = value.contacts?.[0]?.profile?.name || from;

    console.log(`Message from ${contact} (${from}): type=${type}`);

    // ── LOCATION message ──────────────────────────────────────────────────────
    if (type === 'location') {
      const { latitude, longitude } = message.location;
      const mapLink = `https://maps.google.com/?q=${latitude},${longitude}`;

      // Save to session
      sessions[from] = {
        name:      contact,
        phone:     from,
        latitude,
        longitude,
        mapLink,
        timestamp: new Date().toISOString(),
        imageUrl:  null,
      };

      await sendMessage(from,
        `✅ Location received!\n📍 ${mapLink}\n\nNow please send a *photo* of your post 📷`
      );
    }

    // ── IMAGE message ─────────────────────────────────────────────────────────
    else if (type === 'image') {
      const mediaId = message.image.id;

      if (!sessions[from]) {
        // Guard sent image without location first
        await sendMessage(from,
          `Please share your *location* first 📍 before sending a photo.`
        );
        return;
      }

      await sendMessage(from, `📷 Got your photo! Logging your check-in...`);

      // Get the WhatsApp-hosted media URL directly
      const imageUrl = await getMediaUrl(mediaId);

      // Build the row for Google Sheets
      const session = sessions[from];
      session.imageUrl = imageUrl;

      await appendToSheet([
        session.timestamp,
        session.name,
        session.phone,
        session.latitude,
        session.longitude,
        session.mapLink,
        imageUrl,
      ]);

      // Confirm to guard
      const time = new Date(session.timestamp).toLocaleTimeString('en-GB', {
        hour:   '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Lagos',
      });

      await sendMessage(from,
        `✅ *Check-in logged at ${time}*\n\nName: ${session.name}\nLocation: ${session.mapLink}\nPhoto: ${imageUrl}\n\nStay safe! 🛡️`
      );

      // Clear session
      delete sessions[from];
    }

    // ── TEXT message (greeting / help) ────────────────────────────────────────
    else if (type === 'text') {
      await sendMessage(from,
        `👋 Hello ${contact}!\n\nTo log your check-in, please:\n1️⃣ Share your *location* 📍\n2️⃣ Send a *photo* of your post 📷`
      );
    }

  } catch (err) {
    console.error('Webhook error:', err.message);
  }
}

module.exports = { verifyWebhook, handleWebhook };
