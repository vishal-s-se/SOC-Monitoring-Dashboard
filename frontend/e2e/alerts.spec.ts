import { test, expect } from '@playwright/test';

test.describe('Alert Workflow', () => {
  test('displays alerts and allows viewing details', async ({ page }) => {
    await page.goto('/alerts');

    // The seed data created RULE-004 alert
    await expect(page.getByText('Unexpected admin login').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('HIGH').first()).toBeVisible();
    await expect(page.getByText('OPEN').first()).toBeVisible();
  });
});
