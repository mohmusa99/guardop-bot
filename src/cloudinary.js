const axios      = require('axios');
const FormData   = require('form-data');

// ── Upload image buffer to Cloudinary, return permanent URL ───────────────────
async function uploadToCloudinary(buffer, filename) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey    = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  // Generate SHA-1 signature
  const crypto    = require('crypto');
  const timestamp = Math.floor(Date.now() / 1000);
  const folder    = 'security-checkins';
  const str       = `folder=${folder}&public_id=${filename}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha1').update(str).digest('hex');

  const form = new FormData();
  form.append('file',       buffer,    { filename: `${filename}.jpg`, contentType: 'image/jpeg' });
  form.append('api_key',    apiKey);
  form.append('timestamp',  String(timestamp));
  form.append('signature',  signature);
  form.append('folder',     folder);
  form.append('public_id',  filename);

  const res = await axios.post(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    form,
    { headers: form.getHeaders() }
  );

  return res.data.secure_url; // permanent HTTPS URL
}

module.exports = { uploadToCloudinary };
