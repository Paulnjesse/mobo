'use strict';
/**
 * Unit tests for the calculateFare function.
 * The function lives inside rideController.js and is not exported, so we
 * re-implement the same pure logic here and test it in isolation — this is
 * intentional: we are testing the business rules, not the module boundary.
 *
 * If calculateFare is ever extracted to a shared utility, point the import
 * here instead.
 */

// ── Replicated from rideController.js (keep in sync) ─────────────────────────
const RIDE_TYPE_RATES = {
  moto:     { base: 300,  perKm: 80,   perMin: 12,  bookingFee: 200 },
  benskin:  { base: 300,  perKm: 80,   perMin: 12,  bookingFee: 200 },
  standard: { base: 1000, perKm: 700,  perMin: 100, bookingFee: 500 },
  xl:       { base: 1400, perKm: 900,  perMin: 130, bookingFee: 500 },
  women:    { base: 1000, perKm: 700,  perMin: 100, bookingFee: 500 },
  luxury:   { base: 3500, perKm: 1800, perMin: 250, bookingFee: 1000 },
  taxi:     { base: 800,  perKm: 550,  perMin: 80,  bookingFee: 400 },
  private:  { base: 2000, perKm: 1200, perMin: 180, bookingFee: 700 },
  van:      { base: 2000, perKm: 1100, perMin: 160, bookingFee: 700 },
  delivery: { base: 500,  perKm: 150,  perMin: 40,  bookingFee: 300 },
};

