const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ── Create tables if they don't exist ─────────────────────────────────────────
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS checkins (
      id            SERIAL PRIMARY KEY,
      checkin_id    TEXT NOT NULL,
      timestamp     TEXT NOT NULL,
      name          TEXT NOT NULL,
      guard_id      TEXT NOT NULL,
      phone         TEXT NOT NULL,
      house         TEXT NOT NULL,
      shift         TEXT NOT NULL,
      status        TEXT NOT NULL,
      incident      TEXT,
      address       TEXT,
      latitude      DOUBLE PRECISION,
      longitude     DOUBLE PRECISION,
      map_link      TEXT,
      image_url     TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS whitelist (
      id            SERIAL PRIMARY KEY,
      phone         TEXT UNIQUE NOT NULL,
      name          TEXT,
      added_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log('Database ready');
}

// ── Insert a single operative check-in row ────────────────────────────────────
async function insertCheckin(data) {
  await pool.query(`
    INSERT INTO checkins
      (checkin_id, timestamp, name, guard_id, phone, house, shift, status,
       incident, address, latitude, longitude, map_link, image_url)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
  `, [
    data.checkinId, data.timestamp, data.name, data.guardId, data.phone,
    data.house, data.shift, data.status, data.incident, data.address,
    data.latitude, data.longitude, data.mapLink, data.imageUrl,
  ]);
}

// ── Check if a phone number is whitelisted ────────────────────────────────────
async function isWhitelisted(phone) {
  const res = await pool.query(
    `SELECT 1 FROM whitelist WHERE phone = $1`,
    [phone]
  );
  return res.rows.length > 0;
}

// ── Add a phone number to the whitelist ───────────────────────────────────────
async function addToWhitelist(phone, name = null) {
  await pool.query(
    `INSERT INTO whitelist (phone, name) VALUES ($1, $2)
     ON CONFLICT (phone) DO NOTHING`,
    [phone, name]
  );
}

// ── Remove a phone number from the whitelist ──────────────────────────────────
async function removeFromWhitelist(phone) {
  await pool.query(`DELETE FROM whitelist WHERE phone = $1`, [phone]);
}

// ── List all whitelisted numbers ──────────────────────────────────────────────
async function listWhitelist() {
  const res = await pool.query(`SELECT phone, name FROM whitelist ORDER BY added_at`);
  return res.rows;
}

module.exports = {
  initDb,
  insertCheckin,
  isWhitelisted,
  addToWhitelist,
  removeFromWhitelist,
  listWhitelist,
};
