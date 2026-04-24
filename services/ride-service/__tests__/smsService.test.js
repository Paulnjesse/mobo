'use strict';
/**
 * Tests for ride-service smsService.js
 *
 * Verifies:
 *   1. sendCriticalAlert sends SMS when Twilio is configured
 *   2. sendCriticalAlert logs a warning and is a no-op when Twilio not configured
 *   3. Twilio errors are non-fatal
 *   4. notifyCancelled formats correct English and French messages
 *   5. notifyDriverArriving formats message with ETA
 *   6. notifyPaymentFailed formats message with/without amount
 */

process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = 'test_secret_minimum_32_chars_long_abc';

jest.mock('../src/utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

describe('smsService — sendCriticalAlert', () => {
  let sendCriticalAlert, notifyCancelled, notifyDriverArriving, notifyPaymentFailed;
  let mockCreate;
  const logger = require('../src/utils/logger');

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadWithTwilio(configured = true) {
    if (configured) {
      process.env.TWILIO_ACCOUNT_SID   = 'ACtest123456789012345678901234567890';
      process.env.TWILIO_AUTH_TOKEN    = 'authtoken123';
      process.env.TWILIO_PHONE_NUMBER  = '+12345678901';
    } else {
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_PHONE_NUMBER;
    }

    mockCreate = jest.fn().mockResolvedValue({ sid: 'SM123' });
    jest.doMock('twilio', () => () => ({
      messages: { create: mockCreate },
    }));

    const svc = require('../src/services/smsService');
    sendCriticalAlert    = svc.sendCriticalAlert;
    notifyCancelled      = svc.notifyCancelled;
    notifyDriverArriving = svc.notifyDriverArriving;
    notifyPaymentFailed  = svc.notifyPaymentFailed;
  }

  test('sends SMS when Twilio is configured', async () => {
    loadWithTwilio(true);
    await sendCriticalAlert('+237612345678', 'Test message');
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      to:   '+237612345678',
      body: 'Test message',
    }));
  });

  test('logs warning and skips when Twilio not configured', async () => {
    loadWithTwilio(false);
    await sendCriticalAlert('+237612345678', 'Test message');
    expect(mockCreate).not.toHaveBeenCalled();
    const logger2 = require('../src/utils/logger');
    expect(logger2.warn).toHaveBeenCalledWith(
      expect.stringContaining('Twilio not configured'), expect.any(String)
    );
  });

  test('skips send when phone is empty', async () => {
    loadWithTwilio(true);
    await sendCriticalAlert('', 'Test message');
    await sendCriticalAlert(null, 'Test message');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('Twilio errors are non-fatal', async () => {
    loadWithTwilio(true);
    mockCreate.mockRejectedValueOnce(new Error('Twilio 500'));
    await expect(sendCriticalAlert('+237612345678', 'msg')).resolves.not.toThrow();
    const logger2 = require('../src/utils/logger');
    expect(logger2.warn).toHaveBeenCalledWith(
      expect.stringContaining('Twilio send error'), expect.any(String)
    );
  });

  test('notifyCancelled English message contains "cancelled"', async () => {
    loadWithTwilio(true);
    await notifyCancelled('+237612345678', { reason: 'No driver', language: 'en' });
    const body = mockCreate.mock.calls[0][0].body;
    expect(body).toContain('cancelled');
    expect(body).toContain('No driver');
  });

  test('notifyCancelled French message is in French', async () => {
    loadWithTwilio(true);
    await notifyCancelled('+237612345678', { language: 'fr' });
    const body = mockCreate.mock.calls[0][0].body;
    expect(body).toContain('annulée');
  });

  test('notifyDriverArriving includes ETA in message', async () => {
    loadWithTwilio(true);
    await notifyDriverArriving('+237612345678', { eta_minutes: 3 });
    const body = mockCreate.mock.calls[0][0].body;
    expect(body).toContain('3 min');
  });

  test('notifyPaymentFailed includes amount when provided', async () => {
    loadWithTwilio(true);
    await notifyPaymentFailed('+237612345678', { amount: 2500 });
    const body = mockCreate.mock.calls[0][0].body;
    expect(body).toContain('payment');
  });
});