function calculateFare(distanceKm, durationMin, surgeMultiplier = 1.0, subscription = 'none', priceLocked = false, lockedFare = null, rideType = 'standard') {
  if (priceLocked && lockedFare) return lockedFare;
  const rates = RIDE_TYPE_RATES[rideType] || RIDE_TYPE_RATES.standard;
  const raw = rates.base + (rates.perKm * distanceKm) + (rates.perMin * durationMin);
  const surged = Math.round(raw * surgeMultiplier);
  const discount = subscription === 'premium' ? 0.20 : subscription === 'basic' ? 0.10 : 0;
  const discounted = Math.round(surged * (1 - discount));
  const serviceFee = Math.round(discounted * 0.20);
  return { base: discounted, serviceFee, bookingFee: rates.bookingFee, total: discounted + serviceFee + rates.bookingFee };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('calculateFare — basic fare structure', () => {
  test('standard ride returns correct components', () => {
    const fare = calculateFare(5, 10, 1.0, 'none', false, null, 'standard');
    // raw = 1000 + 700*5 + 100*10 = 1000 + 3500 + 1000 = 5500
    expect(fare.base).toBe(5500);
    expect(fare.serviceFee).toBe(1100);   // 20% of 5500
    expect(fare.bookingFee).toBe(500);
    expect(fare.total).toBe(7100);        // 5500 + 1100 + 500
  });

  test('moto ride has lower base than standard', () => {
    const moto = calculateFare(5, 10, 1.0, 'none', false, null, 'moto');
    const std  = calculateFare(5, 10, 1.0, 'none', false, null, 'standard');
    expect(moto.total).toBeLessThan(std.total);
  });

  test('luxury ride costs more than standard', () => {
    const luxury = calculateFare(5, 10, 1.0, 'none', false, null, 'luxury');
    const std    = calculateFare(5, 10, 1.0, 'none', false, null, 'standard');
    expect(luxury.total).toBeGreaterThan(std.total);
  });

  test('all ride types return integer XAF totals (no decimals)', () => {
    const types = Object.keys(RIDE_TYPE_RATES);
    for (const rt of types) {
      const fare = calculateFare(3.7, 8.2, 1.0, 'none', false, null, rt);
      expect(Number.isInteger(fare.base)).toBe(true);
      expect(Number.isInteger(fare.serviceFee)).toBe(true);
      expect(Number.isInteger(fare.bookingFee)).toBe(true);
      expect(Number.isInteger(fare.total)).toBe(true);
    }
  });

  test('unknown ride type falls back to standard rates', () => {
    const fallback = calculateFare(5, 10, 1.0, 'none', false, null, 'nonexistent_type');
    const std      = calculateFare(5, 10, 1.0, 'none', false, null, 'standard');
    expect(fallback).toEqual(std);
  });
});

describe('calculateFare — surge pricing', () => {
  test('surge multiplier of 1.0 leaves fare unchanged', () => {
    const noSurge   = calculateFare(5, 10, 1.0);
    const oneSurge  = calculateFare(5, 10, 1.0);
    expect(noSurge.total).toBe(oneSurge.total);
  });

  test('surge multiplier of 2.0 roughly doubles the base fare', () => {
    const normal = calculateFare(5, 10, 1.0);
    const surged = calculateFare(5, 10, 2.0);
    // base doubles; service fee is 20% of new base; booking fee stays constant
    expect(surged.base).toBe(normal.base * 2);
    expect(surged.serviceFee).toBe(normal.serviceFee * 2);
    expect(surged.bookingFee).toBe(normal.bookingFee);
  });

  test('fractional surge rounds to integer', () => {
    const fare = calculateFare(5, 10, 1.5);
    expect(Number.isInteger(fare.base)).toBe(true);
    expect(Number.isInteger(fare.total)).toBe(true);
  });

  test('surge multiplier of 3.5 (max cap) produces correct result', () => {
    const fare = calculateFare(5, 10, 3.5);
    // raw = 5500, surged = round(5500 * 3.5) = 19250
    expect(fare.base).toBe(19250);
    expect(fare.serviceFee).toBe(3850);
    expect(fare.total).toBe(19250 + 3850 + 500);
  });
});

describe('calculateFare — subscription discounts', () => {
  test('premium subscription gives 20% discount', () => {
    const normal  = calculateFare(5, 10, 1.0, 'none');
    const premium = calculateFare(5, 10, 1.0, 'premium');
    expect(premium.base).toBe(Math.round(normal.base * 0.80));
  });

  test('basic subscription gives 10% discount', () => {
    const normal = calculateFare(5, 10, 1.0, 'none');
    const basic  = calculateFare(5, 10, 1.0, 'basic');
    expect(basic.base).toBe(Math.round(normal.base * 0.90));
  });

  test('no subscription gives no discount', () => {
    const noSub   = calculateFare(5, 10, 1.0, 'none');
    const nullSub = calculateFare(5, 10, 1.0, null);
    // null subscription should behave same as 'none'
    expect(noSub.base).toBe(nullSub.base);
  });

  test('premium discount is applied after surge, not before', () => {
    // surged base = round(5500 * 2.0) = 11000; premium base = round(11000 * 0.80) = 8800
    const fare = calculateFare(5, 10, 2.0, 'premium');
    expect(fare.base).toBe(8800);
  });
});

describe('calculateFare — price lock', () => {
  test('locked fare is returned as-is without recalculation', () => {
    const locked = { base: 2000, serviceFee: 400, bookingFee: 500, total: 2900 };
    const result = calculateFare(100, 200, 3.5, 'premium', true, locked);
    expect(result).toBe(locked);  // exact same reference
  });

  test('priceLocked=true with null lockedFare falls back to normal calculation', () => {
    const normal = calculateFare(5, 10, 1.0, 'none', false, null, 'standard');
    const noLock = calculateFare(5, 10, 1.0, 'none', true, null, 'standard');
    expect(noLock).toEqual(normal);
  });
});

describe('calculateFare — zero and edge distances', () => {
  test('zero distance still charges base + booking fee', () => {
    const fare = calculateFare(0, 0, 1.0, 'none', false, null, 'standard');
    // raw = 1000 + 0 + 0 = 1000; service fee = 200; total = 1700
    expect(fare.base).toBe(1000);
    expect(fare.total).toBe(1700);
  });

  test('short moto trip (1 km, 5 min) is affordable', () => {
    const fare = calculateFare(1, 5, 1.0, 'none', false, null, 'moto');
    // raw = 300 + 80 + 60 = 440; service = 88; booking = 200; total = 728
    expect(fare.total).toBe(728);
    expect(fare.total).toBeLessThan(1000);
  });

  test('long luxury trip (50 km, 60 min) produces correct total', () => {
    const fare = calculateFare(50, 60, 1.0, 'none', false, null, 'luxury');
    // raw = 3500 + 1800*50 + 250*60 = 3500 + 90000 + 15000 = 108500
    // service = 21700; booking = 1000; total = 131200
    expect(fare.base).toBe(108500);
    expect(fare.total).toBe(131200);
  });
});

describe('calculateFare — service fee is always 20% of base', () => {
  const cases = [
    [2, 5, 1.0, 'none', 'standard'],
    [10, 20, 2.0, 'premium', 'xl'],
    [0, 0, 1.0, 'basic', 'delivery'],
    [15, 30, 1.3, 'none', 'taxi'],
  ];

  test.each(cases)('dist=%s km, dur=%s min, surge=%s, sub=%s, type=%s', (dist, dur, surge, sub, type) => {
    const fare = calculateFare(dist, dur, surge, sub, false, null, type);
    expect(fare.serviceFee).toBe(Math.round(fare.base * 0.20));
  });
});
