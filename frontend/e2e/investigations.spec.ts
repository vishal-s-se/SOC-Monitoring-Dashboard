import { test, expect } from '@playwright/test';

test.describe('Investigation Workflow', () => {
  test('investigation page loads and renders components', async ({ page }) => {
    await page.goto('/investigations');

    const title = page.getByRole('heading', { name: 'Investigations', exact: true });
    await expect(title).toBeVisible({ timeout: 10000 });
  });
});
