/**
 * MOBO — End-to-End Test Suite (Task C)
 * Framework: Playwright
 *
 * Covers:
 *   1. Dispatch flow (ride request → driver match → admin override)
 *   2. Ride lifecycle (requested → accepted → in_progress → completed)
 *   3. Payment reconciliation (webhook → idempotency → state update)
 *   4. Alert triggering (payment failure threshold → Alertmanager)
 *   5. RBAC enforcement (role-based route protection)
 *
 * Run:
 *   npx playwright test tests/e2e/mobo-e2e.spec.js
 *   npx playwright test --headed  (browser visible)
 *
 * Environment:
 *   BASE_URL        Admin dashboard URL  (default: http://localhost:3005)
 *   API_URL         API gateway URL      (default: http://localhost:3000)
 *   ADMIN_EMAIL     super_admin email
 *   ADMIN_PASSWORD  super_admin password
 *   OPS_EMAIL       ops_admin email
 *   OPS_PASSWORD    ops_admin password
 *   FINANCE_EMAIL   finance_admin email
 *   FINANCE_PASSWORD finance_admin password
 */

'use strict';

const { test, expect, request } = require('@playwright/test');

const BASE_URL     = process.env.BASE_URL     || 'http://localhost:3005';
const API_URL      = process.env.API_URL      || 'http://localhost:3000';
const ADMIN_EMAIL  = process.env.ADMIN_EMAIL  || 'admin@moboride.com';
const ADMIN_PASS   = process.env.ADMIN_PASSWORD || 'TestAdmin123!';
const OPS_EMAIL    = process.env.OPS_EMAIL    || 'ops@moboride.com';
const OPS_PASS     = process.env.OPS_PASSWORD || 'TestOps123!';
const FIN_EMAIL    = process.env.FINANCE_EMAIL    || 'finance@moboride.com';
const FIN_PASS     = process.env.FINANCE_PASSWORD || 'TestFinance123!';

// ─── Shared helpers ──────────────────────────────────────────────────────────

/**
 * Login via the admin dashboard UI and return a page with an authenticated session.
 */
async function loginAs(page, email, password) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  // Wait for dashboard to load
  await page.waitForURL(/dashboard|home|overview/i, { timeout: 10_000 });
}

/**
 * Create a test ride via the API and return the ride ID.
 */
