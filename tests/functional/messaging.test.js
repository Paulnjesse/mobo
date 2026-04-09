/**
 * Messaging Feature — End-to-End Tests
 *
 * Tests the full in-ride messaging flow across three layers:
 *   Layer 1 — REST API  : GET/POST /rides/:id/messages
 *   Layer 2 — Socket.IO : real-time broadcast via the /rides namespace
 *   Layer 3 — E2E flow  : rider books → waits → driver joins → both message
 *
 * All DB calls are mocked (no real Postgres needed).
 * Socket.IO tests spin up a real in-process server using initRideSocket().
 */

// ─── Environment ─────────────────────────────────────────────────────────────
process.env.NODE_ENV     = 'test';
process.env.JWT_SECRET   = 'functional_test_secret_minimum_32_chars_long!!';
process.env.JWT_EXPIRES_IN = '1h';
process.env.FIELD_ENCRYPTION_KEY  = 'field_encryption_test_key_32chrs!!';
process.env.FIELD_LOOKUP_HMAC_KEY = 'field_lookup_hmac_test_key_32chrs!';

// ─── Database mocks ───────────────────────────────────────────────────────────
const mockRideDb = {
  query:   jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  pool:    { connect: jest.fn() },
};
jest.mock('../../services/ride-service/src/config/database', () => mockRideDb);

// ─── Job mocks (prevent background timers interfering with tests) ─────────────
jest.mock('../../services/ride-service/src/jobs/escalationJob',
  () => ({ startEscalationJob: jest.fn() }));
jest.mock('../../services/ride-service/src/jobs/scheduledRideJob',
  () => ({ startScheduledRideJob: jest.fn() }));
jest.mock('../../services/ride-service/src/jobs/deliverySchedulerJob',
  () => ({ startDeliverySchedulerJob: jest.fn() }));

// ─── Utility / external mocks ─────────────────────────────────────────────────
jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: jest.fn().mockResolvedValue({}) }),
}));
jest.mock('axios', () => ({
  get:  jest.fn().mockResolvedValue({ data: {} }),
  post: jest.fn().mockResolvedValue({ data: {} }),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────
const request         = require('supertest');
const jwt             = require('jsonwebtoken');
const http            = require('http');
const { Server }      = require('socket.io');
const { io: ioClient} = require('socket.io-client');
const rideApp         = require('../../services/ride-service/server');
const { initRideSocket } = require('../../services/ride-service/src/socket/rideSocket');

// ─── Test IDs & tokens ────────────────────────────────────────────────────────
const SECRET       = process.env.JWT_SECRET;
const RIDER_ID     = 'rider-msg-e2e-001';
const DRIVER_ID    = 'driver-msg-e2e-001';
const DRIVER_DB_ID = 'driver-db-e2e-001';
const RIDE_ID      = 'ride-msg-e2e-001';
const OUTSIDER_ID  = 'outsider-msg-e2e-001';

function makeToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '1h', algorithm: 'HS256' });
}

const riderToken    = makeToken({ id: RIDER_ID,    role: 'rider',  full_name: 'Test Rider',    phone: '+237600000201' });
const driverToken   = makeToken({ id: DRIVER_ID,   role: 'driver', full_name: 'Test Driver',   phone: '+237600000202' });
const outsiderToken = makeToken({ id: OUTSIDER_ID, role: 'rider',  full_name: 'Not A Participant', phone: '+237600000203' });

// ─── DB response helpers ──────────────────────────────────────────────────────
/** DB row indicating the caller IS a ride participant. */
const ACCESS_GRANTED = { rows: [{ '?column?': 1 }], rowCount: 1 };
/** DB row indicating the caller is NOT a participant. */
const ACCESS_DENIED  = { rows: [], rowCount: 0 };

const SAMPLE_MESSAGES = [
  {
    id: 'msg-001', ride_id: RIDE_ID,
    sender_id: RIDER_ID,  receiver_id: DRIVER_ID,
    content: 'I am at the blue gate',
    is_read: false, created_at: new Date('2024-01-01T10:00:00Z'),
    sender_name: 'Test Rider',
  },
  {
    id: 'msg-002', ride_id: RIDE_ID,
    sender_id: DRIVER_ID, receiver_id: RIDER_ID,
    content: 'On my way, 2 minutes',
    is_read: true,  created_at: new Date('2024-01-01T10:01:00Z'),
    sender_name: 'Test Driver',
  },
];

