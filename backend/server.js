const express = require('express');
const cors    = require('cors');
const { v4: uuidv4 } = require('uuid');
const path    = require('path');
const { initDB } = require('./database');

const app = express();
const db  = initDB();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// ── Admin credentials (change these in production) ────────────────────────────
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'drivehaus2024';
const ADMIN_TOKEN = 'dh_admin_secret_token_2024'; // simple static token

// ── Admin Auth Middleware ─────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const auth = req.headers['x-admin-token'];
  if (auth !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized. Admin access required.' });
  }
  next();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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
// PUBLIC ROUTES (no auth required)
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

// GET all available cars (public — for booking page)
app.get('/api/cars', (req, res) => {
  let sql = 'SELECT * FROM cars';
  const params = [];
  const conditions = [];
  const { available, category, fuel } = req.query;
  if (available === 'true')  conditions.push('is_available = 1');
  if (available === 'false') conditions.push('is_available = 0');
  if (category) { conditions.push('category = ?'); params.push(category); }
  if (fuel)     { conditions.push('fuel = ?');     params.push(fuel); }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY brand, model';
  res.json(db.prepare(sql).all(...params).map(parseCar));
});

// GET single car (public)
app.get('/api/cars/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM cars WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Car not found' });
  res.json(parseCar(row));
});

// POST create a booking (public — customers book here)
app.post('/api/bookings', (req, res) => {
  const { customerName, customerEmail, customerPhone, carId, rentalDays, notes } = req.body;
  if (!customerName || !carId || !rentalDays) {
    return res.status(400).json({ error: 'customerName, carId, and rentalDays are required' });
  }

  const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(carId);
  if (!car)            return res.status(404).json({ error: 'Car not found' });
  if (!car.is_available) return res.status(409).json({ error: 'Car is not available for rent' });

  // Auto-create or look up customer by email
  let customer = customerEmail
    ? db.prepare('SELECT * FROM customers WHERE email = ?').get(customerEmail)
    : null;
  if (!customer) {
    const custId = 'CUS' + Date.now();
    db.prepare('INSERT INTO customers (id,name,email,phone) VALUES (?,?,?,?)')
      .run(custId, customerName, customerEmail||null, customerPhone||null);
    customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(custId);
    log('customer_added', `New customer registered: ${customerName}`, { id: custId });
  }

  const bookingId = 'BK' + uuidv4().split('-')[0].toUpperCase();
  const total = car.price_per_day * rentalDays;

  db.prepare(`INSERT INTO bookings (id,car_id,customer_id,rental_days,price_per_day,total_price,status,notes)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(bookingId, carId, customer.id, +rentalDays, car.price_per_day, total, 'active', notes||null);
  db.prepare('UPDATE cars SET is_available = 0 WHERE id = ?').run(carId);
  log('booking_created', `Booking ${bookingId}: ${customerName} rented ${car.brand} ${car.model} for ${rentalDays} days`, { bookingId, carId });

  const booking = db.prepare(`
    SELECT b.*, c.name as customer_name, cars.brand, cars.model
    FROM bookings b JOIN customers c ON c.id=b.customer_id JOIN cars ON cars.id=b.car_id
    WHERE b.id=?`).get(bookingId);
  res.status(201).json({ booking, customer, car: parseCar(car), totalPrice: total });
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN-ONLY ROUTES (require x-admin-token header)
// ════════════════════════════════════════════════════════════════════════════

// ── Cars (admin CRUD) ─────────────────────────────────────────────────────────
app.post('/api/admin/cars', requireAdmin, (req, res) => {
  const { brand, model, year, category, pricePerDay, seats, fuel, transmission,
          engine, power, torque, topSpeed, acceleration, mileage, luggage, tagline,
          tags, colors, features, bgGradient, accentColor, svgColor } = req.body;
  if (!brand || !model || !pricePerDay)
    return res.status(400).json({ error: 'brand, model and pricePerDay are required' });
  const id = 'C' + String(db.prepare('SELECT COUNT(*) as c FROM cars').get().c + 1).padStart(3, '0');
  db.prepare(`INSERT INTO cars (id,brand,model,year,category,price_per_day,seats,fuel,transmission,
    engine,power,torque,top_speed,acceleration,mileage,luggage,tagline,tags,colors,features,
    bg_gradient,accent_color,svg_color) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, brand, model, year||2024, category||'sedan', +pricePerDay, seats||5,
         fuel||'Petrol', transmission||'Automatic', engine||'N/A', power||'N/A',
         torque||'N/A', topSpeed||'N/A', acceleration||'N/A', mileage||'N/A',
         luggage||'N/A', tagline||'', JSON.stringify(tags||[]), JSON.stringify(colors||[]),
         JSON.stringify(features||[]),
         bgGradient||'linear-gradient(135deg,#1a1a2e,#0f3460)', accentColor||'#c9a84c', svgColor||'#aaa');
  const car = parseCar(db.prepare('SELECT * FROM cars WHERE id = ?').get(id));
  log('car_added', `Car added: ${brand} ${model}`, { id });
  res.status(201).json(car);
});

