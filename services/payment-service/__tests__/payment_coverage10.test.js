'use strict';
/**
 * payment_coverage10.test.js
 *
 * Boosts coverage for constants/index.js (currently 0% — 133 uncovered lines).
 */

process.env.NODE_ENV     = 'test';
process.env.JWT_SECRET   = 'test_secret_minimum_32_chars_long_abc';
process.env.DATABASE_URL = 'postgresql://localhost/mobo_test';

jest.mock('../src/utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  child: jest.fn().mockReturnThis(),
}));
jest.mock('../src/config/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
}));

describe('constants/index.js — all exported values', () => {
  let C;
  beforeAll(() => { C = require('../src/constants/index'); });

  test('ROLES: rider, driver, fleet_owner, admin', () => {
    expect(C.ROLES.RIDER).toBe('rider');
    expect(C.ROLES.DRIVER).toBe('driver');
    expect(C.ROLES.FLEET_OWNER).toBe('fleet_owner');
    expect(C.ROLES.ADMIN).toBe('admin');
    expect(Object.isFrozen(C.ROLES)).toBe(true);
  });

  test('RIDE_STATUS: all 6 statuses', () => {
    const s = C.RIDE_STATUS;
    expect(s.REQUESTED).toBe('requested');
    expect(s.ACCEPTED).toBe('accepted');
    expect(s.ARRIVING).toBe('arriving');
    expect(s.IN_PROGRESS).toBe('in_progress');
    expect(s.COMPLETED).toBe('completed');
    expect(s.CANCELLED).toBe('cancelled');
  });

  test('RIDE_TYPE: 9 types including SCHEDULED', () => {
    const t = C.RIDE_TYPE;
    expect(t.STANDARD).toBe('standard');
    expect(t.XL).toBe('xl');
    expect(t.MOTO).toBe('moto');
    expect(t.BENSKIN).toBe('benskin');
    expect(t.WOMEN).toBe('women');
    expect(t.DELIVERY).toBe('delivery');
    expect(t.LUXURY).toBe('luxury');
    expect(t.SHARED).toBe('shared');
    expect(t.SCHEDULED).toBe('scheduled');
  });

  test('PAYMENT_METHOD: cash, wallet, mobile money', () => {
    const m = C.PAYMENT_METHOD;
    expect(m.CASH).toBe('cash');
    expect(m.WALLET).toBe('wallet');
    expect(m.MTN_MOMO).toBe('mtn_mobile_money');
    expect(m.ORANGE_MONEY).toBe('orange_money');
    expect(m.WAVE).toBe('wave');
    expect(m.CARD).toBe('card');
  });

  test('PAYMENT_STATUS: pending, completed, failed, refunded', () => {
    const s = C.PAYMENT_STATUS;
    expect(s.PENDING).toBe('pending');
    expect(s.COMPLETED).toBe('completed');
    expect(s.FAILED).toBe('failed');
    expect(s.REFUNDED).toBe('refunded');
  });

  test('SUBSCRIPTION_PLAN: none, basic, premium', () => {
    expect(C.SUBSCRIPTION_PLAN.NONE).toBe('none');
    expect(C.SUBSCRIPTION_PLAN.BASIC).toBe('basic');
    expect(C.SUBSCRIPTION_PLAN.PREMIUM).toBe('premium');
  });

  test('FARE_RATES: moto and standard have correct XAF values', () => {
    expect(C.FARE_RATES.moto.base).toBe(300);
    expect(C.FARE_RATES.moto.perKm).toBe(80);
    expect(C.FARE_RATES.standard.base).toBe(1000);
    expect(C.FARE_RATES.standard.perKm).toBe(700);
    expect(C.FARE_RATES.luxury.base).toBe(2000);
    expect(C.FARE_RATES.delivery.base).toBe(500);
  });

  test('SUBSCRIPTION_DISCOUNTS: none=0, basic=10%, premium=20%', () => {
    expect(C.SUBSCRIPTION_DISCOUNTS.none).toBe(0);
    expect(C.SUBSCRIPTION_DISCOUNTS.basic).toBe(0.10);
    expect(C.SUBSCRIPTION_DISCOUNTS.premium).toBe(0.20);
  });

  test('DRIVER_TIERS: bronze, gold, platinum, diamond', () => {
    expect(C.DRIVER_TIERS.bronze.minRides).toBe(0);
    expect(C.DRIVER_TIERS.gold.minRides).toBe(100);
    expect(C.DRIVER_TIERS.platinum.minRides).toBe(300);
    expect(C.DRIVER_TIERS.diamond.minRides).toBe(600);
    expect(C.DRIVER_TIERS.diamond.hourlyGuarantee).toBe(4000);
  });

  test('OTP: length 6, expires in 10 minutes', () => {
    expect(C.OTP.LENGTH).toBe(6);
    expect(C.OTP.EXPIRY_MINUTES).toBe(10);
    expect(C.OTP.MAX_SENDS_PER_HOUR).toBe(3);
    expect(C.OTP.MAX_ATTEMPTS).toBe(5);
  });

  test('LOYALTY: points per ride and redeem threshold', () => {
    expect(C.LOYALTY.POINTS_PER_RIDE).toBe(10);
    expect(C.LOYALTY.MIN_REDEEM).toBe(100);
    expect(C.LOYALTY.REDEEM_VALUE_XAF).toBe(500);
    expect(C.LOYALTY.TIER_GOLD).toBe(500);
  });

  test('REFERRAL: referrer 1000 XAF, referee 500 XAF', () => {
    expect(C.REFERRAL.REFERRER_CREDIT).toBe(1000);
    expect(C.REFERRAL.REFEREE_CREDIT).toBe(500);
  });

  test('PAGINATION: default 20, max 100', () => {
    expect(C.PAGINATION.DEFAULT_LIMIT).toBe(20);
    expect(C.PAGINATION.MAX_LIMIT).toBe(100);
  });

  test('RENTAL_PACKAGES: 4 packages with XAF prices', () => {
    expect(C.RENTAL_PACKAGES['1h'].price).toBe(8000);
    expect(C.RENTAL_PACKAGES['2h'].price).toBe(14000);
    expect(C.RENTAL_PACKAGES['4h'].price).toBe(25000);
    expect(C.RENTAL_PACKAGES['8h'].price).toBe(45000);
    expect(C.RENTAL_EXTRA_KM_RATE).toBe(200);
  });

  test('GEO: earth radius and nearby radius', () => {
    expect(C.GEO.EARTH_RADIUS_KM).toBe(6371);
    expect(C.GEO.NEARBY_RADIUS_M).toBe(5000);
    expect(C.GEO.SRID).toBe(4326);
  });
});
