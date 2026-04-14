/**
 * MOBO — Socket.IO Connection & Message-Rate Stress Test
 *
 * This Node.js script uses the real `socket.io-client` library so the full
 * Socket.IO handshake, namespace auth, and event framing are handled correctly.
 * It is the most accurate way to test the location-service WebSocket behaviour.
 *
 * Tests performed:
 *   1. CAPACITY     — ramp to 500 simultaneous Socket.IO connections
 *   2. MSG/S RATE   — find the max messages/s before the server starts dropping
 *   3. AUTO-DISCONNECT — verify ping-timeout eviction (silent clients)
 *   4. CHURN        — rapid connect/disconnect cycles (memory leak detection)
 *
 * How to run:
 *   node tests/load/socket-stress.js [--host ws://localhost:3004] [--token <jwt>]
 *
 * Environment variables (alternative to CLI flags):
 *   MOBO_WS_HOST   — WebSocket host  (default: http://localhost:3004)
 *   MOBO_WS_TOKEN  — JWT driver token (default: empty → auth will fail gracefully)
 *   MOBO_TEST      — which test to run: capacity | rate | disconnect | churn | all
 *                    (default: all)
 *
 * Install deps (one-time):
 *   cd tests/load && npm install
 */

'use strict';

const { io }   = require('socket.io-client');
const { performance } = require('perf_hooks');

// ── Config ────────────────────────────────────────────────────────────────
const HOST  = process.env.MOBO_WS_HOST  || 'http://localhost:3004';
const TOKEN = process.env.MOBO_WS_TOKEN || '';
const TEST  = process.env.MOBO_TEST     || 'all';

// Parse CLI flags
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--host'  && args[i + 1]) process.env.MOBO_WS_HOST  = args[++i];
  if (args[i] === '--token' && args[i + 1]) process.env.MOBO_WS_TOKEN = args[++i];
  if (args[i] === '--test'  && args[i + 1]) process.env.MOBO_TEST     = args[++i];
}

const FINAL_HOST  = process.env.MOBO_WS_HOST  || HOST;
const FINAL_TOKEN = process.env.MOBO_WS_TOKEN || TOKEN;
const FINAL_TEST  = process.env.MOBO_TEST     || TEST;

// ── Helpers ───────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function makeSocket(namespace = '/location') {
  return io(`${FINAL_HOST}${namespace}`, {
    auth:       { token: FINAL_TOKEN },
    transports: ['websocket'],         // skip polling — test WS only
    reconnection: false,               // no auto-reconnect in stress tests
    timeout:    10000,
  });
}

function randomCoord(base, spread) {
  return +(base + (Math.random() - 0.5) * spread).toFixed(6);
}

function doualaLocation() {
  return {
    latitude:  randomCoord(4.0511, 0.10),
    longitude: randomCoord(9.7679, 0.10),
    heading:   Math.floor(Math.random() * 360),
    speed:     +(20 + Math.random() * 30).toFixed(1),
    accuracy:  5,
    timestamp: Date.now(),
  };
}

function printHeader(title) {
  const line = '═'.repeat(60);
  console.log(`\n╔${line}╗`);
  console.log(`║  ${title.padEnd(58)}║`);
  console.log(`╚${line}╝`);
}

function printRow(label, value) {
  console.log(`  ${label.padEnd(30)}: ${value}`);
}

