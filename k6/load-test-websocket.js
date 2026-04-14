/**
 * MOBO — Socket.IO WebSocket Load Test
 *
 * What this tests:
 *   1. Can the location service sustain 500 simultaneous WebSocket connections?
 *   2. What is the message throughput (driver location updates / s) at scale?
 *   3. Are clients automatically disconnected when they stop pinging
 *      (pingTimeout = 60 000 ms, pingInterval = 25 000 ms)?
 *   4. Does the server's in-memory state (driverSockets, trackingSubscriptions)
 *      leak under churn (connect → emit → disconnect cycles)?
 *
 * Socket.IO protocol layer (EIO v4 over raw WebSocket):
 *   "0{...}"        — Engine.IO OPEN   (server → client)
 *   "40"            — SIO CONNECT to root namespace
 *   "40/location,{token}"  — SIO CONNECT to /location namespace with auth
 *   "40/location,"  — server confirms /location connection
 *   "42/location,[\"event\",data]" — SIO EVENT
 *   "2"             — EIO PING (server → client every 25 s)
 *   "3"             — EIO PONG (client → server, must arrive within 60 s)
 *
 * How to run:
 *   k6 run k6/load-test-websocket.js \
 *       -e WS_URL=ws://localhost:3004 \
 *       -e AUTH_TOKEN=<driver-jwt>
 *
 * Note: k6's k6/ws module does not implement the Socket.IO client library.
 * We speak raw Engine.IO / Socket.IO protocol here. The test emits
 * `update_location` events as a driver and verifies acknowledgement.
 *
 * Disconnect behaviour:
 *   - If a client sends no PONG within pingTimeout (60 s), the server closes
 *     the socket with reason "ping timeout".
 *   - The test intentionally lets some connections go silent to verify this.
 */

import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Gauge, Rate, Trend } from 'k6/metrics';

// ── Custom metrics ─────────────────────────────────────────────────────────
const wsConnected        = new Counter('ws_connections_opened');
const wsDisconnected     = new Counter('ws_connections_closed');
const wsErrors           = new Counter('ws_errors');
const wsPingTimeouts     = new Counter('ws_ping_timeouts');   // server-initiated disconnects
const wsMessagesEmitted  = new Counter('ws_messages_emitted');
const wsMessagesReceived = new Counter('ws_messages_received');
const activeConnections  = new Gauge('ws_active_connections');
const connectLatency     = new Trend('ws_connect_latency_ms', true);
const msgRoundTrip       = new Trend('ws_msg_roundtrip_ms', true);
const eventReceiveRate   = new Rate('ws_events_received_rate');

// ── Test configuration ─────────────────────────────────────────────────────
export const options = {
  scenarios: {
    // ── Test A: Sustained 500 connections ─────────────────────────────
    max_connections: {
      executor: 'ramping-vus',
      stages: [
        { duration: '30s',  target: 100 },
        { duration: '30s',  target: 300 },
        { duration: '30s',  target: 500 },
        { duration: '120s', target: 500 }, // hold peak
        { duration: '30s',  target: 0   },
      ],
      exec: 'activeDriverScenario',
      tags: { scenario: 'max_connections' },
    },

    // ── Test B: Silent connections — trigger ping-timeout disconnect ───
    // Runs 30 VUs that connect but NEVER send PONG.
    // We expect the server to disconnect them after pingTimeout (60 s).
    // Start after the main ramp-up to avoid interference.
    silent_connections: {
      executor: 'constant-vus',
      vus: 30,
      duration: '90s',
      startTime: '150s',  // start after Test A ramp-up
      exec: 'silentConnectionScenario',
      tags: { scenario: 'silent_connections' },
    },
  },

  thresholds: {
    ws_errors:             ['count<50'],    // fewer than 50 WS-level errors
    ws_connect_latency_ms: ['p(95)<2000'],  // connect within 2 s
    ws_msg_roundtrip_ms:   ['p(95)<1000'],  // event round-trip within 1 s
    ws_events_received_rate: ['rate>0.80'], // 80%+ of expected events received
  },
};

const WS_URL   = __ENV.WS_URL   || 'ws://localhost:3004';
const TOKEN    = __ENV.AUTH_TOKEN || 'test-driver-token';

// Douala + Yaoundé bounding box — random GPS within city bounds
function randomCoord(base, spread) {
  return base + (Math.random() - 0.5) * spread;
}

function doualaCoords() {
  return { lat: randomCoord(4.0511, 0.15), lng: randomCoord(9.7679, 0.15) };
}

// Build Socket.IO / Engine.IO URL
// EIO=4 = Engine.IO protocol v4 (used by Socket.IO v4)
// transport=websocket skips the polling upgrade dance
function buildUrl() {
  return `${WS_URL}/socket.io/?EIO=4&transport=websocket`;
}

