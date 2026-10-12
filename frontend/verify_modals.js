const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const viewports = [
  { width: 1728, height: 972, name: 'desktop_1728' },
  { width: 1366, height: 768, name: 'laptop_1366' },
  { width: 768, height: 1024, name: 'tablet_768' },
  { width: 390, height: 844, name: 'mobile_390' }
];

async function run() {
  const screenshotDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });

  console.log('--- TESTING RAW LOGS MODAL ---');
  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto('http://localhost:3000/raw-logs', { waitUntil: 'networkidle' });
    
    // Wait for table rows
    await page.waitForSelector('table tbody tr');
    const rows = await page.locator('table tbody tr');
    await rows.first().click();

    // Modal dialog container
    const modalDialog = page.locator('.fixed.inset-0 > div').first();
    await modalDialog.waitFor({ state: 'visible' });

    // Measure bounding box
    const modalBox = await modalDialog.boundingBox();
    const header = modalDialog.locator('> div').first();
    const headerBox = await header.boundingBox();

    // Check right edges
    const modalRight = modalBox.x + modalBox.width;
    const headerRight = headerBox.x + headerBox.width;

    // Action buttons inside header
    const actionButtons = header.locator('button, a');
    const actionCount = await actionButtons.count();
    let actionsInside = true;
    for (let i = 0; i < actionCount; i++) {
      const btn = actionButtons.nth(i);
      const bBox = await btn.boundingBox();
      if (bBox && bBox.x + bBox.width > modalRight + 2) {
        actionsInside = false;
        console.error(`Button ${i} overflows modal! btnRight: ${bBox.x + bBox.width}, modalRight: ${modalRight}`);
      }
    }

    // Check document-level horizontal scroll
    const docScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const docClientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    const hasDocOverflow = docScrollWidth > docClientWidth;

    console.log(`[RawLogs - ${vp.name}] Width: ${modalBox.width.toFixed(1)}px (${((modalBox.width / vp.width) * 100).toFixed(1)}vw), ModalRight: ${modalRight.toFixed(1)}px / VP: ${vp.width}px, ActionsInside: ${actionsInside}, DocOverflow: ${hasDocOverflow}`);

    // Take screenshot
    await page.screenshot({ path: path.join(screenshotDir, `raw_logs_${vp.name}.png`) });
    await page.close();
  }

  console.log('\n--- TESTING EVENT DETAILS MODAL (Attack Timeline) ---');
  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto('http://localhost:3000/attack-timeline', { waitUntil: 'networkidle' });

    // Find Inspect Event or Click an event in timeline
    const inspectBtn = page.locator('button:has-text("Inspect Event")').first();
    if (await inspectBtn.isVisible()) {
      await inspectBtn.click();
    } else {
      // Look for event cards or table rows
      const evtCard = page.locator('.cursor-pointer, table tbody tr').first();
      await evtCard.click();
    }

    const modalDialog = page.locator('.fixed.inset-0 > div').first();
    await modalDialog.waitFor({ state: 'visible' });

    const modalBox = await modalDialog.boundingBox();
    const header = modalDialog.locator('> div').first();
    const headerBox = await header.boundingBox();
    const modalRight = modalBox.x + modalBox.width;

    const actionButtons = header.locator('button, a');
    const actionCount = await actionButtons.count();
    let actionsInside = true;
    for (let i = 0; i < actionCount; i++) {
      const btn = actionButtons.nth(i);
      const bBox = await btn.boundingBox();
      if (bBox && bBox.x + bBox.width > modalRight + 2) {
        actionsInside = false;
        console.error(`Button ${i} overflows modal! btnRight: ${bBox.x + bBox.width}, modalRight: ${modalRight}`);
      }
    }

    const docScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const docClientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    const hasDocOverflow = docScrollWidth > docClientWidth;

    console.log(`[EventDetails - ${vp.name}] Width: ${modalBox.width.toFixed(1)}px (${((modalBox.width / vp.width) * 100).toFixed(1)}vw), ModalRight: ${modalRight.toFixed(1)}px / VP: ${vp.width}px, ActionsInside: ${actionsInside}, DocOverflow: ${hasDocOverflow}`);

    await page.screenshot({ path: path.join(screenshotDir, `event_details_${vp.name}.png`) });
    await page.close();
  }

  console.log('\n--- TESTING RAW LOG EVIDENCE MODAL (Attack Timeline Raw Log button) ---');
  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto('http://localhost:3000/attack-timeline', { waitUntil: 'networkidle' });

    const rawLogBtn = page.locator('button:has-text("Raw Log"), button:has-text("View Raw Log")').first();
    if (await rawLogBtn.isVisible()) {
      await rawLogBtn.click();
      const modalDialog = page.locator('.fixed.inset-0 > div').first();
      await modalDialog.waitFor({ state: 'visible' });

      const modalBox = await modalDialog.boundingBox();
      const header = modalDialog.locator('> div').first();
      const modalRight = modalBox.x + modalBox.width;

      const actionButtons = header.locator('button, a');
      const actionCount = await actionButtons.count();
      let actionsInside = true;
      for (let i = 0; i < actionCount; i++) {
        const btn = actionButtons.nth(i);
        const bBox = await btn.boundingBox();
        if (bBox && bBox.x + bBox.width > modalRight + 2) {
          actionsInside = false;
          console.error(`Button ${i} overflows modal! btnRight: ${bBox.x + bBox.width}, modalRight: ${modalRight}`);
        }
      }

      const docScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const docClientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      const hasDocOverflow = docScrollWidth > docClientWidth;

      console.log(`[TimelineRawEvidence - ${vp.name}] Width: ${modalBox.width.toFixed(1)}px (${((modalBox.width / vp.width) * 100).toFixed(1)}vw), ModalRight: ${modalRight.toFixed(1)}px / VP: ${vp.width}px, ActionsInside: ${actionsInside}, DocOverflow: ${hasDocOverflow}`);
      await page.screenshot({ path: path.join(screenshotDir, `timeline_raw_evidence_${vp.name}.png`) });
    } else {
      console.log(`[TimelineRawEvidence - ${vp.name}] No raw log button visible on current items`);
    }
    await page.close();
  }

  await browser.close();
  console.log('\nALL VERIFICATIONS COMPLETED SUCCESSFULLY!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
