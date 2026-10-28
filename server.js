const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  // Vercel doesn't support WebSockets on serverless — allow polling fallback
  transports: ['polling', 'websocket'],
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;
// Vercel serverless functions have a read-only filesystem except /tmp
const DATA_DIR = process.env.VERCEL ? '/tmp' : path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'gym_data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Helper to generate readable 6-character alphanumeric code
function generateBookingCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'GYM-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

// Generate the 7 days schedule (Today through next 6 days)
function getDaysList() {
  const days = [];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();

  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
    const dayName = dayNames[d.getDay()];
    const month = monthNames[d.getMonth()];
    const dateNum = d.getDate();

    let label = `${dayName}, ${dateNum} ${month}`;
    if (i === 0) label = `Today (${dayName}, ${dateNum} ${month})`;
    else if (i === 1) label = `Tomorrow (${dayName}, ${dateNum} ${month})`;

    days.push({
      date: dateStr,
      dayIndex: i,
      label: label,
      shortLabel: `${dayName} ${dateNum} ${month}`,
      isToday: i === 0
    });
  }
  return days;
}

// Hourly Time Templates
const HOURLY_TIMES = [
  { time: '06:00 - 07:00', title: 'Early Bird Yoga & Stretch' },
  { time: '07:00 - 08:00', title: 'Morning Conditioning & Mobility' },
  { time: '08:00 - 09:00', title: 'Core & Bodyweight Strength' },
  { time: '09:00 - 10:00', title: 'Mat Pilates Focus' },
  { time: '10:00 - 11:00', title: 'Open Mat Functional Training' },
  { time: '11:00 - 12:00', title: 'Midday Power Hour' },
  { time: '12:00 - 13:00', title: 'Lunch Express Mobility' },
  { time: '16:00 - 17:00', title: 'Afternoon Strength & Conditioning' },
  { time: '17:00 - 18:00', title: 'HIIT & Mat Circuit' },
  { time: '18:00 - 19:00', title: 'Prime Time Power Mat' },
  { time: '19:00 - 20:00', title: 'Evening Recovery & Stretch' },
  { time: '20:00 - 21:00', title: 'Late Night Flow & Wind-Down' }
];

// Initial Sessions across the 7 days
function getInitialSessions() {
  const days = getDaysList();
  const allSessions = [];

  days.forEach((day, dayIdx) => {
    HOURLY_TIMES.forEach((t, timeIdx) => {
      const slotCode = `slot-${(timeIdx + 6).toString().padStart(2, '0')}`;
      const sessionId = `${day.date}_${slotCode}`;
      const bookings = [];
      const waitlist = [];

      // Seed today's slots for demonstration
      if (dayIdx === 0) {
        // Today 07:00 has 19 bookings (1 mat left)
        if (slotCode === 'slot-07') {
          const sampleNames = [
            'Aarav Patel', 'Neha Sharma', 'Rohan Gupta', 'Priya Singh', 'Vikram Mehta',
            'Ananya Verma', 'Kabir Das', 'Diya Joshi', 'Arjun Nair', 'Ishaan Malhotra',
            'Kavya Rao', 'Aditya Roy', 'Tanvi Desai', 'Siddharth Jain', 'Rhea Kapoor',
            'Dev Choudhury', 'Meera Iyer', 'Kunal Shah', 'Bhavna Kulkarni'
          ];
          sampleNames.forEach((name, i) => {
            bookings.push({
              id: `bk_seed_${sessionId}_${i + 1}`,
              code: `GYM-${(1000 + i).toString(36).toUpperCase()}`,
              name: name,
              email: `${name.toLowerCase().replace(' ', '.')}@example.com`,
              matNumber: i + 1,
              bookedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
              checkedIn: i < 3,
              checkedInAt: i < 3 ? new Date(Date.now() - 1800000).toISOString() : null,
              status: 'CONFIRMED'
            });
          });
        }

        // Today 08:00 is completely FULL (20/20) with 1 person already on waitlist
        if (slotCode === 'slot-08') {
          for (let i = 1; i <= 20; i++) {
            bookings.push({
              id: `bk_seed_08_${i}`,
              code: `GYM-${(2000 + i).toString(36).toUpperCase()}`,
              name: `Member ${i}`,
              email: `member${i}@example.com`,
              matNumber: i,
              bookedAt: new Date(Date.now() - 7200000).toISOString(),
              checkedIn: false,
              checkedInAt: null,
              status: 'CONFIRMED'
            });
          }
          waitlist.push({
            id: 'wl_seed_08_1',
            sessionId: sessionId,
            name: 'Gaurav Sen (Waitlist Test)',
            email: 'gaurav@example.com',
            joinedAt: new Date(Date.now() - 1200000).toISOString(),
            status: 'WAITLIST'
          });
        }
      }

      // Seed a sample booking on tomorrow
      if (dayIdx === 1 && slotCode === 'slot-07') {
        bookings.push({
          id: `bk_seed_tom_1`,
          code: `GYM-TM01`,
          name: 'Sunil Gavaskar',
          email: 'sunil@example.com',
          matNumber: 1,
          bookedAt: new Date().toISOString(),
          checkedIn: false,
          checkedInAt: null,
          status: 'CONFIRMED'
        });
      }

      allSessions.push({
        id: sessionId,
        slotCode: slotCode,
        date: day.date,
        dayLabel: day.label,
        shortDay: day.shortLabel,
        isToday: day.isToday,
        time: t.time,
        title: t.title,
        capacity: 20,
        bookings: bookings,
        waitlist: waitlist
      });
    });
  });

  return allSessions;
}

