# MAIT Gym - Slot Booking System (Task 02)

A real-time hourly gym mat reservation system built for MAIT Gym's 20-mat studio.

Designed with clean, straightforward architecture and unpretentious styling — focusing on bulletproof server logic, strict capacity enforcement, and zero-refresh real-time state synchronization.

---

## 🎯 Core Requirements & Invariants

| Requirement | Implementation & Architectural Decision |
| :--- | :--- |
| **Day-Wise Schedule & Time Slots** | Supports 7-day schedule (Today, Tomorrow, and upcoming days). Each day has its own independent 12 hourly sessions with distinct 20-mat allocations and waitlists. |
| **Hourly Sessions, 20 Mats Each** | Sessions run hourly (06:00 to 21:00). Each session tracks exactly 20 individual mats (`Mat #1` to `Mat #20`). |
| **"Twenty mats means never twenty one"** | Enforced strictly in [`server.js`](server.js#L182-L218). The server never trusts client counts. Mat allocation runs synchronously on the Node.js event loop: if `session.bookings.length >= 20`, subsequent requests are automatically directed to the waitlist. |
| **"The server decides, never the browser"** | All mat assignments, booking codes (`GYM-XXXX`), waitlist ordering, cancellations, and check-in verifications occur on the server. The client is a reactive display. |
| **"Full, you join the waitlist and see your position"** | When a session reaches 20/20, users are appended to the session's FIFO waitlist. The client receives their exact 1-based queue position (`#1`, `#2`, etc.). |
| **"Somebody cancels, next person is booked automatically"** | When a confirmed booking is cancelled, the server immediately dequeues the first waitlisted member (`waitlist.shift()`), assigns them the freed mat, generates their booking code, marks them `CONFIRMED`, and pushes a real-time event to upgrade their pass. |
| **"Nobody refreshes anything"** | Full duplex communication via **Socket.IO**. When any user books, cancels, or checks in, the server broadcasts state updates to all connected browser windows instantly. |
| **"Staff check members in at the door"** | Dedicated Staff Door Terminal (`/staff.html`) allows attendants to enter/scan member codes or use one-click check-in. Prevents double check-ins and timestamps arrival. |

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Verification & Concurrency Test Suite
```bash
npm test
```
*Fires 25 simultaneous parallel booking requests against an empty session to prove that exactly 20 are confirmed, 5 are waitlisted, no duplicate mats are allocated, cancellation triggers instant automatic promotion, and door check-in prevents duplicates.*

### 3. Start the Server
```bash
npm start
```

### 4. Open in Browser
- **Member Booking Portal:** [http://localhost:3000](http://localhost:3000)
- **Staff Door Check-in:** [http://localhost:3000/staff.html](http://localhost:3000/staff.html)

---

## 🧪 Live Demonstration Walkthrough (Try This!)

To experience the zero-refresh auto-promotion and door check-in:

1. **Open two browser windows side by side:**
   - **Window A:** Member Portal at `http://localhost:3000`
   - **Window B:** Member Portal in an Incognito / Private window at `http://localhost:3000`
2. **Observe pre-seeded slots:**
   - **`07:00 - 08:00`** is seeded with **19 bookings** (1 mat remaining).
   - **`08:00 - 09:00`** is seeded with **20 bookings** (Completely full, 1 on waitlist).
3. **Test Waitlist Join:**
   - In **Window A**, select `08:00 - 09:00` (which is full).
   - Click **"Join Waitlist (Position #2)"** and enter your name/email.
   - Your screen immediately displays **"Queue Position #2"**.
4. **Test Real-Time Auto-Promotion (No Refresh!):**
   - In **Window B**, look up an existing confirmed code for that session (or cancel someone via the Staff Terminal).
   - When a spot frees up, watch **Window A** live: the position drops to `#1`, and as soon as another spot opens or the next person cancels, **Window A automatically flips to "CONFIRMED &bull; Mat #X Allocated &bull; Code: GYM-XXXX"** without touching F5!
5. **Test Staff Door Check-in:**
   - Open `http://localhost:3000/staff.html` in another tab.
   - Enter your code `GYM-XXXX` and click **"Check Member In"**.
   - Your member pass in the other window immediately updates to **"✓ CHECKED IN AT DOOR"** with timestamp!

---

## 📂 Code Structure & Walkthrough Guide

```text
├── server.js               # Node.js + Express + Socket.IO server & atomic state engine
├── data/
│   └── gym_data.json       # Persisted session state (bookings, waitlists, mats)
├── public/
│   ├── index.html          # Member Portal (20-mat floor plan, booking form, live pass)
│   ├── staff.html          # Staff Door Check-in Terminal (code verifier & roster)
│   └── style.css           # First-year student CSS styling (clean, simple, readable)
├── test-concurrency.js     # Automated concurrency & invariant test script
└── package.json            # Project manifest & scripts
```

### Key Functions to Walk Through:
- **`bookSlot` logic in `server.js` (lines 182-248):**
  - Validates inputs and duplicate active registrations.
  - Strict check: `if (session.bookings.length < session.capacity)`.
  - Scans `1..20` for lowest unoccupied mat index.
  - Generates secure random 4-letter alphanumeric code `GYM-XXXX`.
  - Otherwise, pushes to `session.waitlist` with 1-based index.
- **`cancelBooking` & Auto-promotion in `server.js` (lines 251-325):**
  - Removes booking from array.
  - If `session.waitlist.length > 0`, immediately invokes `session.waitlist.shift()`, assigns the vacated mat, generates their booking code, and emits a targeted `member_promoted` event.
- **`checkIn` in `server.js` (lines 330-385):**
  - Finds confirmed booking by code.
  - Checks if already checked in (blocks double entry).
  - Sets `checkedIn: true`, `checkedInAt: timestamp`.
  - Broadcasts `member_checked_in` event to update all client screens in real time.
- **Frontend Real-Time Reactivity in `public/index.html`:**
  - Socket.IO listeners: `socket.on('state_update')`, `socket.on('member_promoted')`, `socket.on('member_checked_in')`.
  - Interactive 20-mat visualizer dynamically reflects slot occupancy.
