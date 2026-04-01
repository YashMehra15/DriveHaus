const Database = require('better-sqlite3');
const path = require('path');

// ── FIX 1: Use /tmp on Render (ephemeral but always writable).
// On local dev, fall back to the project folder.
const DB_PATH = process.env.NODE_ENV === 'production'
  ? '/tmp/drivehaus.db'
  : path.join(__dirname, 'drivehaus.db');

function initDB() {
  // ── FIX 2: Wrap in try/catch so startup crashes give a useful message.
  let db;
  try {
    db = new Database(DB_PATH);
  } catch (err) {
    console.error('❌ Failed to open database at', DB_PATH, err.message);
    process.exit(1);
  }

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // ── Schema ────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cars (
      id          TEXT PRIMARY KEY,
      brand       TEXT NOT NULL,
      model       TEXT NOT NULL,
      year        INTEGER NOT NULL,
      category    TEXT NOT NULL,
      price_per_day REAL NOT NULL,
      seats       INTEGER NOT NULL,
      fuel        TEXT NOT NULL,
      transmission TEXT NOT NULL,
      engine      TEXT NOT NULL,
      power       TEXT NOT NULL,
      torque      TEXT NOT NULL,
      top_speed   TEXT NOT NULL,
      acceleration TEXT NOT NULL,
      mileage     TEXT NOT NULL,
      luggage     TEXT NOT NULL,
      tagline     TEXT NOT NULL,
      tags        TEXT NOT NULL DEFAULT '[]',
      colors      TEXT NOT NULL DEFAULT '[]',
      features    TEXT NOT NULL DEFAULT '[]',
      bg_gradient TEXT NOT NULL,
      accent_color TEXT NOT NULL,
      svg_color   TEXT NOT NULL,
      is_available INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customers (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      email       TEXT UNIQUE,
      phone       TEXT,
      address     TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id            TEXT PRIMARY KEY,
      car_id        TEXT NOT NULL,
      customer_id   TEXT NOT NULL,
      rental_days   INTEGER NOT NULL,
      price_per_day REAL NOT NULL,
      total_price   REAL NOT NULL,
      status        TEXT NOT NULL DEFAULT 'active',
      notes         TEXT,
      rented_at     TEXT NOT NULL DEFAULT (datetime('now')),
      returned_at   TEXT,
      FOREIGN KEY (car_id) REFERENCES cars(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      type        TEXT NOT NULL,
      message     TEXT NOT NULL,
      meta        TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ── Seed cars if empty ────────────────────────────────────────────────────
  const count = db.prepare('SELECT COUNT(*) as c FROM cars').get();
  if (count.c === 0) {
    const insert = db.prepare(`
      INSERT INTO cars (id,brand,model,year,category,price_per_day,seats,fuel,transmission,
        engine,power,torque,top_speed,acceleration,mileage,luggage,tagline,tags,colors,features,
        bg_gradient,accent_color,svg_color)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    const seed = [
      ['C001','Toyota','Camry',2023,'sedan',60,5,'Petrol','Automatic','2.5L 4-Cyl','203 hp','250 Nm','210 km/h','8.1s (0-100)','15 km/L','428 L',
        'The benchmark of reliability and comfort.',
        '["Best Seller","Family Friendly"]',
        '[{"name":"Pearl White","hex":"#f5f5f0"},{"name":"Midnight Black","hex":"#1a1a1a"},{"name":"Ruby Red","hex":"#8B1A1A"},{"name":"Silver","hex":"#A8A9AD"}]',
        '["Adaptive Cruise Control","Apple CarPlay / Android Auto","Wireless Charging","8\\" Touchscreen","Blind Spot Monitor","Lane Departure Warning","Rear Camera","Dual-Zone Climate"]',
        'linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)','#4c8ac9','#b0c4e0'],
      ['C002','Honda','Accord',2023,'sedan',70,5,'Petrol','Automatic','1.5L Turbo','192 hp','260 Nm','215 km/h','7.8s (0-100)','14 km/L','473 L',
        'Executive refinement meets spirited driving.',
        '["Executive","Top Rated"]',
        '[{"name":"Sonic Grey","hex":"#6b7280"},{"name":"Platinum White","hex":"#e5e7eb"},{"name":"Crystal Black","hex":"#111827"},{"name":"Aegean Blue","hex":"#1e3a5f"}]',
        '["Honda Sensing Suite","10.2\\" Infotainment","Wireless CarPlay","Heated Front Seats","Ventilated Seats","Power Moonroof","Bose Premium Audio","Remote Start"]',
        'linear-gradient(135deg,#1c1c1c 0%,#2d2d2d 50%,#1a1a1a 100%)','#c9a84c','#c8d0d8'],
      ['C003','Mahindra','Thar',2023,'suv',150,4,'Diesel','Manual','2.2L mHawk Diesel','130 hp','320 Nm','155 km/h','12s (0-100)','11 km/L','250 L',
        'Built for the untamed. Ready for anywhere.',
        '["Off-Road","Adventure","SUV"]',
        '[{"name":"Rocky Beige","hex":"#c8a97e"},{"name":"Blazing Bronze","hex":"#8B6914"},{"name":"Napoli Black","hex":"#1a1a1a"},{"name":"Galaxy Grey","hex":"#6b7280"}]',
        '["4×4 with Low Range","Removable Roof","Waterproof Interior","Skid Plates","Electronic Locking Diff","Terrain Management","Adventure Mode","Tow Hook"]',
        'linear-gradient(135deg,#2d1b00 0%,#3d2600 50%,#1a0e00 100%)','#c9a84c','#c8a97e'],
      ['C004','BMW','X5',2024,'suv',200,5,'Diesel','Automatic','3.0L B57 TwinTurbo','340 hp','700 Nm','250 km/h','5.5s (0-100)','12 km/L','645 L',
        'The pinnacle of Bavarian engineering.',
        '["Luxury","Premium","SUV"]',
        '[{"name":"Alpine White","hex":"#f0f0eb"},{"name":"Sophisto Grey","hex":"#6d6d6d"},{"name":"Carbon Black","hex":"#1a1a1a"},{"name":"Phytonic Blue","hex":"#2c4a7c"}]',
        '["xDrive AWD","Panoramic Sky Lounge","Harman Kardon Audio","Massage Seats","Heads-Up Display","Active Steering","Air Suspension","Gesture Control"]',
        'linear-gradient(135deg,#0a0f1e 0%,#1a2540 50%,#0d1a35 100%)','#4c8ac9','#8aaccc'],
      ['C005','Tesla','Model 3',2024,'electric',180,5,'Electric','Automatic','Dual Motor AWD','358 hp','510 Nm','233 km/h','4.2s (0-100)','6.5 km/kWh','594 L',
        'The future of driving, available today.',
        '["Electric","Eco","Tech"]',
        '[{"name":"Pearl White","hex":"#f5f5f0"},{"name":"Midnight Silver","hex":"#6b7280"},{"name":"Deep Blue","hex":"#1e3a5f"},{"name":"Solid Black","hex":"#1a1a1a"}]',
        '["Autopilot","15.4\\" Glass Touchscreen","Over-the-Air Updates","360° Cameras","Sentry Mode","Dog Mode","Supercharger Access","Gaming & Netflix"]',
        'linear-gradient(135deg,#0d1117 0%,#1a1f2e 50%,#0d1117 100%)','#4caa78','#7ecba3'],
      ['C006','Ford','Mustang',2024,'sports',220,4,'Petrol','Manual','5.0L V8 Coyote','450 hp','529 Nm','270 km/h','4.6s (0-100)','8 km/L','382 L',
        'An American icon. Pure adrenaline on wheels.',
        '["Sports","Performance","Iconic"]',
        '[{"name":"Race Red","hex":"#c0392b"},{"name":"Oxford White","hex":"#f0f0eb"},{"name":"Grabber Blue","hex":"#1e6cb5"},{"name":"Shadow Black","hex":"#1a1a1a"}]',
        '["Track Apps","Launch Control","Line Lock","Active Exhaust","Brembo Brakes","MagneRide Suspension","Selectable Drive Modes","12\\" Digital Cluster"]',
        'linear-gradient(135deg,#1a0a0a 0%,#2d1010 50%,#1a0505 100%)','#c94c4c','#e07070'],
    ];

    const seedAll = db.transaction(() => {
      seed.forEach(row => insert.run(...row));
    });
    seedAll();

    db.prepare(`INSERT INTO activity_log (type,message) VALUES ('system','Database initialized and seeded with 6 cars')`).run();
    console.log('✅ Database seeded with 6 cars');
  }

  return db;
}

module.exports = { initDB, DB_PATH };