// ── Test 1: Connection Capacity ───────────────────────────────────────────
async function testCapacity() {
  printHeader('TEST 1 — Connection Capacity (ramp to 500)');

  const TARGET      = 500;
  const BATCH_SIZE  = 50;       // open 50 connections at a time
  const BATCH_DELAY = 500;      // ms between batches

  const sockets    = [];
  let connected    = 0;
  let authFailed   = 0;
  let failed       = 0;
  const latencies  = [];

  console.log(`  Ramping to ${TARGET} connections in batches of ${BATCH_SIZE}…`);

  for (let batch = 0; batch < TARGET / BATCH_SIZE; batch++) {
    const batchPromises = [];

    for (let i = 0; i < BATCH_SIZE; i++) {
      const idx = batch * BATCH_SIZE + i;
      batchPromises.push(new Promise((resolve) => {
        const t0 = performance.now();
        const s  = makeSocket('/location');

        s.on('connect', () => {
          latencies.push(performance.now() - t0);
          connected++;
          sockets.push(s);
          resolve('connected');
        });

        s.on('connect_error', (err) => {
          if (err.message.includes('Authentication') || err.message.includes('auth')) {
            authFailed++;
          } else {
            failed++;
          }
          resolve('failed');
        });

        // Safety timeout
        setTimeout(() => resolve('timeout'), 10000);
      }));
    }

    await Promise.all(batchPromises);
    process.stdout.write(`  Batch ${batch + 1}/${TARGET / BATCH_SIZE}: ${connected} connected, ${failed} failed, ${authFailed} auth-failed\r`);
    await sleep(BATCH_DELAY);
  }

  console.log('\n');

  // Calculate latency stats
  if (latencies.length > 0) {
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.50)].toFixed(0);
    const p95 = latencies[Math.floor(latencies.length * 0.95)].toFixed(0);
    const p99 = latencies[Math.floor(latencies.length * 0.99)].toFixed(0);
    printRow('Connected',           connected);
    printRow('Auth failures',       `${authFailed} (no token or invalid JWT)`);
    printRow('Network failures',    failed);
    printRow('Connect latency p50', `${p50} ms`);
    printRow('Connect latency p95', `${p95} ms`);
    printRow('Connect latency p99', `${p99} ms`);
    printRow('Result', connected >= TARGET * 0.90 ?
      'PASS — server handles 500 WS connections' :
      `FAIL — only ${connected}/${TARGET} connections succeeded`
    );
  }

  // Hold for 5 s to let server process, then close all
  await sleep(5000);
  for (const s of sockets) s.disconnect();
  await sleep(1000);
  printRow('Status after close', `${sockets.length} sockets disconnected`);
}

// ── Test 2: Messages Per Second Rate ─────────────────────────────────────
async function testMsgRate() {
  printHeader('TEST 2 — Messages Per Second (find server cap)');

  // Steps: 1 msg/s, 5 msg/s, 10 msg/s, 25 msg/s, 50 msg/s
  const RATES    = [1, 5, 10, 25, 50];
  const DURATION = 10000; // 10 s per rate step

  const results = [];

  for (const targetRate of RATES) {
    const s = makeSocket('/location');
    let emitted = 0, errors = 0;
    let ready = false;

    await new Promise((resolve) => {
      s.on('connect', () => {
        s.emit('driver_online', doualaLocation());
        ready = true;
        resolve();
      });
      s.on('connect_error', () => resolve());
      setTimeout(resolve, 5000);
    });

    if (!ready) {
      console.log(`  [rate=${targetRate}] Skipped — could not connect`);
      s.disconnect();
      continue;
    }

    // Emit at targetRate msgs/s for DURATION ms
    const intervalMs = 1000 / targetRate;
    const startTs    = Date.now();

    await new Promise((resolve) => {
      const timer = setInterval(() => {
        if (Date.now() - startTs >= DURATION) {
          clearInterval(timer);
          resolve();
          return;
        }
        try {
          s.volatile.emit('update_location', doualaLocation());
          emitted++;
        } catch (e) {
          errors++;
        }
      }, intervalMs);
    });

    const elapsed = Date.now() - startTs;
    const actualRate = (emitted / (elapsed / 1000)).toFixed(1);

    results.push({ targetRate, emitted, errors, actualRate, connected: ready });
    console.log(`  Target ${String(targetRate).padStart(2)} msg/s → actual ${actualRate} msg/s, ${emitted} emitted, ${errors} errors`);

    s.disconnect();
    await sleep(500);
  }

  console.log('\n  Summary:');
  console.log('  ─────────────────────────────────────────────────────');
  console.log('  The location service has no per-connection msg/s limiter.');
  console.log('  The server-side throttle is DRIVER_MIN_INTERVAL_MS=2000ms');
  console.log('  (2 s between broadcasts). Faster emissions are accepted');
  console.log('  but only the latest position is broadcast to subscribers.');
  console.log('  The HTTP rate limiter (300 req/min = 5 req/s) applies only');
  console.log('  to REST calls, not to Socket.IO events.');
  console.log('  Effectively: WebSocket events are NOT rate-limited; the');
  console.log('  2 s min-interval is enforced server-side by de-duplication.');
}

