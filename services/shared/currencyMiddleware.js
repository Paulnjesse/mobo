'use strict';
/**
 * currencyMiddleware — attaches req.currency to every authenticated request.
 *
 * Resolution order (first non-null wins):
 *   1. req.user.country_code  — set by JWT (most accurate, set at registration)
 *   2. x-country-code header  — sent by mobile app on every request
 *   3. req.user.country       — legacy full-name field in older JWTs
 *   4. Default: 'CM' (XAF)
 *
 * After this middleware, handlers can do:
 *   const { code, symbol, rate_x1000, amount } = req.currency;
 *   const localAmount = req.currency.fromXAF(amountXAF);
 */

const { resolveCountryCode, convertFromXAF, getCurrencyCode, RATES, COUNTRY_CURRENCY } = require('./currencyUtil');

function currencyMiddleware(req, _res, next) {
  // Resolve country code from JWT payload or header
  const countryCode = resolveCountryCode(
    req.user?.country_code ||
    req.headers['x-country-code'] ||
    req.user?.country ||
    'CM'
  );

  const currencyCode = getCurrencyCode(countryCode);
  const rateConfig   = RATES[currencyCode] || RATES.XAF;

  req.currency = {
    country_code:    countryCode,
    code:            currencyCode,
    symbol:          rateConfig.symbol,
    rate_x1000:      rateConfig.xaf_rate_x1000,
    /** Convert an XAF integer amount to a local currency integer. */
    fromXAF(amountXAF) {
      return Math.round((amountXAF * rateConfig.xaf_rate_x1000) / 1000);
    },
    /** Convert a local currency integer back to XAF. */
    toXAF(localAmount) {
      if (!rateConfig.xaf_rate_x1000) return localAmount;
      return Math.round((localAmount * 1000) / rateConfig.xaf_rate_x1000);
    },
    /** Format an XAF amount as a local currency string. e.g. "₦ 6,875" */
    format(amountXAF) {
      const local = this.fromXAF(amountXAF);
      return `${rateConfig.symbol} ${local.toLocaleString()}`;
    },
    /** Full conversion object returned in API responses. */
    localPrice(amountXAF) {
      return convertFromXAF(amountXAF, countryCode);
    },
  };

  next();
}

module.exports = { currencyMiddleware };
