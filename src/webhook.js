const { sendMessage, downloadMedia } = require('./whatsapp');
const { appendToSheet }              = require('./sheets');
const { reverseGeocode }             = require('./geocode');
const { uploadToCloudinary }         = require('./cloudinary');
const { insertCheckin, isWhitelisted, addToWhitelist, removeFromWhitelist, listWhitelist } = require('./db');
const { addWatermark }               = require('./watermark');
const { v4: uuidv4 }                 = require('uuid');

// ── Phone → House mapping ─────────────────────────────────────────────────────
const PHONE_HOUSE_MAP = {
  // Number 1 residents
  '2349121386412': 'CJN Quarters',
  '2349121831287': 'Supreme Court Complex',
  '2348102863616': "Justice Okoro's Quarters",
  // Number 2 residents
  '2349130113485': "Justice Garba's Quarters",
  '2349135314960': "Justice Ogunwumiju's Quarters",
  '2349130113485': "Justice Garba Quarters",
  '2349135314960': "Justice Ogunwumiju Quarters"
};

const SHIFT_MAP  = { '1': 'Morning', '2': 'Afternoon', '3': 'Night' };
const STATUS_MAP = { '1': 'All Clear ✅', '2': 'Incident ⚠️', '3': 'Emergency 🚨' };

const ADMIN_NUMBERS = (process.env.ADMIN_NUMBERS || '').split(',').map(n => n.trim()).filter(Boolean);

const sessions   = {};
const TIMEOUT_MS = 5 * 60 * 1000;

