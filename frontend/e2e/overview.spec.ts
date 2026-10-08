import { test, expect } from '@playwright/test';

test.describe('Overview Dashboard', () => {
  test('loads successfully and displays critical metrics', async ({ page }) => {
    await page.goto('/');

    // Check title or main header
    await expect(page).toHaveTitle(/SOC Monitor/i);
    
    // Check navigation renders
    await expect(page.locator('nav')).toBeVisible();

    // Check summary cards
    await expect(page.getByText('Total Alerts').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Open Alerts').first()).toBeVisible();
    
    // Active hosts/agents section
    await expect(page.getByText('Total Agents').first()).toBeVisible();

    // Recent alerts should render
    await expect(page.getByText('Recent Alerts').first()).toBeVisible();
  });
});