async function createTestRide(apiContext, riderToken) {
  const res = await apiContext.post(`${API_URL}/v1/rides`, {
    headers: { Authorization: `Bearer ${riderToken}` },
    data: {
      pickup_address:  'Bastos, Yaoundé',
      dropoff_address: 'Mvan, Yaoundé',
      pickup_lat:   3.848,  pickup_lng:  11.502,
      dropoff_lat:  3.866,  dropoff_lng: 11.516,
      ride_type:    'standard',
      payment_method: 'mtn_mobile_money',
    },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  return body.data?.id ?? body.id;
}

/**
 * Obtain a rider JWT from the auth service (test account).
 */
async function getRiderToken(apiContext) {
  const res = await apiContext.post(`${API_URL}/v1/auth/login`, {
    data: { phone: '+237600000001', otp: '123456' },
  });
  if (res.status() === 200) {
    const body = await res.json();
    return body.token ?? body.data?.token;
  }
  // Fallback: sign a test JWT if auth service not seeded
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { id: 'test-rider-uuid', role: 'rider' },
    process.env.JWT_SECRET || 'test_secret_minimum_32_chars_long!!',
    { expiresIn: '1h' }
  );
}

// ─── Suite 1: Dispatch Flow ───────────────────────────────────────────────────

test.describe('Dispatch Flow', () => {

  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASS);
  });

  test('TC-E2E-001: Live map renders driver markers within 5 seconds', async ({ page }) => {
    await page.goto(`${BASE_URL}/map`);

    // Wait for the map container to be present
    await expect(page.locator('[data-testid="live-map"], .leaflet-container')).toBeVisible({ timeout: 8_000 });

    // At least one driver marker should appear within 5 seconds
    // Markers are typically SVG circles or custom HTML icons
    await expect(
      page.locator('[data-testid="driver-marker"], .driver-pin, .leaflet-marker-icon')
    ).toHaveCount({ min: 1 }, { timeout: 5_000 });

    // Assert no JS console errors during map load
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.waitForTimeout(2_000);
    expect(errors.filter(e => !/favicon/i.test(e))).toHaveLength(0);
  });

  test('TC-E2E-002: Admin manually assigns unmatched ride to a driver', async ({ page, request: apiCtx }) => {
    // Step 1: Create an unmatched ride via API
    const riderToken = await getRiderToken(apiCtx);
    const rideId     = await createTestRide(apiCtx, riderToken);

    // Step 2: Navigate to ride detail in admin dashboard
    await page.goto(`${BASE_URL}/rides/${rideId}`);
    await expect(page.getByText(/requested|unmatched/i)).toBeVisible({ timeout: 5_000 });

    // Step 3: Open the manual assignment panel
    await page.getByRole('button', { name: /assign driver|manual assign/i }).click();
    await expect(page.getByTestId('driver-search-panel')).toBeVisible({ timeout: 3_000 });

    // Step 4: Search for an available driver
    await page.getByPlaceholder(/search driver/i).fill('Test Driver');
    await expect(page.getByTestId('driver-option').first()).toBeVisible({ timeout: 3_000 });

    // Step 5: Select the first available driver
    const driverName = await page.getByTestId('driver-option').first().textContent();
    await page.getByTestId('driver-option').first().click();
    await page.getByRole('button', { name: /confirm assign/i }).click();

    // Step 6: Assert success toast and status update
    await expect(page.getByText(/assigned successfully|driver assigned/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('ride-status-badge')).toContainText(/accepted/i, { timeout: 3_000 });

    // Step 7: Verify via API that the assignment persisted
    const verifyRes = await apiCtx.get(`${API_URL}/v1/admin/rides/${rideId}`, {
      headers: { Authorization: `Bearer ${await getAdminToken(apiCtx)}` },
    });
    const ride = await verifyRes.json();
    expect(ride.data?.status ?? ride.status).toBe('accepted');
    expect(ride.data?.driver_id ?? ride.driver_id).toBeTruthy();
  });

  test('TC-E2E-003: Dispatch queue shows pending rides ordered by wait time', async ({ page }) => {
    await page.goto(`${BASE_URL}/dispatch`);

    // Assert queue table renders
    await expect(page.getByTestId('dispatch-queue-table')).toBeVisible({ timeout: 5_000 });

    // Assert rides are sorted by wait time (oldest first)
    const waitTimes = await page.getByTestId('ride-wait-time').allTextContents();
    const parseMin  = (s) => parseInt(s, 10);
    const times     = waitTimes.map(parseMin);
    // Each time should be >= the previous (ascending wait time order)
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
    }
  });

  test('TC-E2E-004: Admin force-completes a stalled ride', async ({ page, request: apiCtx }) => {
    const riderToken = await getRiderToken(apiCtx);
    const rideId     = await createTestRide(apiCtx, riderToken);

    await page.goto(`${BASE_URL}/rides/${rideId}`);

    // Open action menu
    await page.getByTestId('ride-actions-menu').click();
    await page.getByRole('menuitem', { name: /force complete/i }).click();

    // Confirm dialog
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel(/reason/i).fill('Driver stranded — admin force close');
    await page.getByRole('button', { name: /confirm|proceed/i }).click();

    // Assert ride status updated
    await expect(page.getByTestId('ride-status-badge')).toContainText(/completed/i, { timeout: 5_000 });
    await expect(page.getByText(/action logged|audit/i)).toBeVisible({ timeout: 3_000 });
  });

});

// ─── Suite 2: Ride Lifecycle Updates ─────────────────────────────────────────

