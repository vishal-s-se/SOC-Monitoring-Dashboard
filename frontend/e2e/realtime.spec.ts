import { test, expect } from '@playwright/test';

test.describe('Realtime WebSocket', () => {
  test('receives new events in real-time without refresh', async ({ page, request }) => {
    await page.goto('/live-events');

    // Wait for the websocket to connect
    await page.waitForTimeout(2000);

    const uniqueUsername = `ws-user-${Date.now()}`;

    // Send an event directly to the collector API
    await request.post('http://localhost:5000/api/v1/agent/events', {
      headers: {
        'X-Agent-Auth': 'changeme_secret',
        'Content-Type': 'application/json'
      },
      data: {
        event_id: `ws-${Date.now()}`,
        agent_id: "11111111-1111-1111-1111-111111111111", // Hardcoded ID from e2e_seed
        hostname: "e2e-test-host",
        timestamp: new Date().toISOString(),
        event_type: "auth",
        source: "linux",
        payload: JSON.stringify({ message: `Accepted publickey for ${uniqueUsername} from 10.0.0.2`, process: "sshd" })
      }
    });

    // We should see the new event appear without reloading
    await expect(page.getByText(uniqueUsername)).toBeVisible({ timeout: 10000 });
  });
});
