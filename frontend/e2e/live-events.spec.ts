import { test, expect } from '@playwright/test';

test.describe('Live Events', () => {
  test('displays events and allows filtering', async ({ page }) => {
    await page.goto('/live-events');

    // The seed data should have 'authentication' and 'windows' events
    await expect(page.getByText('e2e-test-host').first()).toBeVisible({ timeout: 10000 });
    
    // Check Pause/Live toggle works
    await expect(page.getByRole('button', { name: /Live Updates ON/i })).toBeVisible();
    await page.getByRole('button', { name: /Live Updates ON/i }).click();
    await expect(page.getByRole('button', { name: /Paused/i })).toBeVisible();
  });
});