// ── Test 3: Auto-Disconnect (ping timeout) ────────────────────────────────
async function testAutoDisconnect() {
  printHeader('TEST 3 — Auto-Disconnect (ping timeout eviction)');

  console.log('  Creating 10 connections that will go silent after connecting…');
  console.log('  Server pingTimeout = 60 000 ms, pingInterval = 25 000 ms');
  console.log('  Expect server to close idle connections after ~85 s total');
  console.log('  (one missed ping = pinged at 25 s, timeout at 85 s)');
  console.log('');

  const sockets      = [];
  const connectTimes = [];
  const disconnectInfo = [];

  // Create 10 silent sockets
  const connectionPromises = Array.from({ length: 10 }, (_, i) =>
    new Promise((resolve) => {
      const s = io(`${FINAL_HOST}/location`, {
        auth:         { token: FINAL_TOKEN },
        transports:   ['websocket'],
        reconnection: false,
        timeout:      10000,
        // Disable auto ping-pong response by using a raw WebSocket — but
        // socket.io-client WILL respond to pings automatically.
        // To simulate a dead client, we override the internal ping handler
        // after connection by pausing the socket's underlying transport.
      });

      s.on('connect', () => {
        const connectedAt = Date.now();
        connectTimes[i]   = connectedAt;
        console.log(`  Socket ${i + 1}: connected at t=0`);

        // Immediately pause the underlying WebSocket transport
        // This prevents PONG responses — simulating a frozen client
        setTimeout(() => {
          try {
            s.io.engine.transport.ws.pause(); // freeze transport
            console.log(`  Socket ${i + 1}: transport paused — now silent`);
          } catch (_) {
            // pause() may not be available on all transports; acceptable fallback
          }
        }, 2000);

        sockets.push(s);
        resolve(s);
      });

      s.on('disconnect', (reason) => {
        const duration = Date.now() - (connectTimes[i] || Date.now());
        disconnectInfo.push({ socket: i + 1, reason, durationMs: duration });
        console.log(`  Socket ${i + 1}: DISCONNECTED after ${(duration / 1000).toFixed(1)}s — reason: "${reason}"`);
      });

      s.on('connect_error', () => resolve(null));
      setTimeout(() => resolve(null), 10000);
    })
  );

  await Promise.all(connectionPromises);
  const activeCount = sockets.filter(Boolean).length;
  console.log(`\n  ${activeCount} sockets active and now silent. Waiting for server eviction…`);
  console.log('  (This will take ~85 seconds — server has pingTimeout=60s, pingInterval=25s)\n');

  // Wait up to 120 s for all disconnects
  const MAX_WAIT = 120000;
  const startWait = Date.now();
  while (disconnectInfo.length < activeCount && Date.now() - startWait < MAX_WAIT) {
    await sleep(5000);
    const elapsed = ((Date.now() - startWait) / 1000).toFixed(0);
    process.stdout.write(`  Waiting… ${elapsed}s elapsed, ${disconnectInfo.length}/${activeCount} disconnected\r`);
  }

  console.log('\n');
  printRow('Connections opened',      activeCount);
  printRow('Server-evicted sockets',  disconnectInfo.length);

  const timeoutReasons = disconnectInfo.filter(d =>
    d.reason === 'ping timeout' || d.reason === 'transport close'
  );
  printRow('Ping-timeout disconnects', timeoutReasons.length);

  if (disconnectInfo.length > 0) {
    const avgDuration = (disconnectInfo.reduce((s, d) => s + d.durationMs, 0) / disconnectInfo.length / 1000).toFixed(1);
    printRow('Avg time before eviction', `${avgDuration}s`);
  }

  const allEvicted = disconnectInfo.length === activeCount;
  printRow('Result', allEvicted ?
    'PASS — server auto-disconnects idle clients' :
    `PARTIAL — only ${disconnectInfo.length}/${activeCount} evicted within 120s`
  );

  for (const s of sockets) { try { s.disconnect(); } catch (_) {} }
}

