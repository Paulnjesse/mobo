/**
 * currencyMiddleware mock — real implementation that works in jest context.
 *
 * Uses the currencyUtil mock (which is self-contained) to resolve currencies.
 * Both test files that need the stub AND the currency-middleware tests that
 * need real conversion logic will get the correct behaviour because this IS
 * the real logic, not a no-op stub.
 */

// currencyUtil mock is self-contained — safe to require without circular loop
const {
  resolveCountryCode,
  getCurrencyCode,
  convertFromXAF,
  RATES,
} = require('./currencyUtil');

function currencyMiddleware(req, _res, next) {
  const countryCode = resolveCountryCode(
    req.user?.country_code ||
    (req.headers && req.headers['x-country-code']) ||
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
    fromXAF(amountXAF) {
      return Math.round((amountXAF * rateConfig.xaf_rate_x1000) / 1000);
    },
    toXAF(localAmount) {
      if (!rateConfig.xaf_rate_x1000) return localAmount;
      return Math.round((localAmount * 1000) / rateConfig.xaf_rate_x1000);
    },
    format(amountXAF) {
      const local = this.fromXAF(amountXAF);
      return `${rateConfig.symbol} ${local.toLocaleString()}`;
    },
    localPrice(amountXAF) {
      return convertFromXAF(amountXAF, countryCode);
    },
  };

  next();
}

module.exports = { currencyMiddleware };