// In-memory sessions store
let sessions = [];

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      sessions = JSON.parse(raw);
      if (!sessions || sessions.length === 0 || !sessions[0].date) {
        sessions = getInitialSessions();
        saveData();
      }
    } else {
      sessions = getInitialSessions();
      saveData();
    }
  } catch (err) {
    console.error('Error loading data, initializing defaults:', err);
    sessions = getInitialSessions();
  }
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(sessions, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving data:', err);
  }
}

loadData();

// Helper to find session by id, supporting both full id ('2026-10-28_slot-07') and shorthand ('slot-07' for today)
function findSessionById(sessionId) {
  if (!sessionId) return null;
  let s = sessions.find(s => s.id === sessionId);
  if (s) return s;

  const todayStr = getDaysList()[0].date;
  s = sessions.find(s => s.id === `${todayStr}_${sessionId}`);
  if (s) return s;

  return sessions.find(s => s.isToday && s.slotCode === sessionId);
}

// Summary helper for public view (does not expose full private info to everyone)
function getPublicSessionSummary(session) {
  const confirmedCount = session.bookings.length;
  const matsLeft = Math.max(0, session.capacity - confirmedCount);
  const waitlistCount = session.waitlist.length;

  return {
    id: session.id,
    slotCode: session.slotCode,
    date: session.date,
    dayLabel: session.dayLabel,
    shortDay: session.shortDay,
    isToday: session.isToday,
    time: session.time,
    title: session.title,
    capacity: session.capacity,
    confirmedCount,
    matsLeft,
    waitlistCount,
    isFull: confirmedCount >= session.capacity,
    mats: Array.from({ length: session.capacity }, (_, i) => {
      const matNumber = i + 1;
      const booking = session.bookings.find(b => b.matNumber === matNumber);
      return {
        matNumber,
        occupied: !!booking,
        checkedIn: booking ? !!booking.checkedIn : false
      };
    })
  };
}

// Broadcast updated state to all connected clients
function broadcastUpdate(type, payload) {
  const summary = sessions.map(getPublicSessionSummary);
  const days = getDaysList();
  io.emit('state_update', { type, payload, summary, days });
}

// API: Get days list
app.get('/api/days', (req, res) => {
  res.json(getDaysList());
});