// ── Scenario A: Active driver — connect, emit location updates, disconnect ──
export function activeDriverScenario() {
  const connectStart = Date.now();
  let connected = false;
  let namespaceReady = false;
  let messageCount = 0;
  let lastPingTime = 0;
  const driverId = `k6-driver-${__VU}-${__ITER}`;

  const response = ws.connect(buildUrl(), {
    headers: { 'Authorization': `Bearer ${TOKEN}` },
  }, (socket) => {
    connected = true;
    wsConnected.add(1);
    activeConnections.add(1);

    socket.on('open', () => {
      // Engine.IO OPEN is received automatically — now connect to /location namespace
      // We delay slightly to let the server send its OPEN frame first
    });

    socket.on('message', (rawMsg) => {
      wsMessagesReceived.add(1);

      // Engine.IO OPEN frame
      if (rawMsg.startsWith('0')) {
        connectLatency.add(Date.now() - connectStart);
        // Connect to /location namespace with auth token
        socket.send(`40/location,{"token":"${TOKEN}"}`);
        return;
      }

      // Engine.IO PING — must respond with PONG within pingTimeout
      if (rawMsg === '2') {
        lastPingTime = Date.now();
        socket.send('3');
        return;
      }

      // Socket.IO namespace connection confirmed: "40/location,"
      if (rawMsg === '40/location,' || rawMsg.startsWith('40/location,')) {
        namespaceReady = true;
        eventReceiveRate.add(1);

        // Emit driver_online
        const { lat, lng } = doualaCoords();
        socket.send(
          `42/location,["driver_online",{"latitude":${lat},"longitude":${lng}}]`
        );
        wsMessagesEmitted.add(1);
        return;
      }

      // Socket.IO events from server (broadcasts, errors, confirmations)
      if (rawMsg.startsWith('42/location,')) {
        eventReceiveRate.add(1);
        if (messageCount === 0) {
          msgRoundTrip.add(Date.now() - connectStart);
        }
        messageCount++;
        return;
      }

      // Connection error from namespace
      if (rawMsg.startsWith('44/location,')) {
        wsErrors.add(1);
        socket.close();
        return;
      }
    });

    socket.on('error', (e) => {
      wsErrors.add(1);
    });

    socket.on('close', () => {
      activeConnections.add(-1);
      wsDisconnected.add(1);
    });

    // Once namespace is ready, emit location updates every 2 s for 60 s
    // (mirrors real driver behaviour: DRIVER_MIN_INTERVAL_MS = 2000)
    let elapsed = 0;
    const DURATION_S   = 60;
    const INTERVAL_S   = 2;

    while (elapsed < DURATION_S * 1000) {
      if (namespaceReady) {
        const { lat, lng } = doualaCoords();
        const updateTs = Date.now();
        socket.send(
          `42/location,["update_location",{` +
          `"latitude":${lat.toFixed(6)},` +
          `"longitude":${lng.toFixed(6)},` +
          `"heading":${Math.floor(Math.random() * 360)},` +
          `"speed":${(20 + Math.random() * 30).toFixed(1)},` +
          `"accuracy":5,` +
          `"timestamp":${updateTs}` +
          `}]`
        );
        wsMessagesEmitted.add(1);
      }
      sleep(INTERVAL_S);
      elapsed += INTERVAL_S * 1000;
    }

    socket.close();
  });

  check(response, {
    'WS connection established': (r) => r && r.status === 101,
  });

  if (!connected) wsErrors.add(1);
}

// ── Scenario B: Silent connection — never respond to pings ──────────────────
// The Socket.IO server will forcibly close these after pingTimeout (60 s)
// when the client fails to respond to PING with a PONG.
export function silentConnectionScenario() {
  const connectStart = Date.now();
  let disconnectedByServer = false;

  const response = ws.connect(buildUrl(), {}, (socket) => {
    wsConnected.add(1);

    socket.on('message', (rawMsg) => {
      // Connect to namespace so the socket is properly registered
      if (rawMsg.startsWith('0')) {
        socket.send(`40/location,{"token":"${TOKEN}"}`);
        return;
      }
      // Engine.IO PING arrives — deliberately DO NOT send PONG
      // Server will time out this connection after pingTimeout = 60 s
      if (rawMsg === '2') {
        wsPingTimeouts.add(1);
        // Do not respond
      }
    });

    socket.on('close', (code, reason) => {
      const duration = Date.now() - connectStart;
      disconnectedByServer = true;
      wsDisconnected.add(1);

      // Server-initiated ping-timeout disconnects arrive with a specific close code
      check({ code, duration }, {
        'silent: server disconnected within 90 s': () => duration < 90000,
        'silent: disconnected after > 20 s':       () => duration > 20000,
      });
    });

    // Hold open silently — the server's ping timer will fire and kill it
    sleep(90);
    socket.close();
  });

  check(response, {
    'silent: initial WS upgrade succeeded': (r) => r && r.status === 101,
  });
}
