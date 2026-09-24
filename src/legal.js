const express = require('express');
const router  = express.Router();

const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'admin@supremecourt.gov.ng';
const APP_NAME      = 'Guards OP – Supreme Court Security Attendance System';
const LAST_UPDATED  = 'September 2026';

// ── Shared page shell ─────────────────────────────────────────────────────────
function page(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title} – Guards OP</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           background: #f8f9fa; color: #212529; line-height: 1.7; }
    header { background: #1a1a2e; color: #fff; padding: 24px 0; text-align: center; }
    header h1 { font-size: 1.4rem; font-weight: 600; letter-spacing: .02em; }
    header p  { font-size: .85rem; opacity: .7; margin-top: 4px; }
    main { max-width: 760px; margin: 40px auto; padding: 0 20px 60px; }
    h2 { font-size: 1.25rem; color: #1a1a2e; margin: 32px 0 10px; border-left: 4px solid #0d6efd; padding-left: 12px; }
    p, li { font-size: .95rem; color: #444; margin-bottom: 10px; }
    ul { padding-left: 20px; margin-bottom: 10px; }
    a { color: #0d6efd; }
    .badge { display: inline-block; background: #e8f0fe; color: #1a56db;
             font-size: .78rem; padding: 3px 10px; border-radius: 20px; margin-bottom: 20px; }
    .card  { background: #fff; border: 1px solid #dee2e6; border-radius: 10px;
             padding: 28px 32px; margin-bottom: 20px; }
    .nav   { display: flex; gap: 20px; justify-content: center; margin: 30px 0 0;
             font-size: .88rem; }
    footer { text-align: center; font-size: .8rem; color: #888; padding: 20px; }
  </style>
</head>
<body>
  <header>
    <h1>🛡️ Guards OP</h1>
    <p>Supreme Court of Nigeria – Security Attendance System</p>
  </header>
  <main>
    <div class="nav">
      <a href="/privacy">Privacy Policy</a>
      <a href="/terms">Terms of Service</a>
      <a href="/delete-data">Data Deletion</a>
    </div>
    ${body}
  </main>
  <footer>© ${new Date().getFullYear()} Supreme Court of Nigeria. Internal use only.</footer>
</body>
</html>`;
}

// ── GET /privacy ──────────────────────────────────────────────────────────────
router.get('/privacy', (req, res) => {
  res.send(page('Privacy Policy', `
    <h2 style="border:none;padding:0;margin-top:28px;font-size:1.6rem;color:#1a1a2e">Privacy Policy</h2>
    <span class="badge">Last updated: ${LAST_UPDATED}</span>

    <div class="card">
      <h2>1. About This System</h2>
      <p>${APP_NAME} is an internal WhatsApp-based attendance and location reporting tool used exclusively by security personnel of the Supreme Court of Nigeria. It is not a public-facing consumer application.</p>
    </div>

    <div class="card">
      <h2>2. Data We Collect</h2>
      <p>When a registered security operative submits a check-in, the system collects:</p>
      <ul>
        <li><strong>Phone number</strong> — used to identify the operative and route messages.</li>
        <li><strong>GPS location</strong> — the live location shared via WhatsApp at the time of check-in.</li>
        <li><strong>Selfie / group photo</strong> — a photo taken at the duty post to confirm physical presence.</li>
        <li><strong>Attendance timestamp</strong> — the date and time of each check-in, recorded in West Africa Time (WAT).</li>
        <li><strong>Guard ID and name</strong> — entered by the operative during the check-in flow.</li>
        <li><strong>Duty post / assigned location</strong> — the house or post the phone number is assigned to.</li>
        <li><strong>Incident report</strong> — a brief text note submitted by the operative.</li>
        <li><strong>Number of armed police officers</strong> — a numeric count submitted at check-in.</li>
      </ul>
    </div>

    <div class="card">
      <h2>3. How We Use Your Data</h2>
      <ul>
        <li>To record and verify security personnel attendance at assigned posts.</li>
        <li>To generate internal operational reports for supervisors.</li>
        <li>To maintain a historical log of duty coverage for the Supreme Court premises.</li>
      </ul>
      <p>This data is used <strong>solely for internal operational purposes</strong>. It is never used for advertising, marketing, profiling, or sold to any third party.</p>
    </div>

    <div class="card">
      <h2>4. Data Storage</h2>
      <ul>
        <li>Check-in records are stored in a <strong>PostgreSQL database</strong> hosted on Railway.</li>
        <li>Photos are stored on <strong>Cloudinary</strong> with restricted access.</li>
        <li>Attendance summaries are logged to an internal <strong>Google Sheet</strong> accessible only to authorised supervisors.</li>
      </ul>
    </div>

    <div class="card">
      <h2>5. Data Sharing</h2>
      <p>We do not share personal data with any third party except the infrastructure providers necessary to operate the system (Railway, Cloudinary, Google). These providers are bound by their own data processing agreements.</p>
      <p>We do not share data with Meta/WhatsApp beyond what is required to deliver messages through the WhatsApp Business API.</p>
    </div>

    <div class="card">
      <h2>6. Data Retention</h2>
      <p>Attendance records are retained for a minimum of 12 months for operational audit purposes. Photos may be retained for 90 days before automatic deletion from Cloudinary.</p>
    </div>

    <div class="card">
      <h2>7. Your Rights</h2>
      <p>Registered operatives may request access to, correction of, or deletion of their personal data by contacting the system administrator at <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
    </div>

    <div class="card">
      <h2>8. Contact</h2>
      <p>For any privacy-related enquiries, contact: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
    </div>
  `));
});

// ── GET /terms ────────────────────────────────────────────────────────────────
router.get('/terms', (req, res) => {
  res.send(page('Terms of Service', `
    <h2 style="border:none;padding:0;margin-top:28px;font-size:1.6rem;color:#1a1a2e">Terms of Service</h2>
    <span class="badge">Last updated: ${LAST_UPDATED}</span>

    <div class="card">
      <h2>1. Purpose</h2>
      <p>${APP_NAME} is provided exclusively for use by authorised security personnel of the Supreme Court of Nigeria. Use of this system implies acceptance of these terms.</p>
    </div>

    <div class="card">
      <h2>2. Authorised Use</h2>
      <ul>
        <li>Only registered operatives whose WhatsApp numbers have been approved by a supervisor may use the system.</li>
        <li>Each check-in must reflect an accurate, real-time report from the operative's actual duty post.</li>
        <li>Submitting false location, fabricated photos, or incorrect information constitutes a serious disciplinary offence.</li>
      </ul>
    </div>

    <div class="card">
      <h2>3. Photo Requirements</h2>
      <ul>
        <li>Operatives must submit a live photo taken at the time of check-in.</li>
        <li>Uploading pre-taken, gallery, or forwarded photos is prohibited.</li>
        <li>Group photos must include all operatives present at the post.</li>
      </ul>
    </div>

    <div class="card">
      <h2>4. System Availability</h2>
      <p>The system is provided on a best-effort basis. The Supreme Court of Nigeria makes no guarantee of uninterrupted availability. Planned maintenance will be communicated in advance where possible.</p>
    </div>

    <div class="card">
      <h2>5. Disciplinary Action</h2>
      <p>Misuse of the system, including but not limited to submitting false check-ins, sharing access credentials, or tampering with data, may result in disciplinary action in accordance with the Supreme Court's personnel regulations.</p>
    </div>

    <div class="card">
      <h2>6. Changes to Terms</h2>
      <p>These terms may be updated at any time. Continued use of the system constitutes acceptance of the updated terms.</p>
    </div>

    <div class="card">
      <h2>7. Contact</h2>
      <p>For questions about these terms: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
    </div>
  `));
});

// ── GET /delete-data ──────────────────────────────────────────────────────────
router.get('/delete-data', (req, res) => {
  res.send(page('Data Deletion', `
    <h2 style="border:none;padding:0;margin-top:28px;font-size:1.6rem;color:#1a1a2e">Data Deletion Instructions</h2>
    <span class="badge">Last updated: ${LAST_UPDATED}</span>

    <div class="card">
      <h2>How to Request Data Deletion</h2>
      <p>If you are a registered security operative and wish to have your personal data removed from the Guards OP system, follow these steps:</p>
      <ul>
        <li>Send an email to <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> with the subject line: <strong>"Data Deletion Request"</strong></li>
        <li>Include your full name and the WhatsApp phone number registered to the system.</li>
        <li>Your request will be processed within <strong>14 working days</strong>.</li>
      </ul>
    </div>

    <div class="card">
      <h2>What Gets Deleted</h2>
      <ul>
        <li>Your phone number from the whitelist database.</li>
        <li>All check-in records associated with your phone number.</li>
        <li>Any photos linked to your check-ins on Cloudinary.</li>
        <li>Your entries from the Google Sheets attendance log.</li>
      </ul>
    </div>

    <div class="card">
      <h2>Retention Exceptions</h2>
      <p>Certain records may be retained where required by Nigerian law, court orders, or internal audit obligations. In such cases, you will be notified of the specific retention period.</p>
    </div>

    <div class="card">
      <h2>Contact</h2>
      <p>Data deletion requests: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
    </div>
  `));
});

module.exports = router;
