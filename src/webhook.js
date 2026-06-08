const { sendMessage } = require('./whatsapp');
const { appendToSheet } = require('./sheets');
const { getMediaUrl } = require('./drive');
const { reverseGeocode } = require('./geocode');

// Key: phone number, Value: session object
const sessions = {};

// Inactivity timeout: 5 minutes
const TIMEOUT_MS = 5 * 60 * 1000;

// ── Clear session after inactivity ────────────────────────────────────────────
function startTimeout(from) {
  // Clear any existing timer
  if (sessions[from]?.timer) clearTimeout(sessions[from].timer);

  sessions[from].timer = setTimeout(async () => {
    if (sessions[from]) {
      delete sessions[from];
      try {
        await sendMessage(from,
          `⏰ Your check-in session has expired due to inactivity.\n\nSend any message to start again.`
        );
      } catch (e) { /* silent */ }
    }
  }, TIMEOUT_MS);
}

// ── Webhook verification ───────────────────────────────────────────────────────
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

// ── Prompt the guard for the next step ────────────────────────────────────────
async function promptNext(from, session) {
  const step = session.step;

  if (step === 'location') {
    await sendMessage(from,
      `👋 Hello ${session.name}! Let's log your check-in.\n\nStep 1️⃣: Please share your *current location* 📍`
    );
  } else if (step === 'post') {
    await sendMessage(from,
      `✅ Location received!\n\nStep 2️⃣: What is your *post or location name*?\n_(e.g. Gate A, Warehouse B, Main Entrance)_`
    );
  } else if (step === 'guardId') {
    await sendMessage(from,
      `Step 3️⃣: Enter your *Guard ID / Badge Number*:`
    );
  } else if (step === 'shift') {
    await sendMessage(from,
      `Step 4️⃣: What is your current *shift*? Reply with a number:\n\n1️⃣ Morning\n2️⃣ Afternoon\n3️⃣ Night`
    );
  } else if (step === 'status') {
    await sendMessage(from,
      `Step 5️⃣: What is your current *status*? Reply with a number:\n\n1️⃣ All Clear ✅\n2️⃣ Incident ⚠️\n3️⃣ Emergency 🚨`
    );
  } else if (step === 'incident') {
    await sendMessage(from,
      `Step 6️⃣: Please provide an *incident report*.\n_(Type *nil* if nothing to report)_`
    );
  } else if (step === 'photo') {
    await sendMessage(from,
      `Step 7️⃣: Finally, send a *photo* of your post 📷`
    );
  }
}

