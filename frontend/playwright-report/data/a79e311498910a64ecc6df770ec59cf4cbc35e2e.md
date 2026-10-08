# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: overview.spec.ts >> Overview Dashboard >> loads successfully and displays critical metrics
- Location: e2e\overview.spec.ts:4:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Total Alerts').first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText('Total Alerts').first() with timeout 10000ms
  - waiting for getByText('Total Alerts').first()

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
  - paragraph: Loading dashboard overview...
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Overview Dashboard', () => {
  4  |   test('loads successfully and displays critical metrics', async ({ page }) => {
  5  |     await page.goto('/');
  6  | 
  7  |     // Check title or main header
  8  |     await expect(page).toHaveTitle(/SOC Monitor/i);
  9  |     
  10 |     // Check navigation renders
  11 |     await expect(page.locator('nav')).toBeVisible();
  12 | 
  13 |     // Check summary cards
> 14 |     await expect(page.getByText('Total Alerts').first()).toBeVisible({ timeout: 10000 });
     |                                                          ^ Error: expect(locator).toBeVisible() failed
  15 |     await expect(page.getByText('Open Alerts').first()).toBeVisible();
  16 |     
  17 |     // Active hosts/agents section
  18 |     await expect(page.getByText('Total Agents').first()).toBeVisible();
  19 | 
  20 |     // Recent alerts should render
  21 |     await expect(page.getByText('Recent Alerts').first()).toBeVisible();
  22 |   });
  23 | });
  24 | 
```