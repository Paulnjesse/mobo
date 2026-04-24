/**
 * offlineQueue.js — Durable offline request queue for critical operations
 *
 * Problem: When the network is completely absent (tunnel, basement, remote area)
 * a ride booking or payment POST silently fails. The user has no feedback and
 * must retry manually once connectivity returns.
 *
 * Solution: Queue critical POST/PATCH operations in AsyncStorage. When the
 * network is restored (detected by NetInfo), drain the queue in FIFO order.
 *
 * Scope: Only ride booking requests and safe retries are queued here.
 * Payment mutations are NOT queued offline — they require real-time
 * confirmation and must be re-initiated by the user for safety.
 *
 * Usage:
 *   import { enqueueRequest, drainQueue, getQueueLength } from './offlineQueue';
 *
 *   // To queue a ride request when offline:
 *   await enqueueRequest({
 *     method: 'POST',
 *     url: '/rides',
 *     data: ridePayload,
 *     idempotencyKey: uuid(),   // must be unique per booking attempt
 *   });
 *
 *   // Call on NetInfo 'connected' event:
 *   await drainQueue(api);
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY     = '@mobo:offlineQueue';
const MAX_QUEUE     = 20;       // prevent unbounded growth
const MAX_AGE_MS    = 5 * 60 * 1000;  // 5 minutes — stale entries are dropped

/**
 * @typedef {Object} QueuedRequest
 * @property {string}  id              — UUID (idempotency key)
 * @property {string}  method          — HTTP method
 * @property {string}  url             — relative URL path
 * @property {object}  [data]          — request body
 * @property {object}  [headers]       — additional headers
 * @property {number}  queuedAt        — timestamp ms
 */

/** Load the queue from AsyncStorage. Returns [] on error. */
async function loadQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Persist the queue to AsyncStorage. */
async function saveQueue(queue) {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // non-fatal — worst case the queue is lost on app restart
  }
}

/**
 * Add a request to the offline queue.
 * Returns false if the queue is full (user should be warned).
 *
 * @param {Omit<QueuedRequest, 'queuedAt'>} request
 * @returns {Promise<boolean>}
 */
export async function enqueueRequest(request) {
  const queue = await loadQueue();
  if (queue.length >= MAX_QUEUE) return false;
  queue.push({ ...request, queuedAt: Date.now() });
  await saveQueue(queue);
  return true;
}

/** Return the number of queued requests. */
export async function getQueueLength() {
  const queue = await loadQueue();
  return queue.length;
}

/**
 * Drain the queue: replay each request using the provided axios instance.
 * Requests older than MAX_AGE_MS are dropped without replay.
 * Requests that succeed (2xx) or fail with 4xx (not retryable) are dequeued.
 * Requests that fail with 5xx are kept for the next drain attempt.
 *
 * @param {import('axios').AxiosInstance} axiosInstance
 * @returns {Promise<{ replayed: number, dropped: number, failed: number }>}
 */
export async function drainQueue(axiosInstance) {
  const queue = await loadQueue();
  if (queue.length === 0) return { replayed: 0, dropped: 0, failed: 0 };

  const now = Date.now();
  const remaining = [];
  let replayed = 0;
  let dropped  = 0;
  let failed   = 0;

  for (const req of queue) {
    // Drop stale entries
    if (now - req.queuedAt > MAX_AGE_MS) {
      dropped++;
      continue;
    }

    try {
      await axiosInstance({
        method:  req.method,
        url:     req.url,
        data:    req.data,
        headers: {
          ...(req.headers || {}),
          'Idempotency-Key': req.id,   // server deduplicates using this key
        },
      });
      replayed++;
    } catch (err) {
      const status = err?.response?.status;
      // 4xx → the request is invalid; drop it (user must retry with corrected data)
      // 5xx or network error → keep in queue for next drain
      if (status && status >= 400 && status < 500) {
        dropped++;
      } else {
        remaining.push(req);
        failed++;
      }
    }
  }

  await saveQueue(remaining);
  return { replayed, dropped, failed };
}

/** Clear the entire queue (e.g., on logout). */
export async function clearQueue() {
  await AsyncStorage.removeItem(QUEUE_KEY);
}
