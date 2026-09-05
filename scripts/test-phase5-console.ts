import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { jobQueue } from '../src/server/queue/JobQueue.js';
import { getJob, getJobEvents, getAllAssets } from '../src/server/db/index.js';
import dotenv from 'dotenv';

dotenv.config();

async function runTests() {
  console.log('=== Testing Phase 5: Localhost Console Core Functionality ===\n');

  // Test 1: WebSocket Broadcast Hub & Heartbeat
  console.log('[Test 1] Testing Standalone WebSocket Server & Broadcast Hub...');
  const port = process.env.WS_PORT || '3001';

  // Spawn ws-server.ts process
  const wsProc = spawn('npx', ['tsx', 'src/server/ws-server.ts'], {
    shell: true,
    stdio: 'pipe',
  });

  // Wait for ws-server to listen
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => resolve(), 2000);
    wsProc.stdout.on('data', (data) => {
      const text = data.toString();
      if (text.includes('Listening on ws://')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    wsProc.on('error', reject);
  });

  let receivedPong = false;
  let receivedBroadcast = false;

  const client = new WebSocket(`ws://localhost:${port}`);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WS connection timed out')), 6000);

    client.on('open', () => {
      console.log('  -> WS Client connected successfully to ws-server.ts');
      // Send ping message
      client.send(JSON.stringify({ type: 'ping' }));
    });

    client.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'pong') {
          console.log('  -> Received heartbeat pong from ws-server');
          receivedPong = true;
          // Send broadcast test message
          client.send(JSON.stringify({
            type: 'assets:updated',
            count: 99,
            timestamp: new Date().toISOString(),
          }));
        }
        if (msg.type === 'assets:updated' && msg.count === 99) {
          console.log('  -> Received re-broadcast assets:updated event with count 99');
          receivedBroadcast = true;
          clearTimeout(timeout);
          resolve();
        }
      } catch (e) {
        // ignore
      }
    });

    client.on('error', reject);
  });

  client.close();
  wsProc.kill('SIGTERM');

  if (!receivedPong || !receivedBroadcast) {
    throw new Error('WebSocket test failed: ping/pong or broadcast not received');
  }
  console.log('  [PASS] WebSocket server & broadcast hub verified.\n');

  // Test 2: Job Queue & Immediate Enqueue
  console.log('[Test 2] Testing Job Queue Enqueue & Cancellation...');
  const testJob = jobQueue.enqueue({
    prompt: 'Phase 5 verification test video',
    mode: 'fast',
    aspectRatio: '9:16',
    voice: 'en-US-ChristopherNeural',
  });

  console.log(`  -> Job enqueued immediately with ID: ${testJob.id}, status: ${testJob.status}`);
  if (testJob.status !== 'QUEUED') {
    throw new Error(`Expected QUEUED status, got ${testJob.status}`);
  }

  // Verify DB persistence
  const fetchedJob = getJob(testJob.id);
  if (!fetchedJob || fetchedJob.prompt !== 'Phase 5 verification test video') {
    throw new Error('Job not persisted properly in SQLite');
  }
  console.log('  -> Job verified in SQLite database');

  // Test cancellation
  const cancelled = jobQueue.cancelJob(testJob.id);
  const updatedJob = getJob(testJob.id);
  if (!cancelled || updatedJob?.status !== 'CANCELLED') {
    throw new Error(`Expected CANCELLED status, got ${updatedJob?.status}`);
  }
  console.log(`  -> Job successfully cancelled, status: ${updatedJob.status}`);

  const events = getJobEvents(testJob.id);
  console.log(`  -> Job events count: ${events.length}`);
  const cancelEvent = events.find((e) => e.message.includes('cancelled'));
  if (!cancelEvent) {
    throw new Error('Cancellation event not recorded in job_events');
  }
  console.log('  [PASS] Job Queue enqueue, SQLite persistence, and cancellation verified.\n');

  // Test 3: Asset Catalog Query
  console.log('[Test 3] Testing Asset Catalog Query...');
  const assets = getAllAssets();
  console.log(`  -> SQLite assets catalog contains ${assets.length} items`);
  console.log('  [PASS] Asset queries verified.\n');

  console.log('=== All Phase 5 Core Tests Passed Successfully ===');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