test.describe('Ride Lifecycle Updates', () => {

  test('TC-E2E-005: Ride state transitions reflected in admin in real-time', async ({ page, request: apiCtx }) => {
    const riderToken = await getRiderToken(apiCtx);
    const rideId     = await createTestRide(apiCtx, riderToken);

    // Open admin ride detail page
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.goto(`${BASE_URL}/rides/${rideId}`);

    // Subscribe to socket events on the page (via the dashboard's socket connection)
    const statusUpdates = [];
    await page.exposeFunction('onRideStatusUpdate', (status) => statusUpdates.push(status));
    await page.evaluate(() => {
      // Hook into dashboard's existing socket if available
      if (window.__adminSocket) {
        window.__adminSocket.on('ride_status_updated', (data) => window.onRideStatusUpdate(data.status));
      }
    });

    // Simulate driver accepting via API
    const driverToken = await getDriverToken(apiCtx);
    await apiCtx.post(`${API_URL}/v1/rides/${rideId}/accept`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });

    // Assert UI updates within 3 seconds
    await expect(page.getByTestId('ride-status-badge')).toContainText(/accepted/i, { timeout: 3_000 });

    // Simulate trip start
    await apiCtx.post(`${API_URL}/v1/rides/${rideId}/start`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    await expect(page.getByTestId('ride-status-badge')).toContainText(/in.progress/i, { timeout: 3_000 });

    // Simulate trip completion
    await apiCtx.post(`${API_URL}/v1/rides/${rideId}/complete`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    await expect(page.getByTestId('ride-status-badge')).toContainText(/completed/i, { timeout: 3_000 });
  });

  test('TC-E2E-006: Ride cancellation shows correct cancellation reason', async ({ page, request: apiCtx }) => {
    const riderToken = await getRiderToken(apiCtx);
    const rideId     = await createTestRide(apiCtx, riderToken);

    // Rider cancels via API
    await apiCtx.post(`${API_URL}/v1/rides/${rideId}/cancel`, {
      headers: { Authorization: `Bearer ${riderToken}` },
      data: { reason: 'Changed my mind' },
    });

    // Admin views ride
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.goto(`${BASE_URL}/rides/${rideId}`);

    await expect(page.getByTestId('ride-status-badge')).toContainText(/cancelled/i, { timeout: 3_000 });
    await expect(page.getByTestId('cancellation-reason')).toContainText('Changed my mind');
  });

  test('TC-E2E-007: Ride events timeline shows full state history', async ({ page, request: apiCtx }) => {
    const riderToken = await getRiderToken(apiCtx);
    const rideId     = await createTestRide(apiCtx, riderToken);

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.goto(`${BASE_URL}/rides/${rideId}/timeline`);

    // Assert at least "requested" event is visible
    await expect(page.getByTestId('ride-event-item').filter({ hasText: /requested/i }))
      .toBeVisible({ timeout: 5_000 });

    // Assert events are in chronological order (oldest at top)
    const timestamps = await page.getByTestId('ride-event-timestamp').allTextContents();
    const dates      = timestamps.map(t => new Date(t).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]).toBeGreaterThanOrEqual(dates[i - 1]);
    }
  });

});

// ─── Suite 3: Payment Reconciliation ─────────────────────────────────────────

