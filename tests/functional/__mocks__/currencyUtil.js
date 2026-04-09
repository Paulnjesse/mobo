/**
 * currencyUtil mock — self-contained implementation mirroring the real module.
 *
 * Using jest.requireActual here creates a moduleNameMapper self-reference loop
 * (the mock resolves to itself). Instead we inline the same pure logic so the
 * mock is stable and no circular resolution can occur.
 *
 * These values MUST stay in sync with services/shared/currencyUtil.js.
 */

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

const COUNTRY_CURRENCY = {
  CM: 'XAF', CI: 'XOF', GA: 'XAF', BJ: 'XOF', NE: 'XOF',
  NG: 'NGN', KE: 'KES', ZA: 'ZAR',
  GH: 'GHS', TZ: 'TZS', UG: 'UGX', RW: 'RWF', SN: 'XOF',
  ET: 'ETB', EG: 'EGP',
};

const COUNTRY_NAME_TO_ISO = {
  'Cameroon': 'CM', 'Nigeria': 'NG', 'Kenya': 'KE', 'South Africa': 'ZA',
  'Ivory Coast': 'CI', "Côte d'Ivoire": 'CI', 'Gabon': 'GA', 'Benin': 'BJ',
  'Niger': 'NE', 'Ghana': 'GH', 'Tanzania': 'TZ', 'Uganda': 'UG',
  'Rwanda': 'RW', 'Senegal': 'SN', 'Ethiopia': 'ET', 'Egypt': 'EG',
};

const STRIPE_CURRENCIES = {
  XAF: 'xaf', XOF: 'xof', NGN: 'ngn', KES: 'kes', ZAR: 'zar',
  GHS: 'ghs', TZS: 'tzs', UGX: 'ugx', RWF: 'rwf', EGP: 'egp',
};

function getCurrencyCode(countryCode) {
  return COUNTRY_CURRENCY[countryCode] || 'XAF';
}

function resolveCountryCode(countryOrCode) {
  if (!countryOrCode) return 'CM';
  const upper = countryOrCode.trim().toUpperCase();
  if (upper.length === 2 && COUNTRY_CURRENCY[upper]) return upper;
  const titleCase = countryOrCode.trim();
  if (COUNTRY_NAME_TO_ISO[titleCase]) return COUNTRY_NAME_TO_ISO[titleCase];
  const lower = titleCase.toLowerCase();
  for (const [name, code] of Object.entries(COUNTRY_NAME_TO_ISO)) {
    if (name.toLowerCase() === lower) return code;
  }
  return 'CM';
}

function convertFromXAF(amountXAF, countryCode) {
  const currencyCode = COUNTRY_CURRENCY[countryCode] || 'XAF';
  const rate         = RATES[currencyCode] || RATES.XAF;
  const amount       = Math.round((amountXAF * rate.xaf_rate_x1000) / 1000);
  return { amount, currency_code: rate.code, currency_symbol: rate.symbol, amount_xaf: amountXAF };
}

function convertToXAF(amountLocal, countryCode) {
  const currencyCode = COUNTRY_CURRENCY[countryCode] || 'XAF';
  const rate         = RATES[currencyCode] || RATES.XAF;
  if (!rate.xaf_rate_x1000) return amountLocal;
  return Math.round((amountLocal * 1000) / rate.xaf_rate_x1000);
}

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

function getStripeCurrency(countryCode) {
  const code = getCurrencyCode(countryCode);
  return STRIPE_CURRENCIES[code] || 'xaf';
}

module.exports = {
  convertFromXAF, convertToXAF, fareWithLocalCurrency,
  getCurrencyCode, getStripeCurrency, resolveCountryCode,
  RATES, COUNTRY_CURRENCY, COUNTRY_NAME_TO_ISO,
};
