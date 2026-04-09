'use strict';
/**
 * currencyUtil — XAF-centric multi-currency helpers for MOBO.
 *
 * MOBO stores all monetary values internally as XAF integers (CLAUDE.md rule).
 * This module converts to/from local currencies for display and payment APIs.
 *
 * Rates are stored as `xaf_rate_x1000` in the `country_currency_config` DB table
 * (migration_027).  The in-memory MAP below is the fast-path fallback used when
 * the DB has not been seeded or when called from contexts without DB access
 * (e.g. unit tests).  Values must stay in sync with migration_027 seed data.
 *
 *   xaf_rate_x1000: local_units_per_1000_XAF  (integer arithmetic, no floats)
 *   e.g. NGN=2750 → 1 XAF = 2.75 NGN  → 1000 XAF = 2750 NGN
 */

// ── Static fallback rates (updated Feb 2025) ─────────────────────────────────
const RATES = {
  XAF: { code: 'XAF', symbol: 'FCFA', xaf_rate_x1000: 1000 },
  XOF: { code: 'XOF', symbol: 'CFA',  xaf_rate_x1000:  997 },
  NGN: { code: 'NGN', symbol: '₦',    xaf_rate_x1000: 2750 },
  KES: { code: 'KES', symbol: 'KSh',  xaf_rate_x1000:  210 },
  ZAR: { code: 'ZAR', symbol: 'R',    xaf_rate_x1000:   31 },
  GHS: { code: 'GHS', symbol: 'GH₵',  xaf_rate_x1000:   16 },
  TZS: { code: 'TZS', symbol: 'TSh',  xaf_rate_x1000:  450 },
  UGX: { code: 'UGX', symbol: 'USh',  xaf_rate_x1000: 6700 },
  RWF: { code: 'RWF', symbol: 'RF',   xaf_rate_x1000:  200 },
  ETB: { code: 'ETB', symbol: 'Br',   xaf_rate_x1000:  110 },
  EGP: { code: 'EGP', symbol: 'E£',   xaf_rate_x1000:  820 },
};

// Country → currency code lookup (mirrors migration_027 seed)
const COUNTRY_CURRENCY = {
  CM: 'XAF', CI: 'XOF', GA: 'XAF', BJ: 'XOF', NE: 'XOF',
  NG: 'NGN', KE: 'KES', ZA: 'ZAR',
  GH: 'GHS', TZ: 'TZS', UG: 'UGX', RW: 'RWF', SN: 'XOF',
  ET: 'ETB', EG: 'EGP',
};

/**
 * Convert an XAF integer amount to the local currency of a country.
 * Always returns an integer (rounded).
 *
 * @param {number} amountXAF   — amount in XAF (must be an integer)
 * @param {string} countryCode — ISO 3166-1 alpha-2 (e.g. 'NG', 'KE', 'ZA')
 * @returns {{ amount: number, currency_code: string, currency_symbol: string, amount_xaf: number }}
 */
function convertFromXAF(amountXAF, countryCode) {
  const currencyCode = COUNTRY_CURRENCY[countryCode] || 'XAF';
  const rate         = RATES[currencyCode] || RATES.XAF;
  const amount       = Math.round((amountXAF * rate.xaf_rate_x1000) / 1000);
  return {
    amount,
    currency_code:   rate.code,
    currency_symbol: rate.symbol,
    amount_xaf:      amountXAF,
  };
}

/**
 * Convert a local currency integer amount back to XAF.
 * Used when a payment arrives in local currency and we must store in XAF.
 *
 * @param {number} amountLocal  — amount in local currency (integer)
 * @param {string} countryCode
 * @returns {number} XAF integer
 */
function convertToXAF(amountLocal, countryCode) {
  const currencyCode = COUNTRY_CURRENCY[countryCode] || 'XAF';
  const rate         = RATES[currencyCode] || RATES.XAF;
  if (rate.xaf_rate_x1000 === 0) return amountLocal;
  return Math.round((amountLocal * 1000) / rate.xaf_rate_x1000);
}

/**
 * Attach a `local_price` block to any fare/amount object.
 * If country is XAF-native the local_price mirrors the XAF amount exactly.
 *
 * @param {number} amountXAF
 * @param {string} countryCode
 * @returns {{ amount_xaf: number, local_price: { amount, currency_code, currency_symbol } }}
 */
function fareWithLocalCurrency(amountXAF, countryCode) {
  const local = convertFromXAF(amountXAF, countryCode);
  return {
    amount_xaf: amountXAF,
    local_price: {
      amount:          local.amount,
      currency_code:   local.currency_code,
      currency_symbol: local.currency_symbol,
      formatted:       `${local.currency_symbol} ${local.amount.toLocaleString()}`,
    },
  };
}

/**
 * Return the currency code for a given country code.
 * @param {string} countryCode
 * @returns {string} ISO 4217 currency code
 */
function getCurrencyCode(countryCode) {
  return COUNTRY_CURRENCY[countryCode] || 'XAF';
}

/**
 * Return the Stripe-compatible lowercase currency code for a country.
 * Falls back to 'xaf' for unsupported markets.
 */
const STRIPE_CURRENCIES = {
  XAF: 'xaf', XOF: 'xof', NGN: 'ngn', KES: 'kes', ZAR: 'zar',
  GHS: 'ghs', TZS: 'tzs', UGX: 'ugx', RWF: 'rwf', EGP: 'egp',
};
function getStripeCurrency(countryCode) {
  const code = getCurrencyCode(countryCode);
  return STRIPE_CURRENCIES[code] || 'xaf';
}

module.exports = {
  convertFromXAF,
  convertToXAF,
  fareWithLocalCurrency,
  getCurrencyCode,
  getStripeCurrency,
  RATES,
  COUNTRY_CURRENCY,
};
