const { google } = require('googleapis');
const { Readable } = require('stream');

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/drive.file',
    ],
  });
}

// ── Upload image buffer to Google Drive, return a public view link ────────────
async function uploadToDrive(buffer, filename) {
  const auth  = getAuth();
  const drive = google.drive({ version: 'v3', auth });

  // Convert buffer to readable stream
  const stream = Readable.from(buffer);

  // Upload the file
  const uploaded = await drive.files.create({
    requestBody: {
      name:    filename,
      parents: process.env.DRIVE_FOLDER_ID
        ? [process.env.DRIVE_FOLDER_ID]
        : undefined,
    },
    media: {
      mimeType: 'image/jpeg',
      body:     stream,
    },
    fields: 'id',
  });

  const fileId = uploaded.data.id;

  // Make it publicly readable so the link works in Google Sheets
  await drive.permissions.create({
    fileId,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  return `https://drive.google.com/file/d/${fileId}/view`;
}

module.exports = { uploadToDrive };
