import { test, expect } from '@playwright/test';

test.describe('Host and Agent Workflow', () => {
  test('agents page displays registered agents', async ({ page }) => {
    await page.goto('/agents');

    // Wait for the table to populate
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15000 });

    await expect(page.getByText('e2e-test-host').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/windows/i).first()).toBeVisible();
  });

  test('hosts page displays hosts', async ({ page }) => {
    await page.goto('/hosts');

    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('e2e-test-host').first()).toBeVisible({ timeout: 10000 });
  });
});
