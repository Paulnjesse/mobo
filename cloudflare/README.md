# MOBO Cloudflare WAF Setup

## Prerequisites
- Cloudflare account with MOBO domain (mobo.cm) added
- Render service URLs configured as origin

## Setup Steps

### 1. DNS Configuration
Point `api.mobo.cm` to your Render service URL with proxy enabled (orange cloud).

### 2. WAF Rules (Cloudflare Dashboard → Security → WAF)

Create the following custom rules:

**Rule 1: Block common attack patterns**
- Expression: `(http.request.uri.path contains "../") or (http.request.uri.query contains "UNION SELECT") or (http.request.uri.query contains "<script")`
- Action: Block

**Rule 2: Rate limit auth endpoints**
- Expression: `(http.request.uri.path contains "/v1/auth/login") or (http.request.uri.path contains "/v1/auth/signup")`
- Action: Rate limit — 20 requests per minute per IP

**Rule 3: Block non-African IPs (optional, Cameroon-first)**
- Expression: `not (ip.geoip.continent in {"AF"}) and not (ip.geoip.country in {"US" "GB" "FR" "DE"})`
- Action: Challenge (CAPTCHA) — adjust countries as needed

**Rule 4: Allow health checks**
- Expression: `http.request.uri.path eq "/health"`
- Action: Allow (bypass other rules)

### 3. Page Rules
- Cache Level: Bypass for `/v1/auth/*` and `/v1/payments/*`
- SSL: Full (Strict)

### 4. DDoS Protection
Enable "DDoS L7 Mitigation" under Security → DDoS.
Set sensitivity to Medium for API endpoints.

### 5. Bot Fight Mode
Enable under Security → Bots → Bot Fight Mode.

## Cloudflare Worker (Optional: Advanced Rate Limiting)