// API: GET all session summaries (can filter by ?date=YYYY-MM-DD)
app.get('/api/sessions', (req, res) => {
  const dateFilter = req.query.date;
  let list = sessions;
  if (dateFilter) {
    list = sessions.filter(s => s.date === dateFilter);
  }
  res.json(list.map(getPublicSessionSummary));
});

// API: GET full session details for staff (can filter by ?date=YYYY-MM-DD)
app.get('/api/staff/sessions', (req, res) => {
  const dateFilter = req.query.date;
  let list = sessions;
  if (dateFilter) {
    list = sessions.filter(s => s.date === dateFilter);
  }
  res.json(list);
});

// API: GET specific booking or waitlist entry by code or id
app.get('/api/my-ticket', (req, res) => {
  const query = (req.query.code || req.query.id || '').trim().toUpperCase();
  if (!query) {
    return res.status(400).json({ error: 'Code or ID required' });
  }

  for (const session of sessions) {
    // Check confirmed bookings
    const booking = session.bookings.find(b => 
      b.code.toUpperCase() === query || b.id === query || b.id.toUpperCase() === query
    );
    if (booking) {
      return res.json({
        found: true,
        type: 'CONFIRMED',
        sessionId: session.id,
        sessionDate: session.date,
        sessionDay: session.dayLabel,
        sessionTime: session.time,
        sessionTitle: session.title,
        data: booking
      });
    }

    // Check waitlist
    const wlIndex = session.waitlist.findIndex(w => 
      w.id === query || w.id.toUpperCase() === query || (w.email && w.email.toUpperCase() === query)
    );
    if (wlIndex !== -1) {
      const entry = session.waitlist[wlIndex];
      return res.json({
        found: true,
        type: 'WAITLIST',
        sessionId: session.id,
        sessionDate: session.date,
        sessionDay: session.dayLabel,
        sessionTime: session.time,
        sessionTitle: session.title,
        position: wlIndex + 1,
        totalWaitlist: session.waitlist.length,
        data: entry
      });
    }
  }

  res.status(404).json({ found: false, message: 'No active booking or waitlist entry found.' });
});

// POST book a slot
app.post('/api/book', (req, res) => {
  const { sessionId, name, email } = req.body;

  if (!sessionId || !name || !email) {
    return res.status(400).json({ error: 'Session, name, and email are required.' });
  }

  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();

  const session = findSessionById(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found.' });
  }

  // Prevent duplicate active booking in the same session by same email
  const existingBooking = session.bookings.find(b => b.email.toLowerCase() === cleanEmail);
  if (existingBooking) {
    return res.status(400).json({ 
      error: `You already have a confirmed mat (#${existingBooking.matNumber}) for ${session.dayLabel} at ${session.time}! Your code is ${existingBooking.code}.` 
    });
  }
  const existingWaitlist = session.waitlist.find(w => w.email.toLowerCase() === cleanEmail);
  if (existingWaitlist) {
    const pos = session.waitlist.indexOf(existingWaitlist) + 1;
    return res.status(400).json({ 
      error: `You are already on the waitlist for this session at Position #${pos}.` 
    });
  }

  // THE GOLDEN RULE: Server checks capacity strictly. Twenty mats means never twenty-one.
  if (session.bookings.length < session.capacity) {
    const occupiedMatNumbers = new Set(session.bookings.map(b => b.matNumber));
    let matNumber = 1;
    while (occupiedMatNumbers.has(matNumber) && matNumber <= session.capacity) {
      matNumber++;
    }

    if (matNumber > session.capacity) {
      return res.status(500).json({ error: 'Mat allocation invariant failed.' });
    }

    const code = generateBookingCode();
    const newBooking = {
      id: generateId('bk'),
      code: code,
      name: cleanName,
      email: cleanEmail,
      matNumber: matNumber,
      bookedAt: new Date().toISOString(),
      checkedIn: false,
      checkedInAt: null,
      status: 'CONFIRMED'
    };

    session.bookings.push(newBooking);
    saveData();

    broadcastUpdate('booking_created', {
      sessionId: session.id,
      matNumber: matNumber,
      matsLeft: session.capacity - session.bookings.length
    });

    return res.json({
      success: true,
      status: 'CONFIRMED',
      sessionId: session.id,
      sessionDate: session.date,
      sessionDay: session.dayLabel,
      sessionTime: session.time,
      sessionTitle: session.title,
      booking: newBooking,
      message: `Mat #${matNumber} booked for ${session.dayLabel} (${session.time})! Show code ${code} at the door.`
    });
  } else {
    // Slot is FULL -> Join Waitlist
    const waitlistEntry = {
      id: generateId('wl'),
      sessionId: session.id,
      name: cleanName,
      email: cleanEmail,
      joinedAt: new Date().toISOString(),
      status: 'WAITLIST'
    };

    session.waitlist.push(waitlistEntry);
    const position = session.waitlist.length;
    saveData();

    broadcastUpdate('waitlist_joined', {
      sessionId: session.id,
      waitlistCount: position
    });

    return res.json({
      success: true,
      status: 'WAITLIST',
      sessionId: session.id,
      sessionDate: session.date,
      sessionDay: session.dayLabel,
      sessionTime: session.time,
      sessionTitle: session.title,
      position: position,
      entry: waitlistEntry,
      message: `Session is full. You joined the waitlist for ${session.dayLabel} (${session.time}) at Position #${position}. If anyone cancels, you will be booked automatically!`
    });
  }
});