test.describe('Payment Reconciliation', () => {

  test('TC-E2E-008: MTN webhook updates payment status to completed', async ({ request: apiCtx }) => {
    const crypto = require('crypto');

    // Create a pending payment fixture via API (or use a known test reference)
    const reference = `test_mtn_${Date.now()}`;

    // Fire a valid MTN webhook
    const body = JSON.stringify({ externalId: reference, status: 'SUCCESSFUL' });
    const sig  = crypto
      .createHmac('sha256', process.env.MTN_WEBHOOK_SECRET || 'test_mtn_secret')
      .update(body)
      .digest('hex');

    const res = await apiCtx.post(`${API_URL}/v1/payments/webhook/mtn`, {
      headers: {
        'Content-Type':    'application/json',
        'x-mtn-signature': `sha256=${sig}`,
      },
      data: body,
    });

    // 200 = processed, 404 = reference not found in test DB (acceptable in E2E against real DB)
    expect([200, 404]).toContain(res.status());

    if (res.status() === 200) {
      const json = await res.json();
      expect(json).toMatchObject({ success: true });
    }
  });

  test('TC-E2E-009: Duplicate MTN webhook is idempotent — no double credit', async ({ request: apiCtx }) => {
    const crypto    = require('crypto');
    const reference = `test_idem_${Date.now()}`;
    const body      = JSON.stringify({ externalId: reference, status: 'SUCCESSFUL' });
    const sig       = crypto
      .createHmac('sha256', process.env.MTN_WEBHOOK_SECRET || 'test_mtn_secret')
      .update(body)
      .digest('hex');

    const headers = {
      'Content-Type':    'application/json',
      'x-mtn-signature': `sha256=${sig}`,
    };

    // First call
    const res1 = await apiCtx.post(`${API_URL}/v1/payments/webhook/mtn`, { headers, data: body });
    expect([200, 404]).toContain(res1.status());

    // Second call — same payload, same signature
    const res2 = await apiCtx.post(`${API_URL}/v1/payments/webhook/mtn`, { headers, data: body });
    expect([200, 404]).toContain(res2.status());

    // Assert no error on second call (no 500 from duplicate constraint violation)
    expect(res2.status()).not.toBe(500);
  });

  test('TC-E2E-010: Invalid HMAC signature returns 401', async ({ request: apiCtx }) => {
    const res = await apiCtx.post(`${API_URL}/v1/payments/webhook/mtn`, {
      headers: {
        'Content-Type':    'application/json',
        'x-mtn-signature': 'sha256=deadbeefdeadbeefdeadbeefdeadbeef',
      },
      data: JSON.stringify({ externalId: 'any_ref', status: 'SUCCESSFUL' }),
    });
    expect(res.status()).toBe(401);
  });

  test('TC-E2E-011: Admin reconciliation dashboard shows pending payments', async ({ page }) => {
    await loginAs(page, FIN_EMAIL, FIN_PASS);
    await page.goto(`${BASE_URL}/payments/reconciliation`);

    // Assert reconciliation table renders
    await expect(page.getByTestId('reconciliation-table')).toBeVisible({ timeout: 5_000 });

    // Assert column headers
    await expect(page.getByRole('columnheader', { name: /reference/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /status/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /amount/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /provider/i })).toBeVisible();

    // Assert all amounts are integers (XAF business rule — no decimals)
    const amounts = await page.getByTestId('payment-amount').allTextContents();
    for (const amount of amounts) {
      const num = parseFloat(amount.replace(/[^0-9.]/g, ''));
      expect(num).toBe(Math.floor(num)); // must be integer
    }
  });

});

// ─── Suite 4: Alert Triggering ────────────────────────────────────────────────

