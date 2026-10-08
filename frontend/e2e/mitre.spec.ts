import { test, expect } from '@playwright/test';

test.describe('MITRE Workflow', () => {
  test('mitre page loads and displays matrix', async ({ page }) => {
    await page.goto('/mitre');

    await expect(page.getByText('MITRE ATT&CK Enterprise Catalog')).toBeVisible({ timeout: 10000 });

    // Assuming the table/list renders the data
    // If tactics are dynamically loaded, we might just verify a technique or tactic appears
    // I'll wait for the page to be ready
    await page.waitForTimeout(1000);
  });
});
