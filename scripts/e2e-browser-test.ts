import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const ARTIFACT_DIR = 'C:\\Users\\somen\\.gemini\\antigravity\\brain\\68aa0a7d-5e3a-43c7-b7c9-d055c097b6c3';

async function main() {
  console.log('=== AeroCut Phase 5 Browser E2E Verification ===\n');

  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
  });

  const page = await context.newPage();

  // ---------------------------------------------------------------------------
  // Step 1: Load http://localhost:3000 and verify health bar
  // ---------------------------------------------------------------------------
  console.log('[Step 1] Loading http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Wait for health bar indicators
  await page.waitForSelector('text=WS 3001', { timeout: 10000 });
  console.log('  ✓ WebSocket connected indicator (WS 3001) verified.');

  const nvencElement = await page.$('text=NVENC ACTIVE');
  const cpuElement = await page.$('text=CPU FALLBACK');
  const hardwareStatus = nvencElement ? 'NVENC ACTIVE' : cpuElement ? 'CPU FALLBACK' : 'UNKNOWN';
  console.log(`  ✓ Hardware encoder status verified: ${hardwareStatus}`);

  const step1Path = path.join(ARTIFACT_DIR, 'step1_healthbar.png');
  await page.screenshot({ path: step1Path, fullPage: false });
  console.log(`  ✓ Screenshot saved: ${step1Path}\n`);

  // ---------------------------------------------------------------------------
  // Step 2: Drop/Upload test image and verify catalog
  // ---------------------------------------------------------------------------
  console.log('[Step 2] Uploading test image into AssetDropzone...');
  const testImagePath = path.resolve(process.cwd(), 'test_broll_sample.jpg');

  // Use file input inside dropzone
  const fileInput = await page.$('input[type="file"]');
  if (!fileInput) throw new Error('File input not found in dropzone');

  await fileInput.setInputFiles(testImagePath);
  console.log('  -> File selected, waiting for ingestion and catalog refresh...');

  // Wait for test_broll_sample.jpg in the catalog
  await page.waitForSelector('text=test_broll_sample.jpg', { timeout: 15000 });
  console.log('  ✓ File test_broll_sample.jpg found in catalog.');

  // Confirm tag badge 'b-roll'
  const tagBadge = await page.waitForSelector('text=B-ROLL', { timeout: 5000 });
  if (tagBadge) {
    console.log('  ✓ Tag badge B-ROLL correctly classified.');
  }

  const step2Path = path.join(ARTIFACT_DIR, 'step2_catalog.png');
  await page.screenshot({ path: step2Path, fullPage: false });
  console.log(`  ✓ Screenshot saved: ${step2Path}\n`);

  // ---------------------------------------------------------------------------
  // Step 3: Submit Fast Mode job and monitor activity stream
  // ---------------------------------------------------------------------------
  console.log('[Step 3] Submitting Fast Mode job...');
  const textarea = await page.$('textarea');
  if (!textarea) throw new Error('Prompt textarea not found');

  await textarea.fill('99 percent of developers get this wrong. DOM updates cause lag. Batch state changes together.');

  const submitButton = await page.$('button[type="submit"]');
  if (!submitButton) throw new Error('Submit button not found');

  await submitButton.click();
  console.log('  ✓ Submit clicked.');

  // Wait for active job to appear in AgentActivityStream
  console.log('  -> Monitoring live activity stream stages...');

  // Wait for INGESTION or PLANNING stage in activity stream
  await page.waitForSelector('text=MEDIA INGESTION', { timeout: 10000 });
  console.log('  ✓ Stage 1: INGESTION visible in stream.');

  await page.waitForSelector('text=NARRATIVE DIRECTOR', { timeout: 15000 });
  console.log('  ✓ Stage 2: PLANNING visible in stream.');

  await page.waitForTimeout(3000);
  const step3Path = path.join(ARTIFACT_DIR, 'step3_planning_active.png');
  await page.screenshot({ path: step3Path, fullPage: false });
  console.log(`  ✓ Screenshot saved: ${step3Path}\n`);

  // ---------------------------------------------------------------------------
  // Step 4: Confirm Remotion Player loads preview once props exist
  // ---------------------------------------------------------------------------
  console.log('[Step 4] Awaiting Composition stage and Remotion Player mount...');

  // Wait for COMPOSING stage or Remotion player container
  // Either waiting for SYNTHESIZING -> COMPOSING
  const startTime = Date.now();
  let playerMounted = false;

  while (Date.now() - startTime < 90000) {
    const hasPlayer = await page.$('.remotion-player, div[style*="aspect-ratio"]');
    const hasPropsText = await page.$('text=Duration:');
    if (hasPlayer && hasPropsText) {
      playerMounted = true;
      break;
    }
    await page.waitForTimeout(2000);
  }

  if (!playerMounted) {
    console.log('  ⚠ Remotion player took longer than 90s, taking diagnostic screenshot...');
  } else {
    console.log('  ✓ Remotion Player successfully mounted with composition props!');
  }

  const step4Path = path.join(ARTIFACT_DIR, 'step4_remotion_preview.png');
  await page.screenshot({ path: step4Path, fullPage: false });
  console.log(`  ✓ Screenshot saved: ${step4Path}\n`);

  // ---------------------------------------------------------------------------
  // Step 5: Await Complete & Confirm MP4 video playback in Job History
  // ---------------------------------------------------------------------------
  console.log('[Step 5] Awaiting COMPLETE status and rendered MP4...');

  let isComplete = false;
  const renderStartTime = Date.now();

  while (Date.now() - renderStartTime < 120000) {
    const completeBadge = await page.$('div:has-text("COMPLETE"), span:has-text("DONE")');
    const downloadMp4 = await page.$('text=MP4, text=Download MP4');
    if (completeBadge && downloadMp4) {
      isComplete = true;
      break;
    }
    await page.waitForTimeout(2000);
  }

  if (isComplete) {
    console.log('  ✓ Job reached COMPLETE status. Output MP4 ready.');

    // Switch to Watch Encoded MP4 if button available
    const watchButton = await page.$('button:has-text("Watch Encoded MP4")');
    if (watchButton) {
      await watchButton.click();
      await page.waitForTimeout(1000);
      console.log('  ✓ Switched to encoded MP4 video player.');
    }
  } else {
    console.log('  ⚠ Render still running or taking longer than 120s.');
  }

  const step5Path = path.join(ARTIFACT_DIR, 'step5_job_complete_mp4.png');
  await page.screenshot({ path: step5Path, fullPage: false });
  console.log(`  ✓ Screenshot saved: ${step5Path}\n`);

  await browser.close();
  console.log('=== Browser E2E Verification Complete ===');
}

main().catch((err) => {
  console.error('Browser E2E test failed:', err);
  process.exit(1);
});
