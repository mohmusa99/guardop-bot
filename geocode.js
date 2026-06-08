const axios = require('axios');

// ── Convert lat/lng to a human-readable address ───────────────────────────────
// Uses OpenStreetMap Nominatim — completely free, no API key required
async function reverseGeocode(latitude, longitude) {
  try {
    const res = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: {
        lat:    latitude,
        lon:    longitude,
        format: 'json',
      },
      headers: {
        // Nominatim requires a User-Agent
        'User-Agent': 'SecurityCheckInBot/1.0',
      },
      timeout: 5000,
    });

    const addr = res.data?.address;
    if (!addr) return `${latitude}, ${longitude}`;

    // Build a clean readable address
    const parts = [
      addr.road || addr.pedestrian || addr.footway,
      addr.suburb || addr.neighbourhood || addr.quarter,
      addr.city || addr.town || addr.village || addr.county,
      addr.state,
      addr.country,
    ].filter(Boolean);

    return parts.join(', ') || res.data.display_name || `${latitude}, ${longitude}`;

  } catch (err) {
    console.error('Geocode error:', err.message);
    // Fall back to coordinates if geocoding fails
    return `${latitude}, ${longitude}`;
  }
}

module.exports = { reverseGeocode };
