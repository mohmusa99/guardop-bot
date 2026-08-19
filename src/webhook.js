const { sendMessage, downloadMedia } = require('./whatsapp');
const { appendToSheet }              = require('./sheets');
const { reverseGeocode }             = require('./geocode');
const { uploadToCloudinary }         = require('./cloudinary');
const { insertCheckin, isWhitelisted, addToWhitelist, removeFromWhitelist, listWhitelist } = require('./db');
const { addWatermark }               = require('./watermark');
const { v4: uuidv4 }                 = require('uuid');

// ── Phone → House mapping from environment variable ───────────────────────────
// Format in Railway: 2349121386412:CJN Quarters,2349121831287:Supreme Court Complex
const PHONE_HOUSE_MAP = Object.fromEntries(
  (process.env.PHONE_HOUSE_MAP || '').split(',')
    .filter(Boolean)
    .map(entry => {
      const idx   = entry.indexOf(':');
      const phone = entry.slice(0, idx).trim();
      const house = entry.slice(idx + 1).trim();
      return [phone, house];
    })
);

console.log('House map loaded:', PHONE_HOUSE_MAP);

const SHIFT_MAP  = { '1': 'Morning', '2': 'Afternoon', '3': 'Night' };
const STATUS_MAP = { '1': 'All Clear ✅', '2': 'Incident ⚠️', '3': 'Emergency 🚨' };
const ADMIN_NUMBERS = (process.env.ADMIN_NUMBERS || '').split(',').map(n => n.trim()).filter(Boolean);
const sessions   = {};
const TIMEOUT_MS = 5 * 60 * 1000;