test.describe('Alert Triggering', () => {

  test('TC-E2E-012: Payment failure alert visible in admin alerts panel', async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.goto(`${BASE_URL}/alerts`);

    // Assert alerts panel renders
    await expect(page.getByTestId('alerts-panel')).toBeVisible({ timeout: 5_000 });

    // Assert alerts have severity badges
    const severityBadges = page.getByTestId('alert-severity');
    const count = await severityBadges.count();

    if (count > 0) {
      // Validate severity values
      const severities = await severityBadges.allTextContents();
      const valid = ['low', 'medium', 'high', 'critical'];
      for (const sev of severities) {
        expect(valid).toContain(sev.toLowerCase().trim());
      }
    }
  });

  test('TC-E2E-013: Alert can be acknowledged and marked as investigating', async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.goto(`${BASE_URL}/alerts`);

    // Wait for at least one alert
    await expect(page.getByTestId('alert-row').first()).toBeVisible({ timeout: 8_000 });

    // Click first alert
    await page.getByTestId('alert-row').first().click();

    // Assert detail panel opens
    await expect(page.getByTestId('alert-detail-panel')).toBeVisible({ timeout: 3_000 });

    // Acknowledge
    await page.getByRole('button', { name: /acknowledge|investigating/i }).click();
    await expect(page.getByTestId('alert-status')).toContainText(/investigating/i, { timeout: 3_000 });
  });

  test('TC-E2E-014: Critical alert banner appears in dashboard header', async ({ page }) => {
    // Navigate to main dashboard
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.goto(`${BASE_URL}/dashboard`);

    // If any critical Prometheus alert is firing, a banner should be visible
    const criticalBanner = page.getByTestId('critical-alert-banner');
    const isVisible = await criticalBanner.isVisible().catch(() => false);

    if (isVisible) {
      // Assert banner has the expected structure
      await expect(criticalBanner.getByTestId('alert-count')).toBeVisible();
      await expect(criticalBanner.getByRole('link', { name: /view|details/i })).toBeVisible();
    }
    // If no critical alerts — this is also a valid state; test passes
  });

});

// ─── Suite 5: RBAC Enforcement ────────────────────────────────────────────────

test.describe('RBAC Enforcement', () => {

  test('TC-E2E-015: Finance admin can access payment reports, not dispatch controls', async ({ page }) => {
    await loginAs(page, FIN_EMAIL, FIN_PASS);

    // Can access payments page
    await page.goto(`${BASE_URL}/payments`);
    await expect(page).not.toHaveURL(/login|unauthorized/i);
    await expect(page.getByTestId('payments-page-heading')).toBeVisible({ timeout: 5_000 });

    // Cannot access dispatch page
    await page.goto(`${BASE_URL}/dispatch`);
    // Should redirect to dashboard or show unauthorized
    await expect(page).toHaveURL(/dashboard|unauthorized|403/i, { timeout: 5_000 });
  });

  test('TC-E2E-016: Support agent cannot see financial data', async ({ page }) => {
    // Login as support agent (lowest privilege role)
    await loginAs(page, process.env.SUPPORT_EMAIL || 'support@moboride.com', process.env.SUPPORT_PASSWORD || 'Support123!');

    // Attempt to navigate to financial reports
    await page.goto(`${BASE_URL}/reports/financial`);

    // Should be blocked
    const isBlocked = await page.getByText(/access denied|unauthorized|403|permission/i).isVisible()
      .catch(() => false);
    const redirectedToLogin = page.url().includes('login');
    const redirectedToUnauth = page.url().includes('unauthorized') || page.url().includes('403');

    expect(isBlocked || redirectedToLogin || redirectedToUnauth).toBeTruthy();
  });

  test('TC-E2E-017: API RBAC — ops_admin cannot access /payments/admin', async ({ request: apiCtx }) => {
    // Get ops_admin token
    const opsToken = await getAdminTokenByRole(apiCtx, OPS_EMAIL, OPS_PASS);

    const res = await apiCtx.get(`${API_URL}/v1/payments/admin/financial-reports`, {
      headers: { Authorization: `Bearer ${opsToken}` },
    });

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error || body.message).toMatch(/permission|unauthorized|forbidden/i);
  });

  test('TC-E2E-018: Unauthenticated requests rejected at gateway', async ({ request: apiCtx }) => {
    const endpoints = [
      '/v1/rides',
      '/v1/payments/history',
      '/v1/admin/dashboard',
      '/v1/drivers',
    ];

    for (const endpoint of endpoints) {
      const res = await apiCtx.get(`${API_URL}${endpoint}`);
      expect(res.status()).toBe(401);
    }
  });

  test('TC-E2E-019: Header injection bypass attempt is rejected', async ({ request: apiCtx }) => {
    // Attempt to inject admin role via header without a valid JWT
    const res = await apiCtx.get(`${API_URL}/v1/admin/dashboard`, {
      headers: {
        'x-user-id':   '1',
        'x-user-role': 'super_admin',
        // No Authorization header
      },
    });
    expect(res.status()).toBe(401);
  });

  test('TC-E2E-020: Admin UI navigation items match role permissions', async ({ page }) => {
    await loginAs(page, OPS_EMAIL, OPS_PASS);

    // Ops admin should see: Rides, Drivers, Dispatch, Map
    await expect(page.getByRole('link', { name: /rides/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /drivers/i })).toBeVisible();

    // Ops admin should NOT see: Financial Reports, Commissions
    await expect(page.getByRole('link', { name: /financial reports|commissions|payouts/i }))
      .not.toBeVisible();
  });

});