// ── Main message handler ───────────────────────────────────────────────────────
async function handleWebhook(req, res) {
  res.sendStatus(200);

  try {
    const entry   = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;

    if (!value?.messages) return;

    const message = value.messages[0];
    const from    = message.from;
    const type    = message.type;
    const contact = value.contacts?.[0]?.profile?.name || from;

    console.log(`Message from ${contact} (${from}): type=${type}`);

    // ── No active session — start a new one ───────────────────────────────────
    if (!sessions[from]) {
      sessions[from] = {
        name:      contact,
        phone:     from,
        timestamp: new Date().toISOString(),
        step:      'location',
        latitude:  null,
        longitude: null,
        mapLink:   null,
        address:   null,
        post:      null,
        guardId:   null,
        shift:     null,
        status:    null,
        incident:  null,
        imageUrl:  null,
        timer:     null,
      };
      startTimeout(from);
      await promptNext(from, sessions[from]);
      return;
    }

    const session = sessions[from];

    // Reset inactivity timer on every message
    startTimeout(from);

    // ── STEP 1: Location ──────────────────────────────────────────────────────
    if (session.step === 'location') {
      if (type !== 'location') {
        await sendMessage(from, `Please share your *location* 📍 using the attachment button.`);
        return;
      }
      const { latitude, longitude } = message.location;
      session.latitude  = latitude;
      session.longitude = longitude;
      session.mapLink   = `https://maps.google.com/?q=${latitude},${longitude}`;
      // Reverse geocode in background while guard continues
      session.address   = await reverseGeocode(latitude, longitude);
      session.step      = 'post';
      await promptNext(from, session);
    }

    // ── STEP 2: Post name ─────────────────────────────────────────────────────
    else if (session.step === 'post') {
      if (type !== 'text') {
        await sendMessage(from, `Please type your *post or location name*.`);
        return;
      }
      session.post = message.text.body.trim();
      session.step = 'guardId';
      await promptNext(from, session);
    }

    // ── STEP 3: Guard ID ──────────────────────────────────────────────────────
    else if (session.step === 'guardId') {
      if (type !== 'text') {
        await sendMessage(from, `Please type your *Guard ID / Badge Number*.`);
        return;
      }
      session.guardId = message.text.body.trim();
      session.step    = 'shift';
      await promptNext(from, session);
    }

    // ── STEP 4: Shift ─────────────────────────────────────────────────────────
    else if (session.step === 'shift') {
      if (type !== 'text') {
        await sendMessage(from, `Please reply with *1*, *2*, or *3* for your shift.`);
        return;
      }
      const shiftMap = { '1': 'Morning', '2': 'Afternoon', '3': 'Night' };
      const shift    = shiftMap[message.text.body.trim()];
      if (!shift) {
        await sendMessage(from, `Please reply with *1* (Morning), *2* (Afternoon), or *3* (Night).`);
        return;
      }
      session.shift = shift;
      session.step  = 'status';
      await promptNext(from, session);
    }

    // ── STEP 5: Status ────────────────────────────────────────────────────────
    else if (session.step === 'status') {
      if (type !== 'text') {
        await sendMessage(from, `Please reply with *1*, *2*, or *3* for your status.`);
        return;
      }
      const statusMap = { '1': 'All Clear ✅', '2': 'Incident ⚠️', '3': 'Emergency 🚨' };
      const status    = statusMap[message.text.body.trim()];
      if (!status) {
        await sendMessage(from, `Please reply with *1* (All Clear), *2* (Incident), or *3* (Emergency).`);
        return;
      }
      session.status = status;
      session.step   = 'incident';
      await promptNext(from, session);
    }

    // ── STEP 6: Incident report ───────────────────────────────────────────────
    else if (session.step === 'incident') {
      if (type !== 'text') {
        await sendMessage(from, `Please type your incident report, or type *nil* if nothing to report.`);
        return;
      }
      session.incident = message.text.body.trim();
      session.step     = 'photo';
      await promptNext(from, session);
    }

    // ── STEP 7: Photo — log everything ────────────────────────────────────────
    else if (session.step === 'photo') {
      if (type !== 'image') {
        await sendMessage(from, `Please send a *photo* of your post 📷`);
        return;
      }

      await sendMessage(from, `📷 Got your photo! Logging your check-in...`);

      const imageUrl  = await getMediaUrl(message.image.id);
      // Google Sheets IMAGE() formula renders the photo inline in the cell
      const imageFormula = `=IMAGE("${imageUrl}")`;

      session.imageUrl = imageUrl;

      const time = new Date(session.timestamp).toLocaleTimeString('en-GB', {
        hour:     '2-digit',
        minute:   '2-digit',
        timeZone: 'Africa/Lagos',
      });

      // Append to Google Sheet
      await appendToSheet([
        session.timestamp,
        session.name,
        session.phone,
        session.post,
        session.guardId,
        session.shift,
        session.status,
        session.incident,
        session.address,
        session.latitude,
        session.longitude,
        session.mapLink,
        imageFormula,       // renders as actual image in the sheet
      ]);

      await sendMessage(from,
        `✅ *Check-in logged at ${time}*\n\n` +
        `👤 Name: ${session.name}\n` +
        `🪪 Guard ID: ${session.guardId}\n` +
        `🏢 Post: ${session.post}\n` +
        `🌙 Shift: ${session.shift}\n` +
        `🚨 Status: ${session.status}\n` +
        `📝 Report: ${session.incident}\n` +
        `📍 Address: ${session.address}\n\n` +
        `Stay safe! 🛡️`
      );

      // Clear session and timer
      clearTimeout(session.timer);
      delete sessions[from];
    }

  } catch (err) {
    console.error('Webhook error:', err.message);
  }
}

module.exports = { verifyWebhook, handleWebhook };