// ── Nigerian time ─────────────────────────────────────────────────────────────
function getNigerianTimestamp() {
  return new Date().toLocaleString('en-GB', {
    timeZone: 'Africa/Lagos',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
}

// ── Inactivity timer ──────────────────────────────────────────────────────────
function startTimeout(from, phoneNumberId) {
  if (sessions[from]?.timer) clearTimeout(sessions[from].timer);
  sessions[from].timer = setTimeout(async () => {
    if (sessions[from]) {
      delete sessions[from];
      try {
        await sendMessage(from,
          `⏰ Your check-in session expired due to inactivity.\n\nSend any message to start a new check-in.`,
          phoneNumberId
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
  const { step, operatives, currentOperative, phoneNumberId } = session;

  if (step === 'location') {
    await sendMessage(from,
      `👋 Welcome! Reporting for *${session.house}*.\n\nStep 1️⃣: Please share your *current location* 📍`,
      phoneNumberId
    );
  } else if (step === 'count') {
    await sendMessage(from,
      `✅ Location received!\n\nStep 2️⃣: How many *operatives* are at this location?\n_(Enter a number, e.g. 2)_`,
      phoneNumberId
    );
  } else if (step === 'operative_name') {
    const n = currentOperative + 1;
    const total = operatives.length;
    await sendMessage(from,
      `👤 *Operative ${n} of ${total}*\n\nEnter their *full name*:`,
      phoneNumberId
    );
  } else if (step === 'operative_id') {
    const n = currentOperative + 1;
    const total = operatives.length;
    await sendMessage(from,
      `👤 *Operative ${n} of ${total}*\n\nEnter their *Guard ID / Badge Number*:`,
      phoneNumberId
    );
  } else if (step === 'shift') {
    await sendMessage(from,
      `Step 3️⃣: What is the current *shift*?\n\n1️⃣ Morning\n2️⃣ Afternoon\n3️⃣ Night`,
      phoneNumberId
    );
  } else if (step === 'status') {
    await sendMessage(from,
      `Step 4️⃣: What is the current *status*?\n\n1️⃣ All Clear ✅\n2️⃣ Incident ⚠️\n3️⃣ Emergency 🚨`,
      phoneNumberId
    );
  } else if (step === 'armed_police') {
    await sendMessage(from,
      `Step 5️⃣: How many *armed police officers* are currently at this location?\n_(Enter a number, e.g. 2. Enter 0 if none)_`,
      phoneNumberId
    );
  } else if (step === 'incident') {
    await sendMessage(from,
      `Step 6️⃣: Please provide an *incident report*.\n_(Type *nil* if nothing to report)_`,
      phoneNumberId
    );
  } else if (step === 'photo') {
    const names = session.operatives.map(o => o.name).join(', ');
    await sendMessage(from,
      `Step 7️⃣: Take a *live group photo* 📷 of all operatives at this post.\n\n_(${names})_\n\n⚠️ *Please take a new photo now — do not upload from gallery.*`,
      phoneNumberId
    );
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
async function handleWebhook(req, res) {
  res.sendStatus(200);

  let from;
  let phoneNumberId;
  try {
    const entry   = req.body?.entry?.[0];
    const value   = entry?.changes?.[0]?.value;
    if (!value?.messages) return;

    const message   = value.messages[0];
    from            = message.from;
    phoneNumberId   = value.metadata?.phone_number_id; // which bot number received this
    const type      = message.type;
    const contact   = value.contacts?.[0]?.profile?.name || from;

    console.log(`Message from ${contact} (${from}) via ${phoneNumberId}: type=${type}`);

    // ── ADMIN COMMANDS ────────────────────────────────────────────────────────
    if (ADMIN_NUMBERS.includes(from) && type === 'text') {
      const text  = message.text.body.trim();
      const lower = text.toLowerCase();

      if (lower.startsWith('add ')) {
        const parts = text.split(' ').slice(1);
        const phone = parts[0];
        const name  = parts.slice(1).join(' ') || null;
        await addToWhitelist(phone, name);
        await sendMessage(from, `✅ Added ${phone}${name ? ` (${name})` : ''} to the whitelist.`, phoneNumberId);
        return;
      }
      if (lower.startsWith('remove ')) {
        const phone = text.split(' ')[1];
        await removeFromWhitelist(phone);
        await sendMessage(from, `🗑️ Removed ${phone} from the whitelist.`, phoneNumberId);
        return;
      }
      if (lower === 'list') {
        const entries = await listWhitelist();
        const listStr = entries.length
          ? entries.map(e => `• ${e.phone}${e.name ? ` (${e.name})` : ''}`).join('\n')
          : 'No numbers whitelisted yet.';
        await sendMessage(from, `📋 *Whitelisted numbers:*\n\n${listStr}`, phoneNumberId);
        return;
      }
    }

    // ── WHITELIST CHECK ───────────────────────────────────────────────────────
    if (!ADMIN_NUMBERS.includes(from)) {
      const allowed = await isWhitelisted(from);
      if (!allowed) {
        await sendMessage(from,
          `🚫 This number isn't registered for check-ins.\n\nContact your supervisor to be added.`,
          phoneNumberId
        );
        return;
      }
    }

    const assignedHouse = PHONE_HOUSE_MAP[from] || null;

    // ── Start new session ─────────────────────────────────────────────────────
    if (!sessions[from]) {
      sessions[from] = {
        checkinId:        uuidv4(),
        phone:            from,
        phoneNumberId,            // store which bot number to reply through
        timestamp:        getNigerianTimestamp(),
        step:             'location',
        house:            assignedHouse,
        latitude:         null,
        longitude:        null,
        mapLink:          null,
        address:          null,
        operatives:       [],
        currentOperative: 0,
        shift:            null,
        status:           null,
        armedPolice:      null,
        incident:         null,
        imageUrl:         null,
        timer:            null,
      };
      startTimeout(from, phoneNumberId);
      await promptNext(from, sessions[from]);
      return;
    }

    const session = sessions[from];
    startTimeout(from, phoneNumberId);

    // ── STEP 1: Location ──────────────────────────────────────────────────────
    if (session.step === 'location') {
      if (type !== 'location') {
        await sendMessage(from, `Please share your *location* 📍 using the attachment button.`, session.phoneNumberId);
        return;
      }
      const { latitude, longitude } = message.location;
      session.latitude  = latitude;
      session.longitude = longitude;
      session.mapLink   = `https://maps.google.com/?q=${latitude},${longitude}`;
      session.address   = await reverseGeocode(latitude, longitude);
      session.step      = 'count';
      await promptNext(from, session);

    // ── STEP 2: Operative count ───────────────────────────────────────────────
    } else if (session.step === 'count') {
      if (type !== 'text') { await sendMessage(from, `Please enter the number of operatives.`, session.phoneNumberId); return; }
      const count = parseInt(message.text.body.trim());
      if (isNaN(count) || count < 1 || count > 20) {
        await sendMessage(from, `Please enter a valid number between 1 and 20.`, session.phoneNumberId);
        return;
      }
      session.operatives       = Array.from({ length: count }, () => ({ name: null, guardId: null }));
      session.currentOperative = 0;
      session.step             = 'operative_name';
      await promptNext(from, session);

    // ── STEP 3: Operative name ────────────────────────────────────────────────
    } else if (session.step === 'operative_name') {
      if (type !== 'text') { await sendMessage(from, `Please type the operative's *full name*.`, session.phoneNumberId); return; }
      session.operatives[session.currentOperative].name = message.text.body.trim();
      session.step = 'operative_id';
      await promptNext(from, session);

    // ── STEP 4: Operative ID ──────────────────────────────────────────────────
    } else if (session.step === 'operative_id') {
      if (type !== 'text') { await sendMessage(from, `Please type the operative's *Guard ID*.`, session.phoneNumberId); return; }
      session.operatives[session.currentOperative].guardId = message.text.body.trim();
      const next = session.currentOperative + 1;
      if (next < session.operatives.length) {
        session.currentOperative = next;
        session.step             = 'operative_name';
      } else {
        session.step = 'shift';
      }
      await promptNext(from, session);

    // ── STEP 5: Shift ─────────────────────────────────────────────────────────
    } else if (session.step === 'shift') {
      if (type !== 'text') { await sendMessage(from, `Please reply with *1*, *2*, or *3* for the shift.`, session.phoneNumberId); return; }
      const shift = SHIFT_MAP[message.text.body.trim()];
      if (!shift) {
        await sendMessage(from, `Please reply with *1* (Morning), *2* (Afternoon), or *3* (Night).`, session.phoneNumberId);
        return;
      }
      session.shift = shift;
      session.step  = 'status';
      await promptNext(from, session);

    // ── STEP 6: Status ────────────────────────────────────────────────────────
    } else if (session.step === 'status') {
      if (type !== 'text') { await sendMessage(from, `Please reply with *1*, *2*, or *3* for the status.`, session.phoneNumberId); return; }
      const status = STATUS_MAP[message.text.body.trim()];
      if (!status) {
        await sendMessage(from, `Please reply with *1* (All Clear), *2* (Incident), or *3* (Emergency).`, session.phoneNumberId);
        return;
      }
      session.status = status;
      session.step   = 'armed_police';
      await promptNext(from, session);

    // ── STEP 7: Armed police ──────────────────────────────────────────────────
    } else if (session.step === 'armed_police') {
      if (type !== 'text') { await sendMessage(from, `Please enter the number of armed police officers.`, session.phoneNumberId); return; }
      const count = parseInt(message.text.body.trim());
      if (isNaN(count) || count < 0) {
        await sendMessage(from, `Please enter a valid number (0 if none).`, session.phoneNumberId);
        return;
      }
      session.armedPolice = count;
      session.step        = 'incident';
      await promptNext(from, session);

    // ── STEP 8: Incident report ───────────────────────────────────────────────
    } else if (session.step === 'incident') {
      if (type !== 'text') { await sendMessage(from, `Please type the incident report, or type *nil*.`, session.phoneNumberId); return; }
      session.incident = message.text.body.trim();
      session.step     = 'photo';
      await promptNext(from, session);

    // ── STEP 9: Group photo ───────────────────────────────────────────────────
    } else if (session.step === 'photo') {
      if (type !== 'image') {
        await sendMessage(from, `Please take and send a *live photo* 📷 — do not upload from gallery.`, session.phoneNumberId);
        return;
      }

      const isForwarded  = message.context?.forwarded === true;
      const forwardScore = message.context?.forwarding_score || 0;
      if (isForwarded || forwardScore > 0) {
        await sendMessage(from,
          `⚠️ It looks like that image was uploaded from your gallery or forwarded.\n\nPlease *take a new live photo* right now using your camera 📷 and send it.`,
          session.phoneNumberId
        );
        return;
      }

      await sendMessage(from, `📷 Got the photo! Logging check-in for all operatives...`, session.phoneNumberId);

      const imageBuffer = await downloadMedia(message.image.id, session.phoneNumberId);
      const watermarked = await addWatermark(imageBuffer, {
        timestamp:  session.timestamp,
        house:      session.house,
        operatives: session.operatives,
      });
      const filename = `checkin_${session.checkinId}`;
      const imageUrl = await uploadToCloudinary(watermarked, filename);
      const time     = session.timestamp;

      for (const operative of session.operatives) {
        const row = [
          time,
          operative.name,
          operative.guardId,
          session.phone,
          session.house,
          session.shift,
          session.status,
          session.armedPolice,
          session.incident,
          session.address,
          session.latitude,
          session.longitude,
          session.mapLink,
          `=IMAGE("${imageUrl}")`,
        ];
        await appendToSheet(row);
        await insertCheckin({
          checkinId:   session.checkinId,
          timestamp:   time,
          name:        operative.name,
          guardId:     operative.guardId,
          phone:       session.phone,
          house:       session.house,
          shift:       session.shift,
          status:      session.status,
          armedPolice: session.armedPolice,
          incident:    session.incident,
          address:     session.address,
          latitude:    session.latitude,
          longitude:   session.longitude,
          mapLink:     session.mapLink,
          imageUrl,
        });
      }

      const operativeList = session.operatives
        .map((o, i) => `  ${i + 1}. ${o.name} (ID: ${o.guardId})`)
        .join('\n');

      await sendMessage(from,
        `✅ *Check-in logged at ${time}*\n\n` +
        `🏠 House: ${session.house}\n` +
        `🌙 Shift: ${session.shift}\n` +
        `🚨 Status: ${session.status}\n` +
        `👮 Armed Police: ${session.armedPolice}\n` +
        `📝 Report: ${session.incident}\n` +
        `📍 Address: ${session.address}\n\n` +
        `👥 *Operatives logged (${session.operatives.length}):*\n${operativeList}\n\n` +
        `Stay safe! 🛡️`,
        session.phoneNumberId
      );

      clearTimeout(session.timer);
      delete sessions[from];
    }

  } catch (err) {
    console.error('Webhook error:', err.message);
    if (from && sessions[from]) {
      clearTimeout(sessions[from].timer);
      delete sessions[from];
    }
    try {
      if (from) await sendMessage(from,
        `⚠️ Something went wrong. Please send any message to start again.`,
        phoneNumberId
      );
    } catch (e) { /* silent */ }
  }
}

module.exports = { verifyWebhook, handleWebhook };
