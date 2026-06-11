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
      checkin_id    TEXT NOT NULL,         -- shared across operatives at same location
      timestamp     TIMESTAMPTZ NOT NULL,
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

module.exports = { initDb, insertCheckin };
