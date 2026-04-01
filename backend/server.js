const express = require('express');
const cors    = require('cors');
const { v4: uuidv4 } = require('uuid');
const path    = require('path');
const { initDB } = require('./database');

const app = express();
const db  = initDB();

// ── ENV CONFIG ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
const ADMIN_USER  = process.env.ADMIN_USER  || 'admin@example.com';
const ADMIN_PASS  = process.env.ADMIN_PASS  || 'admin123';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'super_secret_token';

// ── MIDDLEWARE ──────────────────────────────────────────────────────────────
app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://drive-haus.vercel.app"
  ],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "x-admin-token"],
  credentials: true
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// ── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'DriveHaus backend running 🚗' });
});

// ── ADMIN AUTH ──────────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const auth = req.headers['x-admin-token'];
  if (auth !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized. Admin access required.' });
  }
  next();
}

// ── HELPERS ─────────────────────────────────────────────────────────────────
function parseCar(row) {
  if (!row) return null;
  return {
    ...row,
    isAvailable: row.is_available === 1,
    pricePerDay: row.price_per_day,
    topSpeed:    row.top_speed,
    bgGradient:  row.bg_gradient,
    accentColor: row.accent_color,
    svgColor:    row.svg_color,
    createdAt:   row.created_at,
    tags:     JSON.parse(row.tags   || '[]'),
    colors:   JSON.parse(row.colors || '[]'),
    features: JSON.parse(row.features || '[]'),
  };
}

function log(type, message, meta = null) {
  db.prepare('INSERT INTO activity_log (type,message,meta) VALUES (?,?,?)')
    .run(type, message, meta ? JSON.stringify(meta) : null);
}

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES
// ════════════════════════════════════════════════════════════════════════════

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    log('admin_login', `Admin logged in`);
    return res.json({ token: ADMIN_TOKEN, message: 'Login successful' });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
});

// GET cars
app.get('/api/cars', (req, res) => {
  const cars = db.prepare('SELECT * FROM cars ORDER BY brand, model').all();
  res.json(cars.map(parseCar));
});

// GET single car
app.get('/api/cars/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM cars WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Car not found' });
  res.json(parseCar(row));
});

// CREATE booking
app.post('/api/bookings', (req, res) => {
  const { customerName, customerEmail, customerPhone, carId, rentalDays } = req.body;

  if (!customerName || !carId || !rentalDays) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(carId);
  if (!car) return res.status(404).json({ error: 'Car not found' });
  if (!car.is_available) return res.status(409).json({ error: 'Car not available' });

  const customerId = 'CUS' + Date.now();
  db.prepare('INSERT INTO customers (id,name,email,phone) VALUES (?,?,?,?)')
    .run(customerId, customerName, customerEmail || null, customerPhone || null);

  const bookingId = 'BK' + uuidv4().slice(0, 6).toUpperCase();
  const total = car.price_per_day * rentalDays;

  db.prepare(`INSERT INTO bookings (id,car_id,customer_id,rental_days,price_per_day,total_price,status)
    VALUES (?,?,?,?,?,?,?)`)
    .run(bookingId, carId, customerId, rentalDays, car.price_per_day, total, 'active');

  db.prepare('UPDATE cars SET is_available = 0 WHERE id = ?').run(carId);

  log('booking_created', `Booking ${bookingId} created`);

  res.status(201).json({ bookingId, total });
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ════════════════════════════════════════════════════════════════════════════

// Example admin route
app.get('/api/admin/cars', requireAdmin, (req, res) => {
  const cars = db.prepare('SELECT * FROM cars').all();
  res.json(cars.map(parseCar));
});

// ════════════════════════════════════════════════════════════════════════════
// STATIC ROUTES
// ════════════════════════════════════════════════════════════════════════════

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── START SERVER ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚗 DriveHaus running on port ${PORT}`);
});