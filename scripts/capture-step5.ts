import { chromium } from 'playwright';
import path from 'node:path';

const ARTIFACT_DIR = 'C:\\Users\\somen\\.gemini\\antigravity\\brain\\68aa0a7d-5e3a-43c7-b7c9-d055c097b6c3';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Switch to Watch Encoded MP4
  const watchButton = await page.$('button:has-text("Watch Encoded MP4")');
  if (watchButton) {
    await watchButton.click();
    await page.waitForTimeout(1500);
  }

  const step5Path = path.join(ARTIFACT_DIR, 'step5_job_complete_mp4.png');
  await page.screenshot({ path: step5Path, fullPage: false });
  console.log(`  ✓ Updated step5 screenshot saved: ${step5Path}`);

  await browser.close();
}

main().catch(console.error);
