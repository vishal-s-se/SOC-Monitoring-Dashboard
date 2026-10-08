# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: agents.spec.ts >> Host and Agent Workflow >> hosts page displays hosts
- Location: e2e\agents.spec.ts:14:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('tbody tr').first()
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" locator('tbody tr').first() with timeout 15000ms
  - waiting for locator('tbody tr').first()

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
- banner: "SOC Monitor MAIN ENVIRONMENT API: OFFLINE Real-Time: DISCONNECTED A"
- main:
  - img
  - heading "Error" [level=3]
  - paragraph: Could not validate credentials
  - button "Try Again"
- alert
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Host and Agent Workflow', () => {
  4  |   test('agents page displays registered agents', async ({ page }) => {
  5  |     await page.goto('/agents');
  6  | 
  7  |     // Wait for the table to populate
  8  |     await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15000 });
  9  | 
  10 |     await expect(page.getByText('e2e-test-host').first()).toBeVisible({ timeout: 10000 });
  11 |     await expect(page.getByText(/windows/i).first()).toBeVisible();
  12 |   });
  13 | 
  14 |   test('hosts page displays hosts', async ({ page }) => {
  15 |     await page.goto('/hosts');
  16 | 
> 17 |     await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15000 });
     |                                                    ^ Error: expect(locator).toBeVisible() failed
  18 |     await expect(page.getByText('e2e-test-host').first()).toBeVisible({ timeout: 10000 });
  19 |   });
  20 | });
  21 | 
```