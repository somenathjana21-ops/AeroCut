import { GET as getAssets } from '../src/app/api/assets/route.js';
import { POST as scanAssets } from '../src/app/api/assets/scan/route.js';
import { GET as getJobs, POST as createJob } from '../src/app/api/jobs/route.js';
import { GET as getJobDetail, DELETE as cancelJob } from '../src/app/api/jobs/[id]/route.js';
import { GET as getHealth } from '../src/app/api/health/route.js';
import { GET as getMedia } from '../src/app/api/media/route.js';

async function runApiTests() {
  console.log('=== Testing AeroCut API Route Handlers ===\n');

  // 1. GET /api/health
  console.log('[1] Testing GET /api/health...');
  const healthRes = await getHealth();
  const healthData = await healthRes.json();
  console.log('  -> Health status:', healthData.status, 'NVENC:', healthData.nvencAvailable, 'Queue depth:', healthData.queueDepth);
  if (healthData.status !== 'ok') throw new Error('Health check failed');
  console.log('  [PASS] /api/health\n');

  // 2. GET /api/assets
  console.log('[2] Testing GET /api/assets...');
  const assetsRes = await getAssets();
  const assetsData = await assetsRes.json();
  console.log('  -> Assets count:', assetsData.count);
  if (!assetsData.success) throw new Error('Assets list failed');
  console.log('  [PASS] /api/assets\n');

  // 3. POST /api/assets/scan
  console.log('[3] Testing POST /api/assets/scan...');
  const scanRes = await scanAssets();
  const scanData = await scanRes.json();
  console.log('  -> Scan result count:', scanData.count);
  if (!scanData.success) throw new Error('Assets scan failed');
  console.log('  [PASS] /api/assets/scan\n');

  // 4. GET /api/jobs
  console.log('[4] Testing GET /api/jobs...');
  const jobsRes = await getJobs();
  const jobsData = await jobsRes.json();
  console.log('  -> Jobs list count:', jobsData.count);
  if (!jobsData.success) throw new Error('Jobs list failed');
  console.log('  [PASS] /api/jobs\n');

  // 5. POST /api/jobs (Immediate enqueue, background execution)
  console.log('[5] Testing POST /api/jobs (Immediate return contract)...');
  const startTime = Date.now();
  const jobReq = new Request('http://localhost:3000/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: 'Testing immediate enqueue response contract in fast mode',
      mode: 'fast',
      voice: 'en-US-ChristopherNeural',
    }),
  });

  const createRes = await createJob(jobReq);
  const durationMs = Date.now() - startTime;
  const createData = await createRes.json();

  console.log(`  -> Response returned in ${durationMs}ms (Immediate enqueue verified)`);
  console.log(`  -> Created Job ID: ${createData.jobId}, initial status: ${createData.job?.status}`);

  if (createRes.status !== 201 || !createData.jobId) {
    throw new Error('POST /api/jobs failed');
  }
  if (durationMs > 1500) {
    throw new Error('POST /api/jobs took too long; pipeline should be asynchronous');
  }
  console.log('  [PASS] POST /api/jobs immediate return verified.\n');

  const testJobId = createData.jobId;

  // 6. GET /api/jobs/[id]
  console.log(`[6] Testing GET /api/jobs/${testJobId}...`);
  const detailReq = new Request(`http://localhost:3000/api/jobs/${testJobId}`);
  const detailRes = await getJobDetail(detailReq, { params: Promise.resolve({ id: testJobId }) });
  const detailData = await detailRes.json();

  console.log('  -> Job detail fetched:', detailData.job?.id, 'Events:', detailData.events?.length);
  if (!detailData.success || detailData.job.id !== testJobId) {
    throw new Error('GET /api/jobs/[id] failed');
  }
  console.log('  [PASS] GET /api/jobs/[id]\n');

  // 7. DELETE /api/jobs/[id] (Cancel)
  console.log(`[7] Testing DELETE /api/jobs/${testJobId}...`);
  const cancelReq = new Request(`http://localhost:3000/api/jobs/${testJobId}`, { method: 'DELETE' });
  const cancelRes = await cancelJob(cancelReq, { params: Promise.resolve({ id: testJobId }) });
  const cancelData = await cancelRes.json();

  console.log('  -> Cancel status:', cancelData.status, 'Success:', cancelData.success);
  if (!cancelData.success || cancelData.status !== 'CANCELLED') {
    throw new Error('DELETE /api/jobs/[id] failed');
  }
  console.log('  [PASS] DELETE /api/jobs/[id]\n');

  // 8. GET /api/media
  console.log('[8] Testing GET /api/media parameter validation...');
  const mediaReq = new Request('http://localhost:3000/api/media');
  const mediaRes = await getMedia(mediaReq);
  if (mediaRes.status !== 400) {
    throw new Error('Expected 400 for missing media params');
  }
  console.log('  [PASS] GET /api/media validation\n');

  console.log('=== All Route Handlers Passed Successfully ===');
  process.exit(0);
}

runApiTests().catch((err) => {
  console.error('API Route Test failed:', err);
  process.exit(1);
});
