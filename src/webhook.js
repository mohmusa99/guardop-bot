const { sendMessage, downloadMedia } = require('./whatsapp');
const { appendToSheet }              = require('./sheets');
const { getMediaUrl }                = require('./drive');
const { reverseGeocode }             = require('./geocode');
const { uploadToCloudinary }         = require('./cloudinary');
const { insertCheckin }              = require('./db');
const { v4: uuidv4 }                 = require('uuid');

// ── House list ────────────────────────────────────────────────────────────────
const HOUSES = ['House A', 'House B', 'Warehouse C', 'Gate 1', 'Main Entrance'];

const SHIFT_MAP  = { '1': 'Morning', '2': 'Afternoon', '3': 'Night' };
const STATUS_MAP = { '1': 'All Clear ✅', '2': 'Incident ⚠️', '3': 'Emergency 🚨' };

// Key: phone number, Value: session object
const sessions  = {};
const TIMEOUT_MS = 5 * 60 * 1000;

// ── Inactivity timer ──────────────────────────────────────────────────────────
function startTimeout(from) {
  if (sessions[from]?.timer) clearTimeout(sessions[from].timer);
  sessions[from].timer = setTimeout(async () => {
    if (sessions[from]) {
      delete sessions[from];
      try {
        await sendMessage(from,
          `⏰ Your check-in session expired due to inactivity.\n\nSend any message to start a new check-in.`
        );
      } catch (e) { /* silent */ }
    }
  }, TIMEOUT_MS);
}

// ── Webhook verification ──────────────────────────────────────────────────────
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