app.put('/api/admin/cars/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM cars WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Car not found' });
  const { brand, model, year, category, pricePerDay, seats, fuel, transmission,
          engine, power, torque, topSpeed, acceleration, mileage, luggage, tagline } = req.body;
  db.prepare(`UPDATE cars SET brand=?,model=?,year=?,category=?,price_per_day=?,seats=?,
    fuel=?,transmission=?,engine=?,power=?,torque=?,top_speed=?,acceleration=?,mileage=?,
    luggage=?,tagline=? WHERE id=?`).run(
    brand||row.brand, model||row.model, year||row.year, category||row.category,
    pricePerDay||row.price_per_day, seats||row.seats, fuel||row.fuel,
    transmission||row.transmission, engine||row.engine, power||row.power,
    torque||row.torque, topSpeed||row.top_speed, acceleration||row.acceleration,
    mileage||row.mileage, luggage||row.luggage, tagline||row.tagline, req.params.id
  );
  log('car_updated', `Car updated: ${brand||row.brand} ${model||row.model}`, { id: req.params.id });
  res.json(parseCar(db.prepare('SELECT * FROM cars WHERE id = ?').get(req.params.id)));
});

app.delete('/api/admin/cars/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM cars WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Car not found' });
  const active = db.prepare(`SELECT id FROM bookings WHERE car_id=? AND status='active'`).get(req.params.id);
  if (active) return res.status(409).json({ error: 'Cannot delete a car with an active booking' });
  db.prepare('DELETE FROM cars WHERE id = ?').run(req.params.id);
  log('car_deleted', `Car deleted: ${row.brand} ${row.model}`, { id: req.params.id });
  res.json({ message: 'Car deleted successfully' });
});

// ── Bookings (admin read + actions) ──────────────────────────────────────────
app.get('/api/admin/bookings', requireAdmin, (req, res) => {
  const { status } = req.query;
  let sql = `
    SELECT b.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
           cars.brand, cars.model, cars.category, cars.fuel
    FROM bookings b
    JOIN customers c ON c.id = b.customer_id
    JOIN cars ON cars.id = b.car_id
  `;
  const params = [];
  if (status) { sql += ' WHERE b.status = ?'; params.push(status); }
  sql += ' ORDER BY b.rented_at DESC';
  res.json(db.prepare(sql).all(...params));
});

app.get('/api/admin/bookings/:id', requireAdmin, (req, res) => {
  const row = db.prepare(`
    SELECT b.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
           cars.brand, cars.model, cars.year, cars.category, cars.fuel, cars.transmission, cars.engine
    FROM bookings b JOIN customers c ON c.id=b.customer_id JOIN cars ON cars.id=b.car_id
    WHERE b.id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Booking not found' });
  res.json(row);
});

// Return a car — ADMIN ONLY
app.patch('/api/admin/bookings/:id/return', requireAdmin, (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking)                    return res.status(404).json({ error: 'Booking not found' });
  if (booking.status !== 'active') return res.status(409).json({ error: 'Booking is not active' });
  db.prepare(`UPDATE bookings SET status='returned', returned_at=datetime('now') WHERE id=?`).run(req.params.id);
  db.prepare('UPDATE cars SET is_available = 1 WHERE id = ?').run(booking.car_id);
  const car      = parseCar(db.prepare('SELECT * FROM cars WHERE id=?').get(booking.car_id));
  const customer = db.prepare('SELECT * FROM customers WHERE id=?').get(booking.customer_id);
  log('booking_returned', `Admin returned booking ${req.params.id}: ${car.brand} ${car.model}`, { bookingId: req.params.id });
  res.json({ message: 'Car returned successfully', booking, car, customer });
});

// Cancel a booking — ADMIN ONLY
app.patch('/api/admin/bookings/:id/cancel', requireAdmin, (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking)                    return res.status(404).json({ error: 'Booking not found' });
  if (booking.status !== 'active') return res.status(409).json({ error: 'Only active bookings can be cancelled' });
  db.prepare(`UPDATE bookings SET status='cancelled', returned_at=datetime('now') WHERE id=?`).run(req.params.id);
  db.prepare('UPDATE cars SET is_available = 1 WHERE id = ?').run(booking.car_id);
  log('booking_cancelled', `Admin cancelled booking ${req.params.id}`, { bookingId: req.params.id });
  res.json({ message: 'Booking cancelled successfully' });
});

// ── Customers (admin CRUD) ────────────────────────────────────────────────────
app.get('/api/admin/customers', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, COUNT(b.id) as total_bookings,
           SUM(CASE WHEN b.status='active' THEN 1 ELSE 0 END) as active_bookings,
           COALESCE(SUM(b.total_price),0) as total_spent
    FROM customers c
    LEFT JOIN bookings b ON b.customer_id = c.id
    GROUP BY c.id ORDER BY c.created_at DESC
  `).all();
  res.json(rows);
});

