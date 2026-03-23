/**
 * Ride Booking Flow — E2E Tests
 *
 * Self-contained: logs in before tests, logs out after.
 * Does NOT depend on state from the login flow test suite.
 */
const { loginAsRider, logout } = require('./helpers/auth');

const TIMEOUT = 15_000;

describe('Ride Booking Flow', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      permissions: { location: 'always', notifications: 'YES' },
    });
    // Self-contained auth — does not rely on suite 01 state
    await loginAsRider();
  });

  afterAll(async () => {
    await logout();
  });

  beforeEach(async () => {
    // Navigate back to home screen between tests
    await device.reloadReactNative();
    await waitFor(element(by.id('home-map-view'))).toBeVisible().withTimeout(TIMEOUT);
  });

  it('should display the home screen map and "Where to?" pill', async () => {
    await expect(element(by.id('home-map-view'))).toBeVisible();
    await expect(element(by.id('where-to-pill'))).toBeVisible();
  });

  it('should let the user search for a destination and see results', async () => {
    await element(by.id('where-to-pill')).tap();

    const searchInput = element(by.id('destination-search-input'));
    await waitFor(searchInput).toBeVisible().withTimeout(TIMEOUT);
    await searchInput.typeText('Yaounde Airport');

    // Wait for autocomplete results to appear
    await waitFor(element(by.id('search-result-0')))
      .toBeVisible()
      .withTimeout(TIMEOUT);

    await element(by.id('search-result-0')).tap();
  });

  it('should display ride type options including standard', async () => {
    await expect(element(by.id('ride-type-standard'))).toBeVisible();
    await expect(element(by.id('ride-type-comfort'))).toBeVisible();
  });

  it('should allow selecting a ride type and confirming', async () => {
    await element(by.id('ride-type-standard')).tap();
    await element(by.id('confirm-ride-button')).tap();

    await waitFor(element(by.text('Finding your driver...')))
      .toBeVisible()
      .withTimeout(TIMEOUT);
  });

  it('should handle network error gracefully during destination search', async () => {
    // Simulate offline state
    await device.setURLBlacklist(['.*mobo-api-gateway.*']);

    await element(by.id('where-to-pill')).tap();
    const searchInput = element(by.id('destination-search-input'));
    await searchInput.typeText('Test Location Offline');

    // Should show empty results or offline message, not crash
    await waitFor(element(by.id('destination-search-input')))
      .toBeVisible()
      .withTimeout(TIMEOUT);

    // Re-enable network
    await device.setURLBlacklist([]);
  });
});