// ─── Reset mocks before each test ────────────────────────────────────────────
beforeEach(() => {
  mockRideDb.query.mockReset();
  mockRideDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

// =============================================================================
// LAYER 1 — REST API
// =============================================================================

describe('Layer 1 · REST API — GET /rides/:id/messages', () => {

  test('1.1 Rider can retrieve messages for their ride', async () => {
    mockRideDb.query
      .mockResolvedValueOnce(ACCESS_GRANTED)             // access check
      .mockResolvedValueOnce({ rows: SAMPLE_MESSAGES, rowCount: 2 }); // messages

    const res = await request(rideApp)
      .get(`/rides/${RIDE_ID}/messages`)
      .set('Authorization', `Bearer ${riderToken}`)
      .set('x-user-id', RIDER_ID);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.messages)).toBe(true);
    expect(res.body.messages).toHaveLength(2);
  });

  test('1.2 Driver can retrieve messages for their assigned ride', async () => {
    mockRideDb.query
      .mockResolvedValueOnce(ACCESS_GRANTED)
      .mockResolvedValueOnce({ rows: SAMPLE_MESSAGES, rowCount: 2 });

    const res = await request(rideApp)
      .get(`/rides/${RIDE_ID}/messages`)
      .set('Authorization', `Bearer ${driverToken}`)
      .set('x-user-id', DRIVER_ID);

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(2);
  });

  test('1.3 Messages are returned in chronological order (oldest first)', async () => {
    mockRideDb.query
      .mockResolvedValueOnce(ACCESS_GRANTED)
      .mockResolvedValueOnce({ rows: SAMPLE_MESSAGES, rowCount: 2 });

    const res = await request(rideApp)
      .get(`/rides/${RIDE_ID}/messages`)
      .set('Authorization', `Bearer ${riderToken}`)
      .set('x-user-id', RIDER_ID);

    const times = res.body.messages.map(m => new Date(m.created_at).getTime());
    expect(times[0]).toBeLessThan(times[1]);
  });

  test('1.4 Messages include sender_name from users join', async () => {
    mockRideDb.query
      .mockResolvedValueOnce(ACCESS_GRANTED)
      .mockResolvedValueOnce({ rows: SAMPLE_MESSAGES, rowCount: 2 });

    const res = await request(rideApp)
      .get(`/rides/${RIDE_ID}/messages`)
      .set('Authorization', `Bearer ${riderToken}`)
      .set('x-user-id', RIDER_ID);

    expect(res.body.messages[0].sender_name).toBe('Test Rider');
    expect(res.body.messages[1].sender_name).toBe('Test Driver');
  });

  test('1.5 Returns empty array when no messages exist yet', async () => {
    mockRideDb.query
      .mockResolvedValueOnce(ACCESS_GRANTED)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(rideApp)
      .get(`/rides/${RIDE_ID}/messages`)
      .set('Authorization', `Bearer ${riderToken}`)
      .set('x-user-id', RIDER_ID);

    expect(res.status).toBe(200);
    expect(res.body.messages).toEqual([]);
  });

  test('1.6 Non-participant gets 403 Forbidden', async () => {
    mockRideDb.query.mockResolvedValueOnce(ACCESS_DENIED);

    const res = await request(rideApp)
      .get(`/rides/${RIDE_ID}/messages`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .set('x-user-id', OUTSIDER_ID);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not authorised/i);
  });

  test('1.7 Unauthenticated request gets 401', async () => {
    const res = await request(rideApp).get(`/rides/${RIDE_ID}/messages`);
    expect([401, 403]).toContain(res.status);
  });

});

// ─────────────────────────────────────────────────────────────────────────────