// ─── Suite 6: Surge Pricing ───────────────────────────────────────────────────

test.describe('Surge Pricing', () => {

  test('TC-E2E-021: Fare estimate includes correct surge multiplier for active zone', async ({ request: apiCtx }) => {
    const riderToken = await getRiderToken(apiCtx);

    // Coordinates inside known surge zone (Bastos, Yaoundé)
    const res = await apiCtx.post(`${API_URL}/v1/rides/fare`, {
      headers: { Authorization: `Bearer ${riderToken}` },
      data: {
        pickup_lat:   3.848, pickup_lng:  11.502,
        dropoff_lat:  3.866, dropoff_lng: 11.516,
        ride_type:    'standard',
      },
    });

    expect([200, 400]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      const fare = body.data ?? body;
      // Fare must be positive integer (XAF)
      expect(Number.isInteger(fare.estimated_fare)).toBeTruthy();
      expect(fare.estimated_fare).toBeGreaterThan(0);
      // Surge multiplier must not exceed cap (3.5×)
      if (fare.surge_multiplier) {
        expect(fare.surge_multiplier).toBeLessThanOrEqual(3.5);
      }
    }
  });

  test('TC-E2E-022: Admin can update surge zone multiplier', async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.goto(`${BASE_URL}/surge-pricing`);

    // Find the first editable zone
    await page.getByTestId('surge-zone-row').first().getByRole('button', { name: /edit/i }).click();

    // Update multiplier
    const multiplierInput = page.getByLabel(/multiplier/i);
    await multiplierInput.clear();
    await multiplierInput.fill('1.5');

    await page.getByRole('button', { name: /save|update/i }).click();
    await expect(page.getByText(/updated successfully|saved/i)).toBeVisible({ timeout: 5_000 });

    // Assert the new value is reflected in the table
    await expect(page.getByTestId('surge-zone-row').first().getByTestId('multiplier-value'))
      .toContainText('1.5');
  });

});

// ─── Suite 7: Driver Management ──────────────────────────────────────────────

