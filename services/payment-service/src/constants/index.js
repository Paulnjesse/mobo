'use strict';

// ── User roles ────────────────────────────────────────────────────────────────
const ROLES = Object.freeze({
  RIDER:       'rider',
  DRIVER:      'driver',
  FLEET_OWNER: 'fleet_owner',
  ADMIN:       'admin',
});

// ── Ride statuses ─────────────────────────────────────────────────────────────
const RIDE_STATUS = Object.freeze({
  REQUESTED:  'requested',
  ACCEPTED:   'accepted',
  ARRIVING:   'arriving',
  IN_PROGRESS: 'in_progress',
  COMPLETED:  'completed',
  CANCELLED:  'cancelled',
});

// ── Ride types ────────────────────────────────────────────────────────────────
const RIDE_TYPE = Object.freeze({
  STANDARD:  'standard',
  XL:        'xl',
  MOTO:      'moto',
  BENSKIN:   'benskin',
  WOMEN:     'women',
  DELIVERY:  'delivery',
  LUXURY:    'luxury',
  SHARED:    'shared',
  SCHEDULED: 'scheduled',
});

// ── Payment methods ───────────────────────────────────────────────────────────
const PAYMENT_METHOD = Object.freeze({
  CASH:         'cash',
  WALLET:       'wallet',
  MTN_MOMO:     'mtn_mobile_money',
  ORANGE_MONEY: 'orange_money',
  WAVE:         'wave',
  CARD:         'card',
});

// ── Payment status ────────────────────────────────────────────────────────────
const PAYMENT_STATUS = Object.freeze({
  PENDING:   'pending',
  COMPLETED: 'completed',
  FAILED:    'failed',
  REFUNDED:  'refunded',
});

// ── Subscription plans ────────────────────────────────────────────────────────
const SUBSCRIPTION_PLAN = Object.freeze({
  NONE:    'none',
  BASIC:   'basic',
  PREMIUM: 'premium',
});

// ── Fare rates (XAF) ──────────────────────────────────────────────────────────
const FARE_RATES = Object.freeze({
  moto:     { base: 300,  perKm: 80,  perMin: 12,  bookingFee: 200 },
  benskin:  { base: 300,  perKm: 80,  perMin: 12,  bookingFee: 200 },
  standard: { base: 1000, perKm: 700, perMin: 100, bookingFee: 500 },
  xl:       { base: 1400, perKm: 900, perMin: 130, bookingFee: 500 },
  women:    { base: 1000, perKm: 700, perMin: 100, bookingFee: 500 },
  delivery: { base: 500,  perKm: 150, perMin: 40,  bookingFee: 300 },
  luxury:   { base: 2000, perKm: 1200, perMin: 180, bookingFee: 1000 },
});

// ── Subscription discounts ────────────────────────────────────────────────────
const SUBSCRIPTION_DISCOUNTS = Object.freeze({
  none:    0,
  basic:   0.10,
  premium: 0.20,
});

// ── Driver tiers & hourly guarantees (XAF/hr) ────────────────────────────────
const DRIVER_TIERS = Object.freeze({
  bronze:   { minRides: 0,   minRating: 0,   hourlyGuarantee: 2000 },
  gold:     { minRides: 100, minRating: 4.5, hourlyGuarantee: 2500 },
  platinum: { minRides: 300, minRating: 4.7, hourlyGuarantee: 3000 },
  diamond:  { minRides: 600, minRating: 4.9, hourlyGuarantee: 4000 },
});

// ── OTP settings ──────────────────────────────────────────────────────────────
const OTP = Object.freeze({
  LENGTH:               6,
  EXPIRY_MINUTES:       10,
  MAX_SENDS_PER_HOUR:   3,
  MAX_ATTEMPTS:         5,
});

// ── Loyalty points ────────────────────────────────────────────────────────────
const LOYALTY = Object.freeze({
  POINTS_PER_RIDE:      10,
  POINTS_PER_RATING:    2,
  POINTS_PER_ROUND_UP:  5,
  POINTS_PER_REFERRAL:  100,
  MIN_REDEEM:           100,
  REDEEM_VALUE_XAF:     500,
  TIER_SILVER:          200,
  TIER_GOLD:            500,
  TIER_PLATINUM:        1000,
});

// ── Referral rewards (XAF wallet credit) ─────────────────────────────────────
const REFERRAL = Object.freeze({
  REFERRER_CREDIT: 1000,
  REFEREE_CREDIT:  500,
});

// ── Pagination defaults ───────────────────────────────────────────────────────
const PAGINATION = Object.freeze({
  DEFAULT_LIMIT: 20,
  MAX_LIMIT:     100,
});

// ── Rental packages (XAF) ─────────────────────────────────────────────────────
const RENTAL_PACKAGES = Object.freeze({
  '1h': { hours: 1, kmLimit: 50,  price: 8000  },
  '2h': { hours: 2, kmLimit: 100, price: 14000 },
  '4h': { hours: 4, kmLimit: 180, price: 25000 },
  '8h': { hours: 8, kmLimit: 300, price: 45000 },
});
const RENTAL_EXTRA_KM_RATE = 200;

// ── Geography ─────────────────────────────────────────────────────────────────
const GEO = Object.freeze({
  EARTH_RADIUS_KM:   6371,
  NEARBY_RADIUS_M:   5000,
  POOL_PICKUP_M:     1000,
  POOL_DROPOFF_M:    2000,
  SRID:              4326,
});

module.exports = {
  ROLES,
  RIDE_STATUS,
  RIDE_TYPE,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  SUBSCRIPTION_PLAN,
  FARE_RATES,
  SUBSCRIPTION_DISCOUNTS,
  DRIVER_TIERS,
  OTP,
  LOYALTY,
  REFERRAL,
  PAGINATION,
  RENTAL_PACKAGES,
  RENTAL_EXTRA_KM_RATE,
  GEO,
};
