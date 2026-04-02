console.log("🚀 Server starting...");
const express = require('express');
const cors    = require('cors');
const { v4: uuidv4 } = require('uuid');
const path    = require('path');
const { initDB } = require('./database');

const app = express();

let db;
try {
  db = initDB();
} catch (err) {
  console.error('❌ Database init failed:', err.message);
  process.exit(1);
}

// ── ENV CONFIG ───────────────────────────────────────────────────────────────
const PORT        = process.env.PORT        || 3001;
const ADMIN_USER  = process.env.ADMIN_USER  || 'admin@example.com';
const ADMIN_PASS  = process.env.ADMIN_PASS  || 'admin123';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'super_secret_token';

// ── MIDDLEWARE ───────────────────────────────────────────────────────────────
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

// ── ADMIN AUTH ───────────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.headers['x-admin-token'] !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized. Admin access required.' });
  }
  next();
}

// ── HELPERS ──────────────────────────────────────────────────────────────────
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
    tags:     JSON.parse(row.tags     || '[]'),
    colors:   JSON.parse(row.colors   || '[]'),
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

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    log('admin_login', 'Admin logged in');
    return res.json({ token: ADMIN_TOKEN, message: 'Login successful' });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
});

app.get('/api/cars', (req, res) => {
  const cars = db.prepare('SELECT * FROM cars ORDER BY brand, model').all();
  res.json(cars.map(parseCar));
});

app.get('/api/cars/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM cars WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Car not found' });
  res.json(parseCar(row));
});