// POST cancel booking or waitlist entry
app.post('/api/cancel', (req, res) => {
  const { sessionId, id, code } = req.body;

  if (!sessionId || (!id && !code)) {
    return res.status(400).json({ error: 'Session ID and Booking ID or Code are required.' });
  }

  const session = findSessionById(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found.' });
  }

  // Check if it's a confirmed booking
  const bookingIndex = session.bookings.findIndex(b => 
    (id && b.id === id) || (code && b.code.toUpperCase() === code.trim().toUpperCase())
  );

  if (bookingIndex !== -1) {
    const cancelledBooking = session.bookings[bookingIndex];
    const freedMatNumber = cancelledBooking.matNumber;

    // Remove confirmed booking
    session.bookings.splice(bookingIndex, 1);

    let promotedEntry = null;
    let newBooking = null;

    // AUTOMATIC PROMOTION: Somebody cancels, next person in queue is booked automatically!
    if (session.waitlist.length > 0) {
      promotedEntry = session.waitlist.shift();

      const newCode = generateBookingCode();
      newBooking = {
        id: generateId('bk'),
        code: newCode,
        name: promotedEntry.name,
        email: promotedEntry.email,
        matNumber: freedMatNumber,
        bookedAt: new Date().toISOString(),
        checkedIn: false,
        checkedInAt: null,
        status: 'CONFIRMED'
      };

      session.bookings.push(newBooking);

      io.emit('member_promoted', {
        waitlistId: promotedEntry.id,
        email: promotedEntry.email,
        name: promotedEntry.name,
        sessionId: session.id,
        sessionDate: session.date,
        sessionDay: session.dayLabel,
        sessionTime: session.time,
        matNumber: freedMatNumber,
        code: newCode
      });
    }

    saveData();

    broadcastUpdate('booking_cancelled', {
      sessionId: session.id,
      freedMat: freedMatNumber,
      promotedBooking: newBooking ? {
        name: newBooking.name,
        matNumber: newBooking.matNumber,
        code: newBooking.code
      } : null
    });

    return res.json({
      success: true,
      message: `Booking ${cancelledBooking.code} for Mat #${freedMatNumber} has been cancelled.`,
      promoted: promotedEntry ? {
        name: promotedEntry.name,
        newCode: newBooking.code,
        matNumber: newBooking.matNumber
      } : null
    });
  }

  // Check if it's a waitlist entry
  const wlIndex = session.waitlist.findIndex(w => 
    (id && w.id === id) || (code && w.id === code)
  );

  if (wlIndex !== -1) {
    const removedWl = session.waitlist.splice(wlIndex, 1)[0];
    saveData();

    broadcastUpdate('waitlist_left', {
      sessionId: session.id,
      waitlistCount: session.waitlist.length
    });

    return res.json({
      success: true,
      message: `${removedWl.name} has been removed from the waitlist.`
    });
  }

  return res.status(404).json({ error: 'Booking or waitlist record not found.' });
});

