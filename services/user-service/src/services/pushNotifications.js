/**
 * MOBO Push Notification Service — user-service
 * Sends push notifications via Expo Push Notification API.
 * Handles chunking, receipts, and DB persistence.
 */

const { Expo } = require('expo-server-sdk');
const db = require('../config/database');

const expo = new Expo();

/**
 * sendPushNotification(expoPushToken, title, body, data)
 * Sends a single push notification to one device.
 *
 * @param {string} expoPushToken  - Expo push token (ExponentPushToken[...])
 * @param {string} title          - Notification title
 * @param {string} body           - Notification body text
 * @param {object} data           - Optional extra data payload
 * @returns {{ success: boolean, ticket?: object, error?: string }}
 */
async function sendPushNotification(expoPushToken, title, body, data = {}) {
  if (!expoPushToken) {
    return { success: false, error: 'No push token provided' };
  }

  if (!Expo.isExpoPushToken(expoPushToken)) {
    console.warn(`[PushNotification] Invalid Expo push token: ${expoPushToken}`);
    return { success: false, error: 'Invalid Expo push token' };
  }

  const message = {
    to: expoPushToken,
    sound: 'default',
    title,
    body,
    data
  };

  try {
    const chunks = expo.chunkPushNotifications([message]);
    let ticket = null;

    for (const chunk of chunks) {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      ticket = ticketChunk[0];
      if (ticket.status === 'error') {
        console.error('[PushNotification] Ticket error:', ticket.message, ticket.details);
        if (ticket.details?.error === 'DeviceNotRegistered') {
          // Token is no longer valid — remove it so we never send to it again
          _removeStalePushToken(expoPushToken).catch(() => {});
        }
      }
    }

    // Persist to notifications table
    try {
      await db.query(
        `INSERT INTO notifications (title, message, type, data)
         VALUES ($1, $2, 'push', $3)`,
        [title, body, JSON.stringify({ token: expoPushToken, ticket, ...data })]
      );
    } catch (dbErr) {
      // Non-fatal — don't fail the send just because DB write failed
      console.warn('[PushNotification] DB persist error:', dbErr.message);
    }

    return { success: true, ticket };
  } catch (err) {
    console.error('[PushNotification] Send error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * sendBulkNotifications(tokens, title, body, data)
 * Sends the same notification to multiple devices efficiently,
 * respecting Expo's batch limit via chunking.
 *
 * @param {string[]} tokens  - Array of Expo push tokens
 * @param {string} title
 * @param {string} body
 * @param {object} data
 * @returns {{ success: boolean, sent: number, errors: number }}
 */
async function sendBulkNotifications(tokens, title, body, data = {}) {
  if (!tokens || tokens.length === 0) {
    return { success: true, sent: 0, errors: 0 };
  }

  const validTokens = tokens.filter((t) => t && Expo.isExpoPushToken(t));
  const invalidCount = tokens.length - validTokens.length;

  if (invalidCount > 0) {
    console.warn(`[PushNotification] ${invalidCount} invalid token(s) skipped`);
  }

  if (validTokens.length === 0) {
    return { success: false, sent: 0, errors: invalidCount, error: 'No valid tokens' };
  }

  const messages = validTokens.map((token) => ({
    to: token,
    sound: 'default',
    title,
    body,
    data
  }));

  const chunks = expo.chunkPushNotifications(messages);
  let sent = 0;
  let errors = invalidCount;

  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket, idx) => {
        if (ticket.status === 'ok') {
          sent++;
        } else {
          errors++;
          console.error('[PushNotification] Bulk ticket error:', ticket.message);
          if (ticket.details?.error === 'DeviceNotRegistered') {
            const staleToken = chunk[idx]?.to;
            if (staleToken) _removeStalePushToken(staleToken).catch(() => {});
          }
        }
      });
    } catch (err) {
      console.error('[PushNotification] Bulk chunk error:', err.message);
      errors += chunk.length;
    }
  }

  // Persist summary
  try {
    await db.query(
      `INSERT INTO notifications (title, message, type, data)
       VALUES ($1, $2, 'push_bulk', $3)`,
      [
        title,
        body,
        JSON.stringify({ recipients: validTokens.length, sent, errors, ...data })
      ]
    );
  } catch (dbErr) {
    console.warn('[PushNotification] Bulk DB persist error:', dbErr.message);
  }

  return { success: errors === 0, sent, errors };
}

/**
 * Remove a stale push token from the users table.
 * Called when Expo returns DeviceNotRegistered — the token is permanently invalid.
 * Nulls both expo_push_token and push_token columns to cover both column variants.
 *
 * @param {string} token
 */
async function _removeStalePushToken(token) {
  if (!token) return;
  try {
    await db.query(
      `UPDATE users
       SET expo_push_token = NULL,
           push_token      = NULL
       WHERE expo_push_token = $1 OR push_token = $1`,
      [token]
    );
    console.info(`[PushNotification] Removed stale token: ${token.slice(0, 30)}...`);
  } catch (err) {
    console.warn('[PushNotification] Failed to remove stale token:', err.message);
  }
}

module.exports = {
  sendPushNotification,
  sendBulkNotifications,
  _removeStalePushToken,
};
