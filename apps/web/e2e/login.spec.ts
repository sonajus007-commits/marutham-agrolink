import { test, expect } from '@playwright/test';

// Smoke coverage for the front door. No backend: an anonymous visit makes no API
// call (AuthContext skips /auth/me when there is no token), so these run against the
// static preview build. The one test that submits mocks /api/auth/login.

test('an anonymous visit is redirected to the login screen', async ({ page }) => {
  await page.goto('./'); // → /app/, which RoleHome redirects to /app/login
  await expect(page).toHaveURL(/\/app\/login$/);

  // The login form is present and usable without any backend.
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.locator('#phone')).toBeVisible();
  await expect(page.locator('#password')).toBeVisible();
});

test('the auth tabs honour the ARIA roving-tabindex keyboard pattern', async ({ page }) => {
  await page.goto('login');

  const tabs = page.getByRole('tab');
  const passwordTab = tabs.first();
  const otpTab = tabs.nth(1);

  // Password is selected on load; the OTP panel is not shown yet.
  await expect(passwordTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#password')).toBeVisible();

  // ArrowRight moves selection to the OTP tab and swaps the panel in.
  await passwordTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(otpTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#password')).toHaveCount(0);
});

test('a rejected login surfaces the error banner and stays on the login screen', async ({
  page,
}) => {
  // Mock the auth endpoint so no backend is required; the client turns a non-2xx
  // into a thrown Error that the form shows in its role="alert" banner.
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Invalid phone or password.' }),
    });
  });

  await page.goto('login');
  await page.locator('#phone').fill('9876543210');
  await page.locator('#password').fill('wrong-password');
  await page.locator('button[type="submit"]').click();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/app\/login$/);
});
