const { google } = require('googleapis');

// ── Authenticate using service account JSON stored in env var ─────────────────
function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });
}

// ── Append a row to the Google Sheet ─────────────────────────────────────────
// Row format: [timestamp, name, phone, latitude, longitude, map_link, photo_url]
async function appendToSheet(row) {
  const auth   = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range:         'Attendance_Log!A:M',  // A-M = 13 columns         // adjust sheet name if yours is different
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });

  console.log('Row appended to sheet:', row);
}

module.exports = { appendToSheet };