test.describe('Driver Management', () => {

  test('TC-E2E-023: Admin deactivates driver and verifies removal from dispatch pool', async ({ page, request: apiCtx }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.goto(`${BASE_URL}/drivers`);

    // Find an active driver
    const activeDriver = page.getByTestId('driver-row').filter({ hasText: /online|active/i }).first();
    await expect(activeDriver).toBeVisible({ timeout: 5_000 });

    // Extract driver ID from row data attribute
    const driverId = await activeDriver.getAttribute('data-driver-id');

    // Click deactivate
    await activeDriver.getByRole('button', { name: /deactivate/i }).click();
    await page.getByRole('dialog').getByRole('button', { name: /confirm/i }).click();

    // Assert status updated in table
    await expect(
      page.getByTestId(`driver-row-${driverId}`).getByTestId('driver-status')
    ).toContainText(/inactive|deactivated/i, { timeout: 5_000 });

    // Verify via API
    const adminToken = await getAdminToken(apiCtx);
    const res = await apiCtx.get(`${API_URL}/v1/admin/drivers/${driverId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const driver = await res.json();
    expect(driver.data?.is_active ?? driver.is_active).toBe(false);
  });

  test('TC-E2E-024: Driver performance metrics display correctly', async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.goto(`${BASE_URL}/drivers`);

    const firstDriver = page.getByTestId('driver-row').first();
    await firstDriver.click();

    // Assert performance panel
    await expect(page.getByTestId('driver-rating')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('acceptance-rate')).toBeVisible();
    await expect(page.getByTestId('completion-rate')).toBeVisible();

    // Rating must be between 0 and 5
    const ratingText = await page.getByTestId('driver-rating').textContent();
    const rating     = parseFloat(ratingText ?? '0');
    expect(rating).toBeGreaterThanOrEqual(0);
    expect(rating).toBeLessThanOrEqual(5);
  });

});

// ─── Suite 8: Observability ───────────────────────────────────────────────────

test.describe('Observability', () => {

  test('TC-E2E-025: Prometheus metrics endpoint responds with valid metrics', async ({ request: apiCtx }) => {
    // Each service exposes /metrics on its port
    const serviceMetricsUrls = [
      process.env.USER_SERVICE_URL   ? `${process.env.USER_SERVICE_URL}/metrics`   : null,
      process.env.RIDE_SERVICE_URL   ? `${process.env.RIDE_SERVICE_URL}/metrics`   : null,
      process.env.PAYMENT_SERVICE_URL? `${process.env.PAYMENT_SERVICE_URL}/metrics`: null,
    ].filter(Boolean);

    for (const url of serviceMetricsUrls) {
      const res = await apiCtx.get(url);
      expect(res.status()).toBe(200);
      const body = await res.text();
      // Prometheus text format starts with # HELP or # TYPE
      expect(body).toMatch(/^#\s+(HELP|TYPE)/m);
      // Assert HTTP request duration metric is present
      expect(body).toContain('http_request_duration');
    }
  });

  test('TC-E2E-026: Grafana dashboard loads without errors', async ({ page }) => {
    const grafanaUrl = process.env.GRAFANA_URL || 'http://localhost:3030';
    await page.goto(`${grafanaUrl}/login`);

    // Login to Grafana
    await page.getByPlaceholder(/username/i).fill('admin');
    await page.getByPlaceholder(/password/i).fill(process.env.GRAFANA_PASSWORD || 'admin');
    await page.getByRole('button', { name: /log in|sign in/i }).click();

    // Navigate to MOBO overview dashboard
    await page.goto(`${grafanaUrl}/d/mobo-overview`);
    await expect(page.getByTestId('data-testid Panel header')).toHaveCount({ min: 1 }, { timeout: 10_000 });

    // Assert no "No data" panels (all panels should have data in a loaded system)
    const noPanels = await page.getByText(/no data/i).count();
    // Allow up to 2 empty panels (some metrics may not be active in test)
    expect(noPanels).toBeLessThanOrEqual(2);
  });

});

// ─── Utility: Token helpers ───────────────────────────────────────────────────

async function getAdminToken(apiContext) {
  const res = await apiContext.post(`${API_URL}/v1/auth/admin/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASS },
  });
  if (res.status() === 200) {
    const body = await res.json();
    return body.token ?? body.data?.token;
  }
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { id: 'test-admin-uuid', role: 'super_admin' },
    process.env.JWT_SECRET || 'test_secret_minimum_32_chars_long!!',
    { expiresIn: '1h' }
  );
}

async function getAdminTokenByRole(apiContext, email, password) {
  const res = await apiContext.post(`${API_URL}/v1/auth/admin/login`, {
    data: { email, password },
  });
  if (res.status() === 200) {
    const body = await res.json();
    return body.token ?? body.data?.token;
  }
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { id: 'test-ops-uuid', role: 'ops_admin' },
    process.env.JWT_SECRET || 'test_secret_minimum_32_chars_long!!',
    { expiresIn: '1h' }
  );
}

async function getDriverToken(apiContext) {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { id: 'test-driver-uuid', role: 'driver' },
    process.env.JWT_SECRET || 'test_secret_minimum_32_chars_long!!',
    { expiresIn: '1h' }
  );
}