app.get('/api/admin/customers/:id', requireAdmin, (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  const bookings = db.prepare(`
    SELECT b.*, cars.brand, cars.model FROM bookings b
    JOIN cars ON cars.id = b.car_id WHERE b.customer_id = ? ORDER BY b.rented_at DESC
  `).all(req.params.id);
  res.json({ ...customer, bookings });
});

app.post('/api/admin/customers', requireAdmin, (req, res) => {
  const { name, email, phone, address } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const id = 'CUS' + Date.now();
  db.prepare('INSERT INTO customers (id,name,email,phone,address) VALUES (?,?,?,?,?)')
    .run(id, name, email||null, phone||null, address||null);
  log('customer_added', `Customer added manually: ${name}`, { id });
  res.status(201).json(db.prepare('SELECT * FROM customers WHERE id = ?').get(id));
});

app.put('/api/admin/customers/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Customer not found' });
  const { name, email, phone, address } = req.body;
  db.prepare('UPDATE customers SET name=?,email=?,phone=?,address=? WHERE id=?')
    .run(name||row.name, email||row.email, phone||row.phone, address||row.address, req.params.id);
  res.json(db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id));
});

app.delete('/api/admin/customers/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Customer not found' });
  const active = db.prepare(`SELECT id FROM bookings WHERE customer_id=? AND status='active'`).get(req.params.id);
  if (active) return res.status(409).json({ error: 'Cannot delete customer with active bookings' });
  db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
  res.json({ message: 'Customer deleted' });
});

// ── Dashboard Stats (admin) ───────────────────────────────────────────────────
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const totalCars      = db.prepare('SELECT COUNT(*) as c FROM cars').get().c;
  const availableCars  = db.prepare('SELECT COUNT(*) as c FROM cars WHERE is_available=1').get().c;
  const totalCustomers = db.prepare('SELECT COUNT(*) as c FROM customers').get().c;
  const activeBookings = db.prepare(`SELECT COUNT(*) as c FROM bookings WHERE status='active'`).get().c;
  const totalRevenue   = db.prepare(`SELECT COALESCE(SUM(total_price),0) as s FROM bookings WHERE status='returned'`).get().s;
  const pendingRevenue = db.prepare(`SELECT COALESCE(SUM(total_price),0) as s FROM bookings WHERE status='active'`).get().s;
  const totalBookings  = db.prepare('SELECT COUNT(*) as c FROM bookings').get().c;
  const recentBookings = db.prepare(`
    SELECT b.id, b.status, b.total_price, b.rented_at, b.rental_days,
           c.name as customer_name, cars.brand, cars.model
    FROM bookings b JOIN customers c ON c.id=b.customer_id JOIN cars ON cars.id=b.car_id
    ORDER BY b.rented_at DESC LIMIT 6`).all();
  const topCars = db.prepare(`
    SELECT cars.brand, cars.model, COUNT(b.id) as bookings, COALESCE(SUM(b.total_price),0) as revenue
    FROM bookings b JOIN cars ON cars.id=b.car_id
    GROUP BY b.car_id ORDER BY bookings DESC LIMIT 5`).all();
  const revenueByMonth = db.prepare(`
    SELECT strftime('%Y-%m', rented_at) as month, COALESCE(SUM(total_price),0) as revenue, COUNT(*) as count
    FROM bookings WHERE status='returned'
    GROUP BY month ORDER BY month DESC LIMIT 6`).all();
  res.json({ totalCars, availableCars, totalCustomers, activeBookings, totalRevenue, pendingRevenue, totalBookings, recentBookings, topCars, revenueByMonth });
});

// ── Activity Log (admin) ──────────────────────────────────────────────────────
app.get('/api/admin/activity', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 100').all());
});

// ── Admin login page ─────────────────────────────────────────────────────────
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});

// ── Admin panel pages (serve index, JS guards auth) ───────────────────────
app.get('/pages/*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', req.path));
});

// ── Catch-all → public site ───────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚗 DriveHaus running → http://localhost:${PORT}`);
  console.log(`🔐 Admin panel  → http://localhost:${PORT}/admin`);
  console.log(`🌍 Public site  → http://localhost:${PORT}\n`);
  console.log(`   Admin user: ${ADMIN_USER}  |  Password: ${ADMIN_PASS}\n`);
});
