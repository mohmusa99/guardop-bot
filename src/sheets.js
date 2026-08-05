const { google } = require('googleapis');

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function appendToSheet(row) {
  const auth   = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId:    process.env.SPREADSHEET_ID,
    range:            'Log_Sheet!A:N',  // A-N = 14 columns
    valueInputOption: 'USER_ENTERED',
    requestBody:      { values: [row] },
  });

  console.log('Row appended to sheet:', row);
}

module.exports = { appendToSheet };
