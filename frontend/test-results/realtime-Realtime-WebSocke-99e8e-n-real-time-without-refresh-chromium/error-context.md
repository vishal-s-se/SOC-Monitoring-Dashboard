# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: realtime.spec.ts >> Realtime WebSocket >> receives new events in real-time without refresh
- Location: e2e\realtime.spec.ts:4:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('ws-user-1791455566441')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText('ws-user-1791455566441') with timeout 10000ms
  - waiting for getByText('ws-user-1791455566441')

```

```yaml
- navigation:
  - heading "SOC Monitor" [level=1]
  - list:
    - listitem:
      - link "Overview":
        - /url: /
    - listitem:
      - link "Live Events":
        - /url: /live-events
    - listitem:
      - link "Hosts":
        - /url: /hosts
    - listitem:
      - link "Windows Logs":
        - /url: /windows-logs
    - listitem:
      - link "Linux Logs":
        - /url: /linux-logs
    - listitem:
      - link "Firewall":
        - /url: /firewall
    - listitem:
      - link "Network":
        - /url: /network
    - listitem:
      - link "Authentication":
        - /url: /authentication
    - listitem:
      - link "Processes":
        - /url: /processes
    - listitem:
      - link "Alerts":
        - /url: /alerts
    - listitem:
      - link "Investigations":
        - /url: /investigations
    - listitem:
      - link "Behavioral Analytics":
        - /url: /analytics
    - listitem:
      - link "SOC Metrics":
        - /url: /metrics
    - listitem:
      - link "Attack Timeline":
        - /url: /attack-timeline
    - listitem:
      - link "IP Investigation":
        - /url: /ip-investigation
    - listitem:
      - link "Host Investigation":
        - /url: /host-investigation
    - listitem:
      - link "User Context":
        - /url: /user-context
    - listitem:
      - link "MITRE ATT&CK":
        - /url: /mitre
    - listitem:
      - link "Raw Logs":
        - /url: /raw-logs
    - listitem:
      - link "Agents":
        - /url: /agents
    - listitem:
      - link "Reports":
        - /url: /reports
    - listitem:
      - link "System Health":
        - /url: /system-health
    - listitem:
      - link "Settings":
        - /url: /settings
- banner: "SOC Monitor MAIN ENVIRONMENT API: CHECKING Real-Time: DISCONNECTED A"
- main:
  - paragraph: Loading events...
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Realtime WebSocket', () => {
  4  |   test('receives new events in real-time without refresh', async ({ page, request }) => {
  5  |     await page.goto('/live-events');
  6  | 
  7  |     // Wait for the websocket to connect
  8  |     await page.waitForTimeout(2000);
  9  | 
  10 |     const uniqueUsername = `ws-user-${Date.now()}`;
  11 | 
  12 |     // Send an event directly to the collector API
  13 |     await request.post('http://localhost:5000/api/v1/agent/events', {
  14 |       headers: {
  15 |         'X-Agent-Auth': 'changeme_secret',
  16 |         'Content-Type': 'application/json'
  17 |       },
  18 |       data: {
  19 |         event_id: `ws-${Date.now()}`,
  20 |         agent_id: "11111111-1111-1111-1111-111111111111", // Hardcoded ID from e2e_seed
  21 |         hostname: "e2e-test-host",
  22 |         timestamp: new Date().toISOString(),
  23 |         event_type: "auth",
  24 |         source: "linux",
  25 |         payload: JSON.stringify({ message: `Accepted publickey for ${uniqueUsername} from 10.0.0.2`, process: "sshd" })
  26 |       }
  27 |     });
  28 | 
  29 |     // We should see the new event appear without reloading
> 30 |     await expect(page.getByText(uniqueUsername)).toBeVisible({ timeout: 10000 });
     |                                                  ^ Error: expect(locator).toBeVisible() failed
  31 |   });
  32 | });
  33 | 
```