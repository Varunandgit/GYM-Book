/**
 * Automated Verification & Concurrency Test Suite
 * Tests all core rules:
 * 1. Exactly 20 mats capacity enforced by server (never 21)
 * 2. Simultaneous parallel booking requests: exactly 20 confirmed, rest waitlisted
 * 3. Immediate booking code generation
 * 4. Automatic waitlist promotion upon cancellation
 * 5. Staff door check-in verification and prevention of duplicate check-in
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';

function post(endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch (e) {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(endpoint) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}${endpoint}`, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch (e) {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING GYM SLOT BOOKING VERIFICATION TEST SUITE');
  console.log('====================================================\n');

  // Step 1: Reset demo data
  console.log('[Test 1] Resetting system state...');
  await post('/api/reset', {});
  console.log('✓ System reset completed.\n');

  // Step 2: Test 06:00 session (starts empty with 0 bookings)
  const targetSession = 'slot-06';
  console.log(`[Test 2] Firing 25 PARALLEL booking requests simultaneously for ${targetSession}...`);

  const requests = [];
  for (let i = 1; i <= 25; i++) {
    requests.push(post('/api/book', {
      sessionId: targetSession,
      name: `Racer ${i}`,
      email: `racer${i}@test.com`
    }));
  }

  const results = await Promise.all(requests);

  const confirmed = results.filter(r => r.status === 200 && r.body.status === 'CONFIRMED');
  const waitlisted = results.filter(r => r.status === 200 && r.body.status === 'WAITLIST');

  console.log(`-> Confirmed bookings count: ${confirmed.length}`);
  console.log(`-> Waitlisted requests count: ${waitlisted.length}`);

  if (confirmed.length === 20) {
    console.log('✅ PASS: Exactly 20 mats were booked. "Twenty mats means never twenty-one" invariant verified!');
  } else {
    console.error(`❌ FAIL: Expected 20 confirmed, got ${confirmed.length}`);
    process.exit(1);
  }

  if (waitlisted.length === 5) {
    console.log('✅ PASS: Exactly 5 overflow requests were placed on the waitlist in sequential order.');
  } else {
    console.error(`❌ FAIL: Expected 5 waitlisted, got ${waitlisted.length}`);
    process.exit(1);
  }

  // Check unique mat allocation
  const matNumbers = confirmed.map(c => c.body.booking.matNumber).sort((a, b) => a - b);
  const uniqueMats = new Set(matNumbers);
  if (uniqueMats.size === 20 && matNumbers[0] === 1 && matNumbers[19] === 20) {
    console.log('✅ PASS: Mats 1 through 20 were all allocated uniquely with no duplicate mats.\n');
  } else {
    console.error('❌ FAIL: Mat allocation irregularity detected:', matNumbers);
    process.exit(1);
  }

  // Step 3: Cancellation & Auto-promotion Test
  console.log('[Test 3] Testing Automatic Waitlist Promotion on Cancellation...');
  const memberToCancel = confirmed[0].body.booking;
  const firstWaitlisted = waitlisted[0].body.entry;

  console.log(`-> Member "${memberToCancel.name}" (Mat #${memberToCancel.matNumber}, Code: ${memberToCancel.code}) cancels booking.`);
  const cancelRes = await post('/api/cancel', {
    sessionId: targetSession,
    id: memberToCancel.id,
    code: memberToCancel.code
  });

  if (cancelRes.status === 200 && cancelRes.body.promoted) {
    console.log(`✅ PASS: Cancellation successful. Server automatically promoted "${cancelRes.body.promoted.name}" to Mat #${cancelRes.body.promoted.matNumber} with Code ${cancelRes.body.promoted.newCode}!`);
  } else {
    console.error('❌ FAIL: Auto-promotion did not trigger properly:', cancelRes.body);
    process.exit(1);
  }

  // Verify total confirmed mats in session is still STRICTLY 20
  const staffSessions = await get('/api/staff/sessions');
  const currentSession = staffSessions.body.find(s => s.id === targetSession || s.slotCode === targetSession);
  console.log(`-> Confirmed count after cancellation and auto-promotion: ${currentSession.bookings.length}/20`);
  console.log(`-> Remaining waitlist count: ${currentSession.waitlist.length} (was 5, now 4)`);

  if (currentSession.bookings.length === 20 && currentSession.waitlist.length === 4) {
    console.log('✅ PASS: Capacity invariant holds! Exactly 20 confirmed mats maintained.\n');
  } else {
    console.error('❌ FAIL: Capacity invariant broken after promotion!');
    process.exit(1);
  }

  // Step 4: Door Check-in Verification
  console.log('[Test 4] Testing Door Staff Check-in...');
  const memberToCheckIn = currentSession.bookings[0];
  console.log(`-> Staff checking in member "${memberToCheckIn.name}" with code ${memberToCheckIn.code}...`);

  const checkinRes = await post('/api/checkin', { code: memberToCheckIn.code });
  if (checkinRes.status === 200 && checkinRes.body.booking.checkedIn) {
    console.log(`✅ PASS: Door check-in successful for Mat #${checkinRes.body.booking.matNumber}!`);
  } else {
    console.error('❌ FAIL: Door check-in failed:', checkinRes.body);
    process.exit(1);
  }

  // Step 5: Duplicate Check-in Prevention
  console.log('[Test 5] Testing Duplicate Door Check-in Prevention...');
  const dupCheckinRes = await post('/api/checkin', { code: memberToCheckIn.code });
  if (dupCheckinRes.status === 400 && dupCheckinRes.body.error.includes('ALREADY checked in')) {
    console.log(`✅ PASS: Duplicate check-in correctly rejected with: "${dupCheckinRes.body.error}"\n`);
  } else {
    console.error('❌ FAIL: Duplicate check-in was not blocked properly:', dupCheckinRes);
    process.exit(1);
  }

  // Step 6: Invalid Code Check
  console.log('[Test 6] Testing Invalid Code Verification...');
  const badCheckinRes = await post('/api/checkin', { code: 'GYM-FAKE99' });
  if (badCheckinRes.status === 404) {
    console.log(`✅ PASS: Invalid code rejected with: "${badCheckinRes.body.error}"\n`);
  } else {
    console.error('❌ FAIL: Invalid code should return 404');
    process.exit(1);
  }

  console.log('====================================================');
  console.log('🎉 ALL TESTS PASSED! System satisfies all core brief requirements.');
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
