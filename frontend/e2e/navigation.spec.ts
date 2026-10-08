import { test, expect } from '@playwright/test';

const ROUTES = [
  '/',
  '/live-events',
  '/hosts',
  '/alerts',
  '/investigations',
  '/raw-logs',
  '/agents'
];

test.describe('Navigation Regression', () => {
  for (const route of ROUTES) {
    test(`route ${route} loads without crashing`, async ({ page }) => {
      await page.goto(route);
      
      // Give it time to load network requests and render
      await page.waitForTimeout(500);
      
      // Should not have any obvious error boundary text
      await expect(page.getByText('Something went wrong')).not.toBeVisible();
      
      // Main navigation should always be visible
      await expect(page.locator('nav')).toBeVisible();
    });
  }
});