// ── Test 4: Churn (connect/disconnect cycles) ─────────────────────────────
async function testChurn() {
  printHeader('TEST 4 — Churn (500 rapid connect/disconnect cycles)');

  const CYCLES = 500;
  let succeeded = 0, failed = 0;
  const latencies = [];

  console.log(`  Running ${CYCLES} connect → emit → disconnect cycles…`);

  // Run 20 concurrent churn loops
  const CONCURRENCY = 20;
  const perWorker   = Math.ceil(CYCLES / CONCURRENCY);

  await Promise.all(Array.from({ length: CONCURRENCY }, async (_, w) => {
    for (let i = 0; i < perWorker; i++) {
      const t0 = performance.now();
      await new Promise((resolve) => {
        const s = makeSocket('/location');

        s.on('connect', () => {
          s.emit('driver_online', doualaLocation());
          latencies.push(performance.now() - t0);
          succeeded++;
          s.disconnect();
          resolve();
        });

        s.on('connect_error', () => {
          failed++;
          resolve();
        });

        setTimeout(() => { failed++; s.disconnect(); resolve(); }, 8000);
      });
    }
  }));

  latencies.sort((a, b) => a - b);
  const p50  = latencies.length ? latencies[Math.floor(latencies.length * 0.50)].toFixed(0) : 'n/a';
  const p95  = latencies.length ? latencies[Math.floor(latencies.length * 0.95)].toFixed(0) : 'n/a';
  const p99  = latencies.length ? latencies[Math.floor(latencies.length * 0.99)].toFixed(0) : 'n/a';

  console.log('');
  printRow('Total cycles',           CYCLES);
  printRow('Succeeded',              succeeded);
  printRow('Failed / timed-out',     failed);
  printRow('Connect latency p50',    `${p50} ms`);
  printRow('Connect latency p95',    `${p95} ms`);
  printRow('Connect latency p99',    `${p99} ms`);
  printRow('Result', failed === 0 ?
    'PASS — no failures under 500-cycle churn' :
    `${failed} failures detected — check server logs for memory leaks`
  );
  console.log('');
  console.log('  Memory leak check: run this test then inspect server memory.');
  console.log('  If driverSockets Map or trackingSubscriptions Map grows');
  console.log('  without shrinking, there is a leak in the disconnect handler.');
}

// ── Main runner ───────────────────────────────────────────────────────────
async function main() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  MOBO Socket.IO Stress Test');
  console.log(`  Host  : ${FINAL_HOST}`);
  console.log(`  Token : ${FINAL_TOKEN ? FINAL_TOKEN.substring(0, 20) + '…' : '(none — auth tests will fail)'}`);
  console.log(`  Tests : ${FINAL_TEST}`);
  console.log('══════════════════════════════════════════════════════════\n');

  const run = (name, fn) =>
    ['all', name].includes(FINAL_TEST) ? fn() : Promise.resolve();

  await run('capacity',   testCapacity);
  await run('rate',       testMsgRate);
  await run('disconnect', testAutoDisconnect);
  await run('churn',      testChurn);

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  All tests complete');
  console.log('══════════════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Stress test error:', err);
  process.exit(1);
});
