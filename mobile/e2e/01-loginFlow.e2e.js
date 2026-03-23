describe('Authentication Flow', () => {
  beforeAll(async () => {
    await device.launchApp({
      permissions: { location: 'always', notifications: 'YES' }
    });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('should show the login screen on startup', async () => {
    // Requires testID="phone-input" on the TextInput in LoginScreen.js
    await expect(element(by.id('phone-input'))).toBeVisible();
    await expect(element(by.id('continue-button'))).toBeVisible();
  });

  it('should allow user to enter phone number and request OTP', async () => {
    await element(by.id('phone-input')).typeText('677123456');
    await element(by.id('continue-button')).tap();
    
    // Assumes navigation to OTP screen
    await expect(element(by.text('Enter Verification Code'))).toBeVisible();
  });
  
  it('should log in upon entering valid OTP', async () => {
    // Entering a mocked OTP for staging environments
    await element(by.id('otp-input')).typeText('123456');
    await element(by.id('verify-button')).tap();
    
    // Assumes successful login lands on the Home screen map
    await expect(element(by.id('home-map-view'))).toBeVisible();
  });
});
