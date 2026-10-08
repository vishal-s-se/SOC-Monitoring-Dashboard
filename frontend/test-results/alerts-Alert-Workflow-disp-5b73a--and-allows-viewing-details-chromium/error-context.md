# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: alerts.spec.ts >> Alert Workflow >> displays alerts and allows viewing details
- Location: e2e\alerts.spec.ts:4:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Unexpected admin login').first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText('Unexpected admin login').first() with timeout 10000ms
  - waiting for getByText('Unexpected admin login').first()

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
  - paragraph: Loading alerts...
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Alert Workflow', () => {
  4  |   test('displays alerts and allows viewing details', async ({ page }) => {
  5  |     await page.goto('/alerts');
  6  | 
  7  |     // The seed data created RULE-004 alert
> 8  |     await expect(page.getByText('Unexpected admin login').first()).toBeVisible({ timeout: 10000 });
     |                                                                    ^ Error: expect(locator).toBeVisible() failed
  9  |     await expect(page.getByText('HIGH').first()).toBeVisible();
  10 |     await expect(page.getByText('OPEN').first()).toBeVisible();
  11 |   });
  12 | });
  13 | 
```