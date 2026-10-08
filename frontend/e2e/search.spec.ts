import { test, expect } from '@playwright/test';

test.describe('Search and Filter Workflow', () => {
  test('search filters events', async ({ page }) => {
    await page.goto('/raw-logs');
    
    // The FilterInput doesn't have an ID or linked label, so we grab the text input
    const searchInput = page.locator('input[type="text"]').first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    // Type a term that matches nothing
    await searchInput.fill('xyz_nonexistent_term');
    await page.waitForTimeout(1000);

    // Results should be empty or no rows
    const count = await page.locator('tbody tr').count();
    expect(count === 0 || count === 1).toBeTruthy();
  });
});
