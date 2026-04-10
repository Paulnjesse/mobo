/**
 * expo-server-sdk mock for functional tests.
 * The real SDK makes outbound HTTPS calls to Expo's push API —
 * this stub captures those calls without any network traffic.
 */
const Expo = jest.fn(() => ({
  chunkPushNotifications: jest.fn(msgs => [msgs]),
  sendPushNotificationsAsync: jest.fn().mockResolvedValue([{ status: 'ok', id: 'expo_mock_ticket' }]),
}));
Expo.isExpoPushToken = jest.fn(() => true);

module.exports = { Expo };