// ── Prompt next step ──────────────────────────────────────────────────────────
async function promptNext(from, session) {
  const { step, operatives, currentOperative } = session;

  if (step === 'location') {
    await sendMessage(from,
      `👋 Welcome! Let's log your team check-in.\n\nStep 1️⃣: Please share your *current location* 📍`
    );

  } else if (step === 'house') {
    const list = HOUSES.map((h, i) => `${i + 1}️⃣ ${h}`).join('\n');
    await sendMessage(from,
      `✅ Location received!\n\nStep 2️⃣: Select your *house/post*:\n\n${list}`
    );

  } else if (step === 'count') {
    await sendMessage(from,
      `Step 3️⃣: How many *operatives* are at this location?\n_(Enter a number, e.g. 2)_`
    );

  } else if (step === 'operative_name') {
    const n = currentOperative + 1;
    const total = operatives.length;
    await sendMessage(from,
      `👤 *Operative ${n} of ${total}*\n\nEnter their *full name*:`
    );

  } else if (step === 'operative_id') {
    const n = currentOperative + 1;
    const total = operatives.length;
    await sendMessage(from,
      `👤 *Operative ${n} of ${total}*\n\nEnter their *Guard ID / Badge Number*:`
    );

  } else if (step === 'shift') {
    await sendMessage(from,
      `Step 4️⃣: What is the current *shift*?\n\n1️⃣ Morning\n2️⃣ Afternoon\n3️⃣ Night`
    );

  } else if (step === 'status') {
    await sendMessage(from,
      `Step 5️⃣: What is the current *status*?\n\n1️⃣ All Clear ✅\n2️⃣ Incident ⚠️\n3️⃣ Emergency 🚨`
    );

  } else if (step === 'incident') {
    await sendMessage(from,
      `Step 6️⃣: Please provide an *incident report*.\n_(Type *nil* if nothing to report)_`
    );

  } else if (step === 'photo') {
    const names = session.operatives.map(o => o.name).join(', ');
    await sendMessage(from,
      `Step 7️⃣: Please take a *group photo* 📷 of all operatives at this post.\n\n_(${names})_`
    );
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
async function handleWebhook(req, res) {
  res.sendStatus(200);

  try {
    const entry   = req.body?.entry?.[0];
    const value   = entry?.changes?.[0]?.value;
    if (!value?.messages) return;

    const message = value.messages[0];
    const from    = message.from;
    const type    = message.type;
    const contact = value.contacts?.[0]?.profile?.name || from;

    console.log(`Message from ${contact} (${from}): type=${type}`);

    // ── Start new session ─────────────────────────────────────────────────────
    if (!sessions[from]) {
      sessions[from] = {
        checkinId:        uuidv4(),
        phone:            from,
        timestamp:        new Date().toISOString(),
        step:             'location',
        latitude:         null,
        longitude:        null,
        mapLink:          null,
        address:          null,
        house:            null,
        operatives:       [],      // [{ name, guardId }]
        currentOperative: 0,
        shift:            null,
        status:           null,
        incident:         null,
        imageUrl:         null,
        timer:            null,
      };
      startTimeout(from);
      await promptNext(from, sessions[from]);
      return;
    }

    const session = sessions[from];
    startTimeout(from); // reset inactivity timer

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
      session.address   = await reverseGeocode(latitude, longitude);
      session.step      = 'house';
      await promptNext(from, session);

    // ── STEP 2: House selection ───────────────────────────────────────────────
    } else if (session.step === 'house') {
      if (type !== 'text') {
        await sendMessage(from, `Please reply with a number to select your house.`);
        return;
      }
      const idx = parseInt(message.text.body.trim()) - 1;
      if (isNaN(idx) || idx < 0 || idx >= HOUSES.length) {
        const list = HOUSES.map((h, i) => `${i + 1}️⃣ ${h}`).join('\n');
        await sendMessage(from, `Please reply with a number from the list:\n\n${list}`);
        return;
      }
      session.house = HOUSES[idx];
      session.step  = 'count';
      await promptNext(from, session);

    // ── STEP 3: Operative count ───────────────────────────────────────────────
    } else if (session.step === 'count') {
      if (type !== 'text') {
        await sendMessage(from, `Please enter the number of operatives.`);
        return;
      }
      const count = parseInt(message.text.body.trim());
      if (isNaN(count) || count < 1 || count > 20) {
        await sendMessage(from, `Please enter a valid number between 1 and 20.`);
        return;
      }
      // Pre-fill operative slots
      session.operatives       = Array.from({ length: count }, () => ({ name: null, guardId: null }));
      session.currentOperative = 0;
      session.step             = 'operative_name';
      await promptNext(from, session);

    // ── STEP 4: Operative name (loops per operative) ──────────────────────────
    } else if (session.step === 'operative_name') {
      if (type !== 'text') {
        await sendMessage(from, `Please type the operative's *full name*.`);
        return;
      }
      session.operatives[session.currentOperative].name = message.text.body.trim();
      session.step = 'operative_id';
      await promptNext(from, session);

    // ── STEP 5: Operative ID (loops per operative) ────────────────────────────
    } else if (session.step === 'operative_id') {
      if (type !== 'text') {
        await sendMessage(from, `Please type the operative's *Guard ID*.`);
        return;
      }
      session.operatives[session.currentOperative].guardId = message.text.body.trim();

      // Move to next operative or continue to shift
      const next = session.currentOperative + 1;
      if (next < session.operatives.length) {
        session.currentOperative = next;
        session.step             = 'operative_name';
      } else {
        session.step = 'shift';
      }
      await promptNext(from, session);

    // ── STEP 6: Shift ─────────────────────────────────────────────────────────
    } else if (session.step === 'shift') {
      if (type !== 'text') {
        await sendMessage(from, `Please reply with *1*, *2*, or *3* for the shift.`);
        return;
      }
      const shift = SHIFT_MAP[message.text.body.trim()];
      if (!shift) {
        await sendMessage(from, `Please reply with *1* (Morning), *2* (Afternoon), or *3* (Night).`);
        return;
      }
      session.shift = shift;
      session.step  = 'status';
      await promptNext(from, session);

    // ── STEP 7: Status ────────────────────────────────────────────────────────
    } else if (session.step === 'status') {
      if (type !== 'text') {
        await sendMessage(from, `Please reply with *1*, *2*, or *3* for the status.`);
        return;
      }
      const status = STATUS_MAP[message.text.body.trim()];
      if (!status) {
        await sendMessage(from, `Please reply with *1* (All Clear), *2* (Incident), or *3* (Emergency).`);
        return;
      }
      session.status = status;
      session.step   = 'incident';
      await promptNext(from, session);

    // ── STEP 8: Incident report ───────────────────────────────────────────────
    } else if (session.step === 'incident') {
      if (type !== 'text') {
        await sendMessage(from, `Please type the incident report, or type *nil*.`);
        return;
      }
      session.incident = message.text.body.trim();
      session.step     = 'photo';
      await promptNext(from, session);

    // ── STEP 9: Group photo — log everything ──────────────────────────────────
    } else if (session.step === 'photo') {
      if (type !== 'image') {
        await sendMessage(from, `Please send the *group photo* 📷`);
        return;
      }

      await sendMessage(from, `📷 Got the photo! Logging check-in for all operatives...`);

      // Download and upload to Cloudinary for permanent URL
      const imageBuffer = await downloadMedia(message.image.id);
      const filename    = `checkin_${session.checkinId}`;
      const imageUrl    = await uploadToCloudinary(imageBuffer, filename);

      const time = new Date(session.timestamp).toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos',
      });

      // Log one row per operative to Sheet + DB
      for (const operative of session.operatives) {
        const row = [
          session.timestamp,
          operative.name,
          operative.guardId,
          session.phone,
          session.house,
          session.shift,
          session.status,
          session.incident,
          session.address,
          session.latitude,
          session.longitude,
          session.mapLink,
          `=IMAGE("${imageUrl}")`,
        ];

        await appendToSheet(row);
        await insertCheckin({
          checkinId: session.checkinId,
          timestamp: session.timestamp,
          name:      operative.name,
          guardId:   operative.guardId,
          phone:     session.phone,
          house:     session.house,
          shift:     session.shift,
          status:    session.status,
          incident:  session.incident,
          address:   session.address,
          latitude:  session.latitude,
          longitude: session.longitude,
          mapLink:   session.mapLink,
          imageUrl,
        });
      }

      // Build summary of all operatives
      const operativeList = session.operatives
        .map((o, i) => `  ${i + 1}. ${o.name} (ID: ${o.guardId})`)
        .join('\n');

      await sendMessage(from,
        `✅ *Check-in logged at ${time}*\n\n` +
        `🏠 House: ${session.house}\n` +
        `🌙 Shift: ${session.shift}\n` +
        `🚨 Status: ${session.status}\n` +
        `📝 Report: ${session.incident}\n` +
        `📍 Address: ${session.address}\n\n` +
        `👥 *Operatives logged (${session.operatives.length}):*\n${operativeList}\n\n` +
        `Stay safe! 🛡️`
      );

      clearTimeout(session.timer);
      delete sessions[from];
    }

  } catch (err) {
    console.error('Webhook error:', err.message);
  }
}

module.exports = { verifyWebhook, handleWebhook };
