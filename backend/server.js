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

const PORT        = process.env.PORT        || 3001;
const ADMIN_USER  = process.env.ADMIN_USER  || 'admin@example.com';
const ADMIN_PASS  = process.env.ADMIN_PASS  || 'admin123';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'super_secret_token';

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

// ── HELPERS ──────────────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.headers['x-admin-token'] !== ADMIN_TOKEN)
    return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function parseCar(row) {
  if (!row) return null;
  return {
    ...row,
    isAvailable:  row.is_available === 1,
    pricePerDay:  row.price_per_day,
    topSpeed:     row.top_speed,
    bgGradient:   row.bg_gradient,
    accentColor:  row.accent_color,
    svgColor:     row.svg_color,
    createdAt:    row.created_at,
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

app.get('/health', (req, res) => res.json({ status: 'OK' }));

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    log('admin_login', 'Admin logged in');
    return res.json({ token: ADMIN_TOKEN });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

// Public cars
app.get('/api/cars', (req, res) => {
  res.json(db.prepare('SELECT * FROM cars ORDER BY brand,model').all().map(parseCar));
});
app.get('/api/cars/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM cars WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Car not found' });
  res.json(parseCar(row));
});

// Public create booking
app.post('/api/bookings', (req, res) => {
  const { customerName, customerEmail, customerPhone, carId, rentalDays } = req.body;
  if (!customerName || !carId || !rentalDays)
    return res.status(400).json({ error: 'Missing required fields' });

  const car = db.prepare('SELECT * FROM cars WHERE id=?').get(carId);
  if (!car)              return res.status(404).json({ error: 'Car not found' });
  if (!car.is_available) return res.status(409).json({ error: 'Car not available' });

  let customerId;
  if (customerEmail) {
    const ex = db.prepare('SELECT id FROM customers WHERE email=?').get(customerEmail);
    if (ex) customerId = ex.id;
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
  db.prepare('UPDATE cars SET is_available=0 WHERE id=?').run(carId);
  log('booking_created', `Booking ${bookingId} created for ${customerName}`);
  res.status(201).json({ bookingId, total });
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN — CARS
// called by fleet.html as GET/POST/PUT/DELETE('/cars') via shared.js API prefix
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/cars', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM cars ORDER BY brand,model').all().map(parseCar));
});

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
    JSON.stringify(r.tags || []), JSON.stringify(r.colors || []),
    JSON.stringify(r.features || []),
    r.bgGradient || '', r.accentColor || '#c9a84c', r.svgColor || '#aaa',
    r.isAvailable !== false ? 1 : 0
  );
  log('car_added', `Car ${id} added/updated`);
  res.json({ success: true, id });
});

// PUT /api/admin/cars/:id  (fleet.html edit)
app.put('/api/admin/cars/:id', requireAdmin, (req, res) => {
  const r  = req.body;
  const id = req.params.id;
  db.prepare(`
    UPDATE cars SET
      brand=?,model=?,year=?,category=?,price_per_day=?,seats=?,fuel=?,
      transmission=?,engine=?,power=?,torque=?,top_speed=?,acceleration=?,
      mileage=?,luggage=?,tagline=?
    WHERE id=?
  `).run(
    r.brand, r.model, r.year, r.category, r.pricePerDay, r.seats,
    r.fuel, r.transmission, r.engine, r.power, r.torque, r.topSpeed,
    r.acceleration, r.mileage, r.luggage, r.tagline, id
  );
  log('car_updated', `Car ${id} edited`);
  res.json({ success: true });
});

// PATCH /api/admin/cars/:id  (toggle availability)
app.patch('/api/admin/cars/:id', requireAdmin, (req, res) => {
  const { is_available } = req.body;
  db.prepare('UPDATE cars SET is_available=? WHERE id=?')
    .run(is_available ? 1 : 0, req.params.id);
  log('car_updated', `Car ${req.params.id} availability → ${is_available}`);
  res.json({ success: true });
});

// DELETE /api/admin/cars/:id  (fleet.html delete)
app.delete('/api/admin/cars/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM cars WHERE id=?').run(req.params.id);
  log('car_deleted', `Car ${req.params.id} deleted`);
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN — BOOKINGS
// bookings.html calls: GET /bookings, GET /bookings/:id,
//   PATCH /bookings/:id/return, PATCH /bookings/:id/cancel
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/bookings', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT b.*,
           c.name  AS customer_name, c.email AS customer_email, c.phone AS customer_phone,
           ca.brand, ca.model, ca.category, ca.year, ca.engine, ca.fuel, ca.transmission
    FROM bookings b
    JOIN customers c  ON b.customer_id = c.id
    JOIN cars ca      ON b.car_id      = ca.id
    ORDER BY b.rented_at DESC
  `).all();
  res.json(rows);
});

app.get('/api/admin/bookings/:id', requireAdmin, (req, res) => {
  const row = db.prepare(`
    SELECT b.*,
           c.name  AS customer_name, c.email AS customer_email, c.phone AS customer_phone,
           ca.brand, ca.model, ca.year, ca.engine, ca.fuel, ca.transmission
    FROM bookings b
    JOIN customers c  ON b.customer_id = c.id
    JOIN cars ca      ON b.car_id      = ca.id
    WHERE b.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Booking not found' });
  res.json(row);
});