function getNigerianTimestamp() {
  return new Date().toLocaleString('en-GB', {
    timeZone: 'Africa/Lagos',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
}

function startTimeout(from) {
  if (sessions[from]?.timer) clearTimeout(sessions[from].timer);
  sessions[from].timer = setTimeout(async () => {
    if (sessions[from]) {
      delete sessions[from];
      try { await sendMessage(from, `⏰ Your check-in session expired.\n\nSend any message to start again.`); }
      catch (e) { /* silent */ }
    }
  }, TIMEOUT_MS);
}

function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'], token = req.query['hub.verify_token'], challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) { console.log('Webhook verified'); return res.status(200).send(challenge); }
  res.sendStatus(403);
}

async function promptNext(from, session) {
  const { step, operatives, currentOperative } = session;
  if (step === 'location')            await sendMessage(from, `👋 Welcome! Reporting for *${session.house}*.\n\nStep 1️⃣: Please share your *current location* 📍`);
  else if (step === 'count')          await sendMessage(from, `✅ Location received!\n\nStep 2️⃣: How many *operatives* are at this location?`);
  else if (step === 'operative_name') await sendMessage(from, `👤 *Operative ${currentOperative + 1} of ${operatives.length}*\n\nEnter their *full name*:`);
  else if (step === 'operative_id')   await sendMessage(from, `👤 *Operative ${currentOperative + 1} of ${operatives.length}*\n\nEnter their *Guard ID*:`);
  else if (step === 'shift')          await sendMessage(from, `Step 3️⃣: Current *shift*?\n\n1️⃣ Morning\n2️⃣ Afternoon\n3️⃣ Night`);
  else if (step === 'status')         await sendMessage(from, `Step 4️⃣: Current *status*?\n\n1️⃣ All Clear ✅\n2️⃣ Incident ⚠️\n3️⃣ Emergency 🚨`);
  else if (step === 'armed_police')   await sendMessage(from, `Step 5️⃣: How many *armed police officers* at this location?\n_(Enter 0 if none)_`);
  else if (step === 'incident')       await sendMessage(from, `Step 6️⃣: *Incident report*?\n_(Type *nil* if nothing to report)_`);
  else if (step === 'photo') {
    const names = operatives.map(o => o.name).join(', ');
    await sendMessage(from, `Step 7️⃣: Take a *live group photo* 📷\n\n_(${names})_\n\n⚠️ *Do not upload from gallery.*`);
  }
}

async function handleWebhook(req, res) {
  res.sendStatus(200);
  let from;
  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    if (!value?.messages) return;
    const message = value.messages[0];
    from          = message.from;
    const type    = message.type;
    const contact = value.contacts?.[0]?.profile?.name || from;
    console.log(`Message from ${contact} (${from}): type=${type}`);

    // ── Admin commands ────────────────────────────────────────────────────────
    if (ADMIN_NUMBERS.includes(from) && type === 'text') {
      const text = message.text.body.trim(), lower = text.toLowerCase();
      if (lower.startsWith('add ')) {
        const parts = text.split(' ').slice(1), phone = parts[0], name = parts.slice(1).join(' ') || null;
        await addToWhitelist(phone, name);
        await sendMessage(from, `✅ Added ${phone}${name ? ` (${name})` : ''} to whitelist.`); return;
      }
      if (lower.startsWith('remove ')) {
        const phone = text.split(' ')[1];
        await removeFromWhitelist(phone);
        await sendMessage(from, `🗑️ Removed ${phone}.`); return;
      }
      if (lower === 'list') {
        const entries = await listWhitelist();
        await sendMessage(from, entries.length
          ? `📋 *Whitelisted:*\n\n${entries.map(e => `• ${e.phone}${e.name ? ` (${e.name})` : ''}`).join('\n')}`
          : 'No numbers whitelisted yet.'); return;
      }
    }

    // ── Whitelist check ───────────────────────────────────────────────────────
    if (!ADMIN_NUMBERS.includes(from)) {
      if (!await isWhitelisted(from)) {
        await sendMessage(from, `🚫 Not registered. Contact your supervisor.`); return;
      }
    }

    // ── New session ───────────────────────────────────────────────────────────
    if (!sessions[from]) {
      sessions[from] = {
        checkinId: uuidv4(), phone: from, timestamp: getNigerianTimestamp(),
        step: 'location', house: PHONE_HOUSE_MAP[from] || null,
        latitude: null, longitude: null, mapLink: null, address: null,
        operatives: [], currentOperative: 0,
        shift: null, status: null, armedPolice: null, incident: null, timer: null,
      };
      startTimeout(from);
      await promptNext(from, sessions[from]); return;
    }

    const session = sessions[from];
    startTimeout(from);

    if (session.step === 'location') {
      if (type !== 'location') { await sendMessage(from, `Please share your *location* 📍`); return; }
      session.latitude  = message.location.latitude;
      session.longitude = message.location.longitude;
      session.mapLink   = `https://maps.google.com/?q=${session.latitude},${session.longitude}`;
      session.address   = await reverseGeocode(session.latitude, session.longitude);
      session.step      = 'count'; await promptNext(from, session);

    } else if (session.step === 'count') {
      const count = parseInt(message.text?.body?.trim());
      if (isNaN(count) || count < 1 || count > 20) { await sendMessage(from, `Please enter a valid number between 1 and 20.`); return; }
      session.operatives = Array.from({ length: count }, () => ({ name: null, guardId: null }));
      session.currentOperative = 0; session.step = 'operative_name'; await promptNext(from, session);

    } else if (session.step === 'operative_name') {
      if (type !== 'text') { await sendMessage(from, `Please type the operative's *full name*.`); return; }
      session.operatives[session.currentOperative].name = message.text.body.trim();
      session.step = 'operative_id'; await promptNext(from, session);

    } else if (session.step === 'operative_id') {
      if (type !== 'text') { await sendMessage(from, `Please type the operative's *Guard ID*.`); return; }
      session.operatives[session.currentOperative].guardId = message.text.body.trim();
      const next = session.currentOperative + 1;
      if (next < session.operatives.length) { session.currentOperative = next; session.step = 'operative_name'; }
      else { session.step = 'shift'; }
      await promptNext(from, session);

    } else if (session.step === 'shift') {
      const shift = SHIFT_MAP[message.text?.body?.trim()];
      if (!shift) { await sendMessage(from, `Reply with *1* (Morning), *2* (Afternoon), or *3* (Night).`); return; }
      session.shift = shift; session.step = 'status'; await promptNext(from, session);

    } else if (session.step === 'status') {
      const status = STATUS_MAP[message.text?.body?.trim()];
      if (!status) { await sendMessage(from, `Reply with *1* (All Clear), *2* (Incident), or *3* (Emergency).`); return; }
      session.status = status; session.step = 'armed_police'; await promptNext(from, session);

    } else if (session.step === 'armed_police') {
      const count = parseInt(message.text?.body?.trim());
      if (isNaN(count) || count < 0) { await sendMessage(from, `Please enter a valid number (0 if none).`); return; }
      session.armedPolice = count; session.step = 'incident'; await promptNext(from, session);

    } else if (session.step === 'incident') {
      if (type !== 'text') { await sendMessage(from, `Please type the incident report or *nil*.`); return; }
      session.incident = message.text.body.trim(); session.step = 'photo'; await promptNext(from, session);

    } else if (session.step === 'photo') {
      if (type !== 'image') { await sendMessage(from, `Please take and send a *live photo* 📷`); return; }
      if (message.context?.forwarded || (message.context?.forwarding_score || 0) > 0) {
        await sendMessage(from, `⚠️ Gallery image detected. Please take a *new live photo* 📷`); return;
      }

      await sendMessage(from, `📷 Got the photo! Logging check-in...`);
      const imageBuffer = await downloadMedia(message.image.id);
      const watermarked = await addWatermark(imageBuffer, { timestamp: session.timestamp, house: session.house, operatives: session.operatives });
      const imageUrl    = await uploadToCloudinary(watermarked, `checkin_${session.checkinId}`);
      const time        = session.timestamp;

      for (const op of session.operatives) {
        await appendToSheet([time, op.name, op.guardId, session.phone, session.house, session.shift, session.status, session.armedPolice, session.incident, session.address, session.latitude, session.longitude, session.mapLink, `=IMAGE("${imageUrl}")`]);
        await insertCheckin({ checkinId: session.checkinId, timestamp: time, name: op.name, guardId: op.guardId, phone: session.phone, house: session.house, shift: session.shift, status: session.status, armedPolice: session.armedPolice, incident: session.incident, address: session.address, latitude: session.latitude, longitude: session.longitude, mapLink: session.mapLink, imageUrl });
      }

      await sendMessage(from,
        `✅ *Check-in logged at ${time}*\n\n` +
        `🏠 House: ${session.house}\n🌙 Shift: ${session.shift}\n🚨 Status: ${session.status}\n` +
        `👮 Armed Police: ${session.armedPolice}\n📝 Report: ${session.incident}\n📍 Address: ${session.address}\n\n` +
        `👥 *Operatives (${session.operatives.length}):*\n${session.operatives.map((o, i) => `  ${i + 1}. ${o.name} (ID: ${o.guardId})`).join('\n')}\n\nStay safe! 🛡️`
      );
      clearTimeout(session.timer); delete sessions[from];
    }

  } catch (err) {
    console.error('Webhook error:', err.message);
    if (from && sessions[from]) { clearTimeout(sessions[from].timer); delete sessions[from]; }
    try { if (from) await sendMessage(from, `⚠️ Something went wrong. Send any message to start again.`); } catch (e) { /* silent */ }
  }
}

module.exports = { verifyWebhook, handleWebhook };
