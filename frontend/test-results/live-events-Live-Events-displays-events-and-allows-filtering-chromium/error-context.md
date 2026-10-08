# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: live-events.spec.ts >> Live Events >> displays events and allows filtering
- Location: e2e\live-events.spec.ts:4:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('e2e-test-host').first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText('e2e-test-host').first() with timeout 10000ms
  - waiting for getByText('e2e-test-host').first()

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
  3  | test.describe('Live Events', () => {
  4  |   test('displays events and allows filtering', async ({ page }) => {
  5  |     await page.goto('/live-events');
  6  | 
  7  |     // The seed data should have 'authentication' and 'windows' events
> 8  |     await expect(page.getByText('e2e-test-host').first()).toBeVisible({ timeout: 10000 });
     |                                                           ^ Error: expect(locator).toBeVisible() failed
  9  |     
  10 |     // Check Pause/Live toggle works
  11 |     await expect(page.getByRole('button', { name: /Live Updates ON/i })).toBeVisible();
  12 |     await page.getByRole('button', { name: /Live Updates ON/i }).click();
  13 |     await expect(page.getByRole('button', { name: /Paused/i })).toBeVisible();
  14 |   });
  15 | });
  16 | 
```