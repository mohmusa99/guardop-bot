const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDb() {
  // Migrate timestamp column if needed
  await pool.query(`
    ALTER TABLE checkins ALTER COLUMN timestamp TYPE TEXT USING timestamp::TEXT
  `).catch(() => {});

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
      armed_police  INTEGER DEFAULT 0,
      incident      TEXT,
      address       TEXT,
      latitude      DOUBLE PRECISION,
      longitude     DOUBLE PRECISION,
      map_link      TEXT,
      image_url     TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Add armed_police column if it doesn't exist yet
  await pool.query(`
    ALTER TABLE checkins ADD COLUMN IF NOT EXISTS armed_police INTEGER DEFAULT 0
  `).catch(() => {});

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

async function insertCheckin(data) {
  await pool.query(`
    INSERT INTO checkins
      (checkin_id, timestamp, name, guard_id, phone, house, shift, status,
       armed_police, incident, address, latitude, longitude, map_link, image_url)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
  `, [
    data.checkinId, data.timestamp, data.name, data.guardId, data.phone,
    data.house, data.shift, data.status, data.armedPolice, data.incident,
    data.address, data.latitude, data.longitude, data.mapLink, data.imageUrl,
  ]);
}

async function isWhitelisted(phone) {
  const res = await pool.query(`SELECT 1 FROM whitelist WHERE phone = $1`, [phone]);
  return res.rows.length > 0;
}

async function addToWhitelist(phone, name = null) {
  await pool.query(
    `INSERT INTO whitelist (phone, name) VALUES ($1, $2) ON CONFLICT (phone) DO NOTHING`,
    [phone, name]
  );
}

async function removeFromWhitelist(phone) {
  await pool.query(`DELETE FROM whitelist WHERE phone = $1`, [phone]);
}

async function listWhitelist() {
  const res = await pool.query(`SELECT phone, name FROM whitelist ORDER BY added_at`);
  return res.rows;
}

module.exports = { initDb, insertCheckin, isWhitelisted, addToWhitelist, removeFromWhitelist, listWhitelist };
