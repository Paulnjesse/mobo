/**
 * Cloudflare Worker — Advanced rate limiting for MOBO API
 * Deploy via: wrangler deploy cloudflare/worker-rate-limit.js
 */

const RATE_LIMITS = {
  '/v1/auth/login':    { requests: 10,  window: 60  },
  '/v1/auth/signup':   { requests: 5,   window: 60  },
  '/v1/payments':      { requests: 20,  window: 60  },
  '/v1/rides':         { requests: 60,  window: 60  },
  default:             { requests: 200, window: 60  },
};

export default {
  async fetch(request, env) {
    const url     = new URL(request.url);
    const ip      = request.headers.get('CF-Connecting-IP') || 'unknown';
    const path    = url.pathname;

    // Find matching rate limit rule
    const rule = Object.entries(RATE_LIMITS).find(([key]) => key !== 'default' && path.startsWith(key));
    const limit = rule ? rule[1] : RATE_LIMITS.default;

    const cacheKey = `rate:${ip}:${rule ? rule[0] : 'default'}`;
    const now      = Math.floor(Date.now() / 1000);
    const window   = Math.floor(now / limit.window);
    const kvKey    = `${cacheKey}:${window}`;

    const current = parseInt(await env.RATE_LIMIT_KV.get(kvKey) || '0', 10);

    if (current >= limit.requests) {
      return new Response(
        JSON.stringify({ success: false, message: 'Rate limit exceeded. Please slow down.' }),
        { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(limit.window) } }
      );
    }

    await env.RATE_LIMIT_KV.put(kvKey, String(current + 1), { expirationTtl: limit.window * 2 });
    return fetch(request);
  },
};