app.post('/api/bookings', (req, res) => {
  const { customerName, customerEmail, customerPhone, carId, rentalDays } = req.body;
  if (!customerName || !carId || !rentalDays) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(carId);
  if (!car)              return res.status(404).json({ error: 'Car not found' });
  if (!car.is_available) return res.status(409).json({ error: 'Car not available' });

  let customerId;
  if (customerEmail) {
    const existing = db.prepare('SELECT id FROM customers WHERE email = ?').get(customerEmail);
    if (existing) customerId = existing.id;
  }
  if (!customerId) {
    customerId = 'CUS' + Date.now();
    db.prepare('INSERT OR IGNORE INTO customers (id,name,email,phone) VALUES (?,?,?,?)')
      .run(customerId, customerName, customerEmail || null, customerPhone || null);
  }

  const bookingId = 'BK' + uuidv4().slice(0, 6).toUpperCase();
  const total     = car.price_per_day * rentalDays;

  db.prepare(`INSERT INTO bookings (id,car_id,customer_id,rental_days,price_per_day,total_price,status)
    VALUES (?,?,?,?,?,?,?)`)
    .run(bookingId, carId, customerId, rentalDays, car.price_per_day, total, 'active');

  db.prepare('UPDATE cars SET is_available = 0 WHERE id = ?').run(carId);
  log('booking_created', `Booking ${bookingId} created for ${customerName}`);
  res.status(201).json({ bookingId, total });
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ════════════════════════════════════════════════════════════════════════════

// Cars list
app.get('/api/admin/cars', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM cars').all().map(parseCar));
});

// Add / replace car
app.post('/api/admin/cars', requireAdmin, (req, res) => {
  const r  = req.body;
  const id = r.id || ('C' + Date.now());
  db.prepare(`
    INSERT OR REPLACE INTO cars
      (id,brand,model,year,category,price_per_day,seats,fuel,transmission,
       engine,power,torque,top_speed,acceleration,mileage,luggage,tagline,
       tags,colors,features,bg_gradient,accent_color,svg_color,is_available)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, r.brand, r.model, r.year, r.category, r.pricePerDay, r.seats,
    r.fuel, r.transmission, r.engine, r.power, r.torque, r.topSpeed,
    r.acceleration, r.mileage, r.luggage, r.tagline,
    JSON.stringify(r.tags||[]), JSON.stringify(r.colors||[]),
    JSON.stringify(r.features||[]),
    r.bgGradient, r.accentColor, r.svgColor,
    r.isAvailable !== false ? 1 : 0
  );
  log('car_updated', `Car ${id} added/updated`);
  res.json({ success: true, id });
});

// Toggle car availability
app.patch('/api/admin/cars/:id', requireAdmin, (req, res) => {
  const { is_available } = req.body;
  db.prepare('UPDATE cars SET is_available=? WHERE id=?').run(is_available ? 1 : 0, req.params.id);
  log('car_updated', `Car ${req.params.id} availability → ${is_available}`);
  res.json({ success: true });
});

// ── Dashboard stats (was missing — caused blank admin portal) ────────────────
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const totalCars      = db.prepare('SELECT COUNT(*) as c FROM cars').get().c;
  const availableCars  = db.prepare('SELECT COUNT(*) as c FROM cars WHERE is_available=1').get().c;
  const activeBookings = db.prepare("SELECT COUNT(*) as c FROM bookings WHERE status='active'").get().c;
  const totalCustomers = db.prepare('SELECT COUNT(*) as c FROM customers').get().c;
  const totalRevenue   = db.prepare("SELECT COALESCE(SUM(total_price),0) as r FROM bookings WHERE status='returned'").get().r;
  const pendingRevenue = db.prepare("SELECT COALESCE(SUM(total_price),0) as r FROM bookings WHERE status='active'").get().r;

  const recentBookings = db.prepare(`
    SELECT b.id, b.rental_days, b.total_price, b.status, b.rented_at,
           c.name  AS customer_name,
           ca.brand, ca.model
    FROM bookings b
    JOIN customers c  ON b.customer_id = c.id
    JOIN cars ca      ON b.car_id      = ca.id
    ORDER BY b.rented_at DESC LIMIT 5
  `).all();

  const topCars = db.prepare(`
    SELECT ca.brand, ca.model,
           COUNT(b.id)                    AS bookings,
           COALESCE(SUM(b.total_price),0) AS revenue
    FROM bookings b
    JOIN cars ca ON b.car_id = ca.id
    GROUP BY b.car_id
    ORDER BY bookings DESC LIMIT 5
  `).all();

  const revenueByMonth = db.prepare(`
    SELECT strftime('%b %Y', rented_at)   AS month,
           COALESCE(SUM(total_price), 0)  AS revenue,
           COUNT(*)                        AS count
    FROM bookings
    WHERE status = 'returned'
    GROUP BY strftime('%Y-%m', rented_at)
    ORDER BY strftime('%Y-%m', rented_at) DESC
    LIMIT 6
  `).all();

  res.json({
    totalCars, availableCars, activeBookings, totalCustomers,
    totalRevenue, pendingRevenue,
    recentBookings, topCars, revenueByMonth
  });
});

// ── Activity log (was missing) ───────────────────────────────────────────────
app.get('/api/admin/activity', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 50').all();
  res.json(rows);
});

// ── All bookings ──────────────────────────────────────────────────────────────
app.get('/api/admin/bookings', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT b.*,
           c.name  AS customer_name,
           c.email AS customer_email,
           c.phone AS customer_phone,
           ca.brand, ca.model, ca.category
    FROM bookings b
    JOIN customers c  ON b.customer_id = c.id
    JOIN cars ca      ON b.car_id      = ca.id
    ORDER BY b.rented_at DESC
  `).all();
  res.json(rows);
});

// ── Update booking status ─────────────────────────────────────────────────────
app.patch('/api/admin/bookings/:id', requireAdmin, (req, res) => {
  const { status } = req.body;
  if (!['active','returned','cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const booking = db.prepare('SELECT * FROM bookings WHERE id=?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  let returnedAt = null;
  if (status === 'returned' || status === 'cancelled') {
    db.prepare('UPDATE cars SET is_available=1 WHERE id=?').run(booking.car_id);
    returnedAt = new Date().toISOString();
  }
  db.prepare('UPDATE bookings SET status=?, returned_at=? WHERE id=?')
    .run(status, returnedAt, req.params.id);
  log('booking_updated', `Booking ${req.params.id} → ${status}`);
  res.json({ success: true });
});

// ── All customers ─────────────────────────────────────────────────────────────
app.get('/api/admin/customers', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT c.*,
           COUNT(b.id)                    AS total_bookings,
           COALESCE(SUM(b.total_price),0) AS total_spent
    FROM customers c
    LEFT JOIN bookings b ON b.customer_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `).all();
  res.json(rows);
});

// ════════════════════════════════════════════════════════════════════════════
// STATIC / CATCH-ALL
// ════════════════════════════════════════════════════════════════════════════

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`🚗 DriveHaus running on port ${PORT}`);
});