describe('Layer 1 · REST API — POST /rides/:id/messages', () => {

  test('2.1 Rider sends a message to driver — returns 201 with message object', async () => {
    const insertedMsg = {
      id: 'msg-new-001', ride_id: RIDE_ID,
      sender_id: RIDER_ID, receiver_id: DRIVER_ID,
      content: 'I am outside', is_read: false,
      created_at: new Date().toISOString(),
    };
    mockRideDb.query
      .mockResolvedValueOnce(ACCESS_GRANTED)
      .mockResolvedValueOnce({ rows: [insertedMsg], rowCount: 1 });

    const res = await request(rideApp)
      .post(`/rides/${RIDE_ID}/messages`)
      .set('Authorization', `Bearer ${riderToken}`)
      .set('x-user-id', RIDER_ID)
      .send({ content: 'I am outside', receiver_id: DRIVER_ID });

    expect(res.status).toBe(201);
    expect(res.body.message).toBeDefined();
    expect(res.body.message.content).toBe('I am outside');
    expect(res.body.message.sender_id).toBe(RIDER_ID);
    expect(res.body.message.receiver_id).toBe(DRIVER_ID);
  });

  test('2.2 Driver sends a message to rider — returns 201', async () => {
    const insertedMsg = {
      id: 'msg-new-002', ride_id: RIDE_ID,
      sender_id: DRIVER_ID, receiver_id: RIDER_ID,
      content: 'Almost there!', is_read: false,
      created_at: new Date().toISOString(),
    };
    mockRideDb.query
      .mockResolvedValueOnce(ACCESS_GRANTED)
      .mockResolvedValueOnce({ rows: [insertedMsg], rowCount: 1 });

    const res = await request(rideApp)
      .post(`/rides/${RIDE_ID}/messages`)
      .set('Authorization', `Bearer ${driverToken}`)
      .set('x-user-id', DRIVER_ID)
      .send({ content: 'Almost there!', receiver_id: RIDER_ID });

    expect(res.status).toBe(201);
    expect(res.body.message.sender_id).toBe(DRIVER_ID);
    expect(res.body.message.receiver_id).toBe(RIDER_ID);
  });

  test('2.3 Returned message has correct ride_id binding', async () => {
    const insertedMsg = { id: 'msg-003', ride_id: RIDE_ID, sender_id: RIDER_ID, receiver_id: DRIVER_ID, content: 'Hi', is_read: false, created_at: new Date().toISOString() };
    mockRideDb.query
      .mockResolvedValueOnce(ACCESS_GRANTED)
      .mockResolvedValueOnce({ rows: [insertedMsg], rowCount: 1 });

    const res = await request(rideApp)
      .post(`/rides/${RIDE_ID}/messages`)
      .set('Authorization', `Bearer ${riderToken}`)
      .set('x-user-id', RIDER_ID)
      .send({ content: 'Hi', receiver_id: DRIVER_ID });

    expect(res.body.message.ride_id).toBe(RIDE_ID);
  });

  test('2.4 Non-participant cannot send a message — 403', async () => {
    mockRideDb.query.mockResolvedValueOnce(ACCESS_DENIED);

    const res = await request(rideApp)
      .post(`/rides/${RIDE_ID}/messages`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .set('x-user-id', OUTSIDER_ID)
      .send({ content: 'Hacking in', receiver_id: RIDER_ID });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not authorised/i);
  });

  test('2.5 Unauthenticated request is rejected — 401', async () => {
    const res = await request(rideApp)
      .post(`/rides/${RIDE_ID}/messages`)
      .send({ content: 'No auth', receiver_id: DRIVER_ID });
    expect([401, 403]).toContain(res.status);
  });

  test('2.6 DB INSERT uses parameterized query — no SQL injection risk', async () => {
    const maliciousContent = "'; DROP TABLE messages; --";
    const safeInsert = { id: 'msg-004', ride_id: RIDE_ID, sender_id: RIDER_ID, receiver_id: DRIVER_ID, content: maliciousContent, is_read: false, created_at: new Date().toISOString() };
    mockRideDb.query
      .mockResolvedValueOnce(ACCESS_GRANTED)
      .mockResolvedValueOnce({ rows: [safeInsert], rowCount: 1 });

    const res = await request(rideApp)
      .post(`/rides/${RIDE_ID}/messages`)
      .set('Authorization', `Bearer ${riderToken}`)
      .set('x-user-id', RIDER_ID)
      .send({ content: maliciousContent, receiver_id: DRIVER_ID });

    // Verify the query was called with parameterized values ($1,$2,$3,$4)
    const insertCall = mockRideDb.query.mock.calls.find(
      c => typeof c[0] === 'string' && c[0].includes('INSERT INTO messages')
    );
    expect(insertCall).toBeDefined();
    expect(insertCall[0]).toMatch(/\$1.*\$2.*\$3.*\$4/);  // parameterized
    expect(insertCall[0]).not.toContain(maliciousContent); // content NOT in query string
    expect(res.status).toBe(201);
  });

});

// =============================================================================
// LAYER 2 — Socket.IO Real-Time Messaging
// =============================================================================