// POST staff check-in at the door
app.post('/api/checkin', (req, res) => {
  const code = (req.body.code || '').trim().toUpperCase();

  if (!code) {
    return res.status(400).json({ error: 'Please enter a booking code.' });
  }

  let foundBooking = null;
  let targetSession = null;

  for (const session of sessions) {
    const booking = session.bookings.find(b => b.code.toUpperCase() === code);
    if (booking) {
      foundBooking = booking;
      targetSession = session;
      break;
    }
  }

  if (!foundBooking) {
    // Check if maybe it's still on waitlist
    for (const session of sessions) {
      const onWl = session.waitlist.find(w => w.id.toUpperCase() === code || (w.email && w.email.toUpperCase() === code));
      if (onWl) {
        const pos = session.waitlist.indexOf(onWl) + 1;
        return res.status(400).json({
          error: `Member is currently on WAITLIST (Position #${pos}) for ${session.dayLabel} at ${session.time}. A mat has not been allocated yet.`
        });
      }
    }

    return res.status(404).json({ error: `Invalid booking code "${code}". No matching booking found.` });
  }

  if (foundBooking.checkedIn) {
    const timeStr = new Date(foundBooking.checkedInAt).toLocaleTimeString();
    return res.status(400).json({
      error: `Member ${foundBooking.name} (Mat #${foundBooking.matNumber}) was ALREADY checked in at ${timeStr}.`
    });
  }

  // Mark checked in
  foundBooking.checkedIn = true;
  foundBooking.checkedInAt = new Date().toISOString();
  saveData();

  io.emit('member_checked_in', {
    code: foundBooking.code,
    bookingId: foundBooking.id,
    sessionId: targetSession.id,
    sessionDate: targetSession.date,
    sessionDay: targetSession.dayLabel,
    name: foundBooking.name,
    matNumber: foundBooking.matNumber,
    checkedInAt: foundBooking.checkedInAt
  });

  broadcastUpdate('checkin_updated', {
    sessionId: targetSession.id,
    code: foundBooking.code
  });

  return res.json({
    success: true,
    message: `Checked in successfully! Welcome, ${foundBooking.name}. Mat #${foundBooking.matNumber} (${targetSession.dayLabel} ${targetSession.time}).`,
    booking: foundBooking,
    sessionTime: targetSession.time,
    sessionDay: targetSession.dayLabel
  });
});

// POST reset to sample data
app.post('/api/reset', (req, res) => {
  sessions = getInitialSessions();
  saveData();
  broadcastUpdate('reset', {});
  res.json({ success: true, message: 'Sessions reset to initial test state.' });
});

// Real-time socket connection
io.on('connection', (socket) => {
  socket.emit('state_update', {
    type: 'init',
    summary: sessions.map(getPublicSessionSummary),
    days: getDaysList()
  });
});

// Export for Vercel serverless (Socket.IO falls back to HTTP long-polling on Vercel)
// Run directly via `node server.js` for local development with full WebSocket support
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(` MAIT Gym Slot Booking System running on port ${PORT}`);
    console.log(` Local URL: http://localhost:${PORT}`);
    console.log(` Member portal: http://localhost:${PORT}`);
    console.log(` Staff portal:  http://localhost:${PORT}/staff.html`);
    console.log(`===============================================`);
  });
}

module.exports = server;
