# 🚗 DriveHaus — Full Stack Car Rental Management System

A production-grade car rental platform with a **SQLite database**, **REST API backend**, and a **5-page frontend dashboard**.

---

## Project Structure

```
drivehaus/
├── backend/
│   ├── server.js       ← Express REST API (all routes)
│   ├── database.js     ← SQLite schema + seeding
│   └── package.json
└── frontend/
    ├── index.html      ← Redirect to dashboard
    ├── css/
    │   └── global.css  ← Shared design system
    ├── js/
    │   └── shared.js   ← API client, utilities, SVGs
    └── pages/
        ├── dashboard.html  ← Stats, revenue, recent activity
        ├── fleet.html      ← Car management (CRUD)
        ├── bookings.html   ← Booking management (rent/return/cancel)
        ├── customers.html  ← Customer management (CRUD)
        └── activity.html   ← Full system activity log
```

---

## Setup & Run

```bash
# 1. Install dependencies
cd backend
npm install

# 2. Start server
node server.js
# or for auto-reload:
npm run dev

# 3. Open in browser
# http://localhost:3001
```

The frontend is served directly by Express — no separate server needed.

---

## Features

### Dashboard
- Live stats: cars, available, active bookings, customers, revenue
- Recent bookings feed
- Most booked cars leaderboard
- Monthly revenue bar chart
- Activity timeline

### Fleet Management
- View all 6 cars with SVG illustrations + full specs
- Filter by: all, available, rented, sedan, SUV, electric, sports
- Search by brand/model
- Add new cars (full form)
- Edit existing cars
- Delete cars (protected if actively rented)
- Full detail modal per car

### Bookings
- Create new bookings (auto-creates customer if new)
- Live price calculator
- View all bookings with filters (active/returned/cancelled)
- Full booking detail modal
- Return a rented car
- Cancel a booking
- Full booking receipt

### Customers
- View all customers as cards with booking stats
- Add/edit/delete customers
- Full profile modal with booking history
- Protected deletion (can't delete if active bookings exist)

### Activity Log
- Every system event stored in DB
- Filterable by event type
- Timestamps + relative time
- JSON metadata per event

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/cars | List all cars |
| GET | /api/cars/:id | Single car |
| POST | /api/cars | Add a car |
| PUT | /api/cars/:id | Update a car |
| DELETE | /api/cars/:id | Delete a car |
| GET | /api/customers | All customers (with stats) |
| GET | /api/customers/:id | Customer + booking history |
| POST | /api/customers | Add customer |
| PUT | /api/customers/:id | Update customer |
| DELETE | /api/customers/:id | Delete customer |
| GET | /api/bookings | All bookings |
| GET | /api/bookings/:id | Booking detail |
| POST | /api/bookings | Create booking (rent) |
| PATCH | /api/bookings/:id/return | Return a car |
| PATCH | /api/bookings/:id/cancel | Cancel booking |
| GET | /api/stats | Dashboard stats |
| GET | /api/activity | Activity log (last 50) |

---

## Database

SQLite file: `backend/drivehaus.db` (auto-created on first run)

### Tables
- **cars** — Fleet inventory
- **customers** — Customer registry  
- **bookings** — All rental transactions
- **activity_log** — System event log

### Default Cars (seeded automatically)
| ID | Car | Rate |
|----|-----|------|
| C001 | Toyota Camry | $60/day |
| C002 | Honda Accord | $70/day |
| C003 | Mahindra Thar | $150/day |
| C004 | BMW X5 | $200/day |
| C005 | Tesla Model 3 | $180/day |
| C006 | Ford Mustang | $220/day |