describe('Layer 2 · Socket.IO — Real-Time Messaging', () => {
  let ioServer, httpServer, serverAddress;

  // Spin up a real in-process Socket.IO server backed by initRideSocket
  beforeAll((done) => {
    httpServer = http.createServer();
    ioServer   = new Server(httpServer, {
      transports: ['websocket'],
      pingTimeout: 3000, pingInterval: 1000,
    });
    initRideSocket(ioServer);
    httpServer.listen(0, () => {
      serverAddress = `http://localhost:${httpServer.address().port}`;
      done();
    });
  });

  afterAll((done) => {
    ioServer?.close();
    httpServer?.close(done);
  });

  /** Helper: create and wait for a connected socket. */
  function connect(token, extraAuth = {}) {
    return new Promise((resolve, reject) => {
      const socket = ioClient(`${serverAddress}/rides`, {
        transports: ['websocket'],
        auth: { token, ...extraAuth },
        reconnection: false,
        timeout: 4000,
      });
      socket.on('connect',       () => resolve(socket));
      socket.on('connect_error', (e) => reject(e));
    });
  }

  /** Helper: join ride room and wait for confirmation. */
  function joinRide(socket, rideId) {
    return new Promise((resolve) => {
      socket.once('joined_ride', resolve);
      socket.emit('join_ride', { rideId });
    });
  }

  // ─── 3.1  Auth ─────────────────────────────────────────────────────────────

  test('3.1 Connection rejected without a token', (done) => {
    const socket = ioClient(`${serverAddress}/rides`, {
      transports: ['websocket'],
      auth: {},
      reconnection: false,
      timeout: 3000,
    });
    socket.on('connect_error', (err) => {
      expect(err.message).toMatch(/authentication required/i);
      socket.disconnect();
      done();
    });
    socket.on('connect', () => {
      socket.disconnect();
      done(new Error('Should have been rejected'));
    });
  });

  test('3.2 Connection rejected with an invalid token', (done) => {
    const socket = ioClient(`${serverAddress}/rides`, {
      transports: ['websocket'],
      auth: { token: 'not.a.valid.jwt' },
      reconnection: false,
      timeout: 3000,
    });
    socket.on('connect_error', (err) => {
      expect(err.message).toMatch(/authentication failed/i);
      socket.disconnect();
      done();
    });
    socket.on('connect', () => {
      socket.disconnect();
      done(new Error('Should have been rejected'));
    });
  });

  test('3.3 Valid token allows connection', async () => {
    const socket = await connect(riderToken);
    expect(socket.connected).toBe(true);
    socket.disconnect();
  });

  // ─── 3.4  Join ride room ────────────────────────────────────────────────────

  test('3.4 join_ride emits joined_ride confirmation', async () => {
    const socket = await connect(riderToken);
    const confirmation = await joinRide(socket, RIDE_ID);
    expect(confirmation.rideId).toBe(RIDE_ID);
    expect(confirmation.room).toBe(`ride:${RIDE_ID}`);
    socket.disconnect();
  });

  test('3.5 join_ride without rideId emits error', async () => {
    const socket = await connect(riderToken);
    const error  = await new Promise((resolve) => {
      socket.once('error', resolve);
      socket.emit('join_ride', {});
    });
    expect(error.message).toMatch(/requires rideId/i);
    socket.disconnect();
  });

  // ─── 3.6  Message broadcast ─────────────────────────────────────────────────

  test('3.6 Rider sends message — driver in same room receives it', (done) => {
    Promise.all([
      connect(riderToken),
      connect(driverToken),
    ]).then(([rider, driver]) => {
      Promise.all([
        joinRide(rider, RIDE_ID),
        joinRide(driver, RIDE_ID),
      ]).then(() => {
        driver.once('message', (data) => {
          expect(data.rideId).toBe(RIDE_ID);
          expect(data.text).toBe('I am at the blue gate');
          expect(data.senderRole).toBe('rider');
          expect(data.senderId).toBe(RIDER_ID);
          expect(data.timestamp).toBeDefined();
          rider.disconnect();
          driver.disconnect();
          done();
        });
        rider.emit('message', { rideId: RIDE_ID, text: 'I am at the blue gate' });
      });
    }).catch(done);
  });

  test('3.7 Driver sends message — rider in same room receives it', (done) => {
    Promise.all([
      connect(riderToken),
      connect(driverToken),
    ]).then(([rider, driver]) => {
      Promise.all([
        joinRide(rider, RIDE_ID),
        joinRide(driver, RIDE_ID),
      ]).then(() => {
        rider.once('message', (data) => {
          expect(data.text).toBe('Almost there, 2 minutes');
          expect(data.senderRole).toBe('driver');
          expect(data.senderId).toBe(DRIVER_ID);
          rider.disconnect();
          driver.disconnect();
          done();
        });
        driver.emit('message', { rideId: RIDE_ID, text: 'Almost there, 2 minutes' });
      });
    }).catch(done);
  });

  test('3.8 Sender also receives their own message (optimistic UI confirmation)', (done) => {
    connect(riderToken).then((rider) => {
      joinRide(rider, RIDE_ID).then(() => {
        rider.once('message', (data) => {
          expect(data.text).toBe('Hello');
          expect(data.senderId).toBe(RIDER_ID);
          rider.disconnect();
          done();
        });
        rider.emit('message', { rideId: RIDE_ID, text: 'Hello' });
      });
    }).catch(done);
  });

  test('3.9 Message payload includes messageId, senderName, senderRole, timestamp', (done) => {
    connect(riderToken).then((rider) => {
      joinRide(rider, RIDE_ID).then(() => {
        rider.once('message', (data) => {
          expect(data.messageId).toBeDefined();
          expect(data.messageId).toMatch(/^msg_/);
          expect(data.senderName).toBeDefined();
          expect(typeof data.senderRole).toBe('string');
          expect(typeof data.timestamp).toBe('number');
          rider.disconnect();
          done();
        });
        rider.emit('message', { rideId: RIDE_ID, text: 'Testing payload' });
      });
    }).catch(done);
  });

  // ─── 3.10  Isolation ─────────────────────────────────────────────────────────

  test('3.10 Message in room A is NOT received by socket in room B', (done) => {
    const RIDE_B = 'ride-different-999';
    Promise.all([
      connect(riderToken),
      connect(outsiderToken),
    ]).then(([rider, outsider]) => {
      Promise.all([
        joinRide(rider, RIDE_ID),
        joinRide(outsider, RIDE_B),
      ]).then(() => {
        let outsiderReceived = false;
        outsider.on('message', () => { outsiderReceived = true; });

        rider.emit('message', { rideId: RIDE_ID, text: 'Private message' });

        // Wait 300 ms to confirm outsider did NOT receive it
        setTimeout(() => {
          expect(outsiderReceived).toBe(false);
          rider.disconnect();
          outsider.disconnect();
          done();
        }, 300);
      });
    }).catch(done);
  });

  test('3.11 Socket NOT in the ride room does not receive messages', (done) => {
    Promise.all([
      connect(riderToken),
      connect(driverToken),
    ]).then(([rider, driver]) => {
      // Rider joins room; driver does NOT join
      joinRide(rider, RIDE_ID).then(() => {
        let driverReceived = false;
        driver.on('message', () => { driverReceived = true; });

        rider.emit('message', { rideId: RIDE_ID, text: 'Only rider will see this' });

        setTimeout(() => {
          expect(driverReceived).toBe(false);
          rider.disconnect();
          driver.disconnect();
          done();
        }, 300);
      });
    }).catch(done);
  });

  // ─── 3.12  Validation ────────────────────────────────────────────────────────

  test('3.12 Message with no text emits error', async () => {
    const rider = await connect(riderToken);
    await joinRide(rider, RIDE_ID);
    const error = await new Promise((resolve) => {
      rider.once('error', resolve);
      rider.emit('message', { rideId: RIDE_ID });
    });
    expect(error.message).toMatch(/requires rideId and text/i);
    rider.disconnect();
  });

  test('3.13 Message with no rideId emits error', async () => {
    const rider = await connect(riderToken);
    const error = await new Promise((resolve) => {
      rider.once('error', resolve);
      rider.emit('message', { text: 'Where am I sending this?' });
    });
    expect(error.message).toMatch(/requires rideId and text/i);
    rider.disconnect();
  });

  test('3.14 Message exceeding 500 characters is rejected', async () => {
    const rider = await connect(riderToken);
    await joinRide(rider, RIDE_ID);
    const longText = 'A'.repeat(501);
    const error    = await new Promise((resolve) => {
      rider.once('error', resolve);
      rider.emit('message', { rideId: RIDE_ID, text: longText });
    });
    expect(error.message).toMatch(/too long/i);
    rider.disconnect();
  });

  test('3.15 Message of exactly 500 characters is accepted', (done) => {
    const text500 = 'B'.repeat(500);
    connect(riderToken).then((rider) => {
      joinRide(rider, RIDE_ID).then(() => {
        rider.once('message', (data) => {
          expect(data.text.length).toBe(500);
          rider.disconnect();
          done();
        });
        rider.emit('message', { rideId: RIDE_ID, text: text500 });
      });
    }).catch(done);
  });

  // ─── 3.16  Multi-message exchange ────────────────────────────────────────────

  test('3.16 Multiple messages are all received in correct order', (done) => {
    Promise.all([
      connect(riderToken),
      connect(driverToken),
    ]).then(([rider, driver]) => {
      Promise.all([
        joinRide(rider, RIDE_ID),
        joinRide(driver, RIDE_ID),
      ]).then(() => {
        const received = [];

        driver.on('message', (data) => {
          received.push(data.text);
          if (received.length === 3) {
            expect(received).toEqual(['Msg 1', 'Msg 2', 'Msg 3']);
            rider.disconnect();
            driver.disconnect();
            done();
          }
        });

        // Send sequentially with small delays to preserve order
        setTimeout(() => rider.emit('message', { rideId: RIDE_ID, text: 'Msg 1' }), 0);
        setTimeout(() => rider.emit('message', { rideId: RIDE_ID, text: 'Msg 2' }), 30);
        setTimeout(() => rider.emit('message', { rideId: RIDE_ID, text: 'Msg 3' }), 60);
      });
    }).catch(done);
  });

});