// PATCH /return  — bookings.html: PATCH('/bookings/' + id + '/return')
app.patch('/api/admin/bookings/:id/return', requireAdmin, (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id=?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  db.prepare("UPDATE bookings SET status='returned', returned_at=? WHERE id=?")
    .run(new Date().toISOString(), req.params.id);
  db.prepare('UPDATE cars SET is_available=1 WHERE id=?').run(booking.car_id);
  log('booking_returned', `Booking ${req.params.id} marked returned`);
  res.json({ success: true, message: 'Car returned and marked available' });
});

// PATCH /cancel  — bookings.html: PATCH('/bookings/' + id + '/cancel')
app.patch('/api/admin/bookings/:id/cancel', requireAdmin, (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id=?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  db.prepare("UPDATE bookings SET status='cancelled', returned_at=? WHERE id=?")
    .run(new Date().toISOString(), req.params.id);
  db.prepare('UPDATE cars SET is_available=1 WHERE id=?').run(booking.car_id);
  log('booking_cancelled', `Booking ${req.params.id} cancelled`);
  res.json({ success: true, message: 'Booking cancelled' });
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN — CUSTOMERS
// customers.html calls: GET /customers, GET /customers/:id,
//   POST /customers, PUT /customers/:id, DELETE /customers/:id
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/customers', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT c.*,
           COUNT(b.id)                    AS total_bookings,
           COALESCE(SUM(b.total_price),0) AS total_spent,
           SUM(CASE WHEN b.status='active' THEN 1 ELSE 0 END) AS active_bookings
    FROM customers c
    LEFT JOIN bookings b ON b.customer_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `).all();
  res.json(rows);
});

app.get('/api/admin/customers/:id', requireAdmin, (req, res) => {
  const c = db.prepare('SELECT * FROM customers WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Customer not found' });
  const bookings = db.prepare(`
    SELECT b.*, ca.brand, ca.model
    FROM bookings b JOIN cars ca ON b.car_id=ca.id
    WHERE b.customer_id=? ORDER BY b.rented_at DESC
  `).all(req.params.id);
  res.json({ ...c, bookings });
});

app.post('/api/admin/customers', requireAdmin, (req, res) => {
  const { name, email, phone, address } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = 'CUS' + Date.now();
  db.prepare('INSERT INTO customers (id,name,email,phone,address) VALUES (?,?,?,?,?)')
    .run(id, name, email || null, phone || null, address || null);
  log('customer_added', `Customer ${name} added`);
  res.status(201).json({ success: true, id });
});

app.put('/api/admin/customers/:id', requireAdmin, (req, res) => {
  const { name, email, phone, address } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  db.prepare('UPDATE customers SET name=?,email=?,phone=?,address=? WHERE id=?')
    .run(name, email || null, phone || null, address || null, req.params.id);
  log('customer_updated', `Customer ${req.params.id} updated`);
  res.json({ success: true });
});

app.delete('/api/admin/customers/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM customers WHERE id=?').run(req.params.id);
  log('customer_deleted', `Customer ${req.params.id} deleted`);
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN — DASHBOARD STATS + ACTIVITY
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const totalCars      = db.prepare('SELECT COUNT(*) as c FROM cars').get().c;
  const availableCars  = db.prepare("SELECT COUNT(*) as c FROM cars WHERE is_available=1").get().c;
  const activeBookings = db.prepare("SELECT COUNT(*) as c FROM bookings WHERE status='active'").get().c;
  const totalCustomers = db.prepare('SELECT COUNT(*) as c FROM customers').get().c;
  const totalRevenue   = db.prepare("SELECT COALESCE(SUM(total_price),0) as r FROM bookings WHERE status='returned'").get().r;
  const pendingRevenue = db.prepare("SELECT COALESCE(SUM(total_price),0) as r FROM bookings WHERE status='active'").get().r;

  const recentBookings = db.prepare(`
    SELECT b.id,b.rental_days,b.total_price,b.status,b.rented_at,
           c.name AS customer_name, ca.brand, ca.model
    FROM bookings b
    JOIN customers c ON b.customer_id=c.id
    JOIN cars ca     ON b.car_id=ca.id
    ORDER BY b.rented_at DESC LIMIT 5
  `).all();

  const topCars = db.prepare(`
    SELECT ca.brand,ca.model,
           COUNT(b.id) AS bookings,
           COALESCE(SUM(b.total_price),0) AS revenue
    FROM bookings b JOIN cars ca ON b.car_id=ca.id
    GROUP BY b.car_id ORDER BY bookings DESC LIMIT 5
  `).all();

  const revenueByMonth = db.prepare(`
    SELECT strftime('%b %Y',rented_at) AS month,
           COALESCE(SUM(total_price),0) AS revenue,
           COUNT(*) AS count
    FROM bookings WHERE status='returned'
    GROUP BY strftime('%Y-%m',rented_at)
    ORDER BY strftime('%Y-%m',rented_at) DESC LIMIT 6
  `).all();

  res.json({ totalCars, availableCars, activeBookings, totalCustomers,
    totalRevenue, pendingRevenue, recentBookings, topCars, revenueByMonth });
});

app.get('/api/admin/activity', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 50').all());
});

// ════════════════════════════════════════════════════════════════════════════
// STATIC CATCH-ALL
// ════════════════════════════════════════════════════════════════════════════

app.get('/admin', (req, res) =>
  res.sendFile(path.join(__dirname, '../frontend/admin.html')));

app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, '../frontend/index.html')));

app.listen(PORT, () => console.log(`🚗 DriveHaus running on port ${PORT}`));