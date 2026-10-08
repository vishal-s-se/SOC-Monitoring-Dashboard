import { test, expect } from '@playwright/test';

test.describe('Raw Logs Workflow', () => {
  test('raw logs page loads and displays raw event data', async ({ page }) => {
    await page.goto('/raw-logs');

    // The seed data uses 'linux' as the source for raw logs
    await expect(page.getByText(/linux/i).first()).toBeVisible({ timeout: 10000 });
  });
});