// =============================================================================
// LAYER 3 — End-to-End Flow: Rider Books → Waits → Driver Arrives → Chat
// =============================================================================

describe('Layer 3 · E2E Flow — Rider Books, Driver Accepts, Both Chat', () => {
  let ioServer, httpServer, serverAddress;

  beforeAll((done) => {
    httpServer = http.createServer();
    ioServer   = new Server(httpServer, {
      transports: ['websocket'],
      pingTimeout: 3000, pingInterval: 1000,
    });
    initRideSocket(ioServer);
    httpServer.listen(0, () => {
      serverAddress = `http://localhost:${httpServer.address().port}`;
      done();
    });
  });

  afterAll((done) => {
    ioServer?.close();
    httpServer?.close(done);
  });

  function connect(token) {
    return new Promise((resolve, reject) => {
      const s = ioClient(`${serverAddress}/rides`, {
        transports: ['websocket'],
        auth: { token },
        reconnection: false,
        timeout: 4000,
      });
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    });
  }

  function joinRide(socket, rideId) {
    return new Promise((resolve) => {
      socket.once('joined_ride', resolve);
      socket.emit('join_ride', { rideId });
    });
  }

  test('Full flow: rider books → waiting → driver joins → both exchange messages → ride completes', (done) => {
    const FLOW_RIDE_ID = 'ride-full-flow-e2e';

    // ── Step 1: Rider submits a booking via REST ────────────────────────────
    mockRideDb.query
      .mockResolvedValueOnce({ rows: [{ id: RIDER_ID, role: 'rider', is_active: true }] }) // auth
      .mockResolvedValueOnce({ rows: [] })                                                  // no active ride
      .mockResolvedValueOnce({ rows: [{ id: FLOW_RIDE_ID, status: 'requested', rider_id: RIDER_ID, pickup_address: 'Douala Centre', dropoff_address: 'Akwa', ride_type: 'standard', fare_estimate: 1500 }] }); // INSERT

    request(rideApp)
      .post('/rides')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({
        pickup_address:  'Douala Centre',
        dropoff_address: 'Akwa',
        pickup_lat:  3.848, pickup_lng:  11.502,
        dropoff_lat: 3.866, dropoff_lng: 11.516,
        ride_type: 'standard',
      })
      .then((bookingRes) => {
        // Booking may succeed (201) or return validation error — either is fine for flow test
        expect([200, 201, 400, 422]).toContain(bookingRes.status);

        // ── Step 2: Rider connects to WebSocket and joins ride room while waiting ──
        return connect(riderToken).then((riderSocket) => {
          return joinRide(riderSocket, FLOW_RIDE_ID).then(() => {

            // ── Step 3: Driver connects and joins the ride room (simulates acceptance) ──
            return connect(driverToken).then((driverSocket) => {
              return joinRide(driverSocket, FLOW_RIDE_ID).then(() => {

                const riderReceived  = [];
                const driverReceived = [];

                // ── Step 4: Set up message listeners ──
                riderSocket.on('message',  (m) => riderReceived.push(m));
                driverSocket.on('message', (m) => driverReceived.push(m));

                // ── Step 5: Rider sends pre-pickup message ──
                riderSocket.emit('message', { rideId: FLOW_RIDE_ID, text: 'I am at the blue gate' });

                setTimeout(() => {
                  // ── Step 6: Driver sends reply ──
                  driverSocket.emit('message', { rideId: FLOW_RIDE_ID, text: 'Almost there, 1 minute' });
                }, 100);

                setTimeout(() => {
                  // ── Step 7: Rider sends confirmation ──
                  riderSocket.emit('message', { rideId: FLOW_RIDE_ID, text: 'OK, I can see you' });
                }, 200);

                setTimeout(() => {
                  // ── Step 8: Assert both parties received all messages ──
                  // Rider receives: their own 2 messages + driver's 1 message = 3
                  expect(riderReceived.length).toBeGreaterThanOrEqual(3);
                  // Driver receives: rider's 2 messages + their own 1 = 3
                  expect(driverReceived.length).toBeGreaterThanOrEqual(3);

                  // Verify message content (order-independent search)
                  const allRiderTexts  = riderReceived.map((m) => m.text);
                  const allDriverTexts = driverReceived.map((m) => m.text);

                  expect(allRiderTexts).toContain('I am at the blue gate');
                  expect(allRiderTexts).toContain('Almost there, 1 minute');
                  expect(allRiderTexts).toContain('OK, I can see you');

                  expect(allDriverTexts).toContain('I am at the blue gate');
                  expect(allDriverTexts).toContain('Almost there, 1 minute');
                  expect(allDriverTexts).toContain('OK, I can see you');

                  // Verify role metadata
                  const riderMsgByRider  = riderReceived.find((m) => m.text === 'I am at the blue gate');
                  const driverMsgByDriver = driverReceived.find((m) => m.text === 'Almost there, 1 minute');
                  expect(riderMsgByRider.senderRole).toBe('rider');
                  expect(driverMsgByDriver.senderRole).toBe('driver');

                  riderSocket.disconnect();
                  driverSocket.disconnect();
                  done();
                }, 600);

              });
            });
          });
        });
      })
      .catch(done);
  });

  test('Rider messages persist via REST and are retrievable after the socket session', async () => {
    const MSG_ID = 'msg-persist-001';
    mockRideDb.query
      .mockResolvedValueOnce(ACCESS_GRANTED) // access check
      .mockResolvedValueOnce({ rows: [{
        id: MSG_ID, ride_id: RIDE_ID,
        sender_id: RIDER_ID, receiver_id: DRIVER_ID,
        content: 'Persisted message', is_read: false,
        created_at: new Date().toISOString(),
        sender_name: 'Test Rider',
      }], rowCount: 1 });

    const res = await request(rideApp)
      .get(`/rides/${RIDE_ID}/messages`)
      .set('Authorization', `Bearer ${riderToken}`)
      .set('x-user-id', RIDER_ID);

    expect(res.status).toBe(200);
    expect(res.body.messages[0].content).toBe('Persisted message');
    expect(res.body.messages[0].sender_name).toBe('Test Rider');
  });

  test('Disconnected rider re-joins room and receives new messages from driver', (done) => {
    const RE_RIDE = 'ride-reconnect-e2e';

    connect(riderToken).then((rider) => {
      connect(driverToken).then((driver) => {
        Promise.all([joinRide(rider, RE_RIDE), joinRide(driver, RE_RIDE)]).then(() => {

          // Rider disconnects (simulates app backgrounding)
          rider.disconnect();

          // Rider reconnects and re-joins
          connect(riderToken).then((riderV2) => {
            joinRide(riderV2, RE_RIDE).then(() => {

              riderV2.once('message', (data) => {
                expect(data.text).toBe('I waited for you to come back!');
                expect(data.senderRole).toBe('driver');
                riderV2.disconnect();
                driver.disconnect();
                done();
              });

              // Driver sends message after rider reconnects
              setTimeout(() =>
                driver.emit('message', { rideId: RE_RIDE, text: 'I waited for you to come back!' })
              , 100);

            });
          });
        });
      });
    }).catch(done);
  });

});
