import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execa } from 'execa';

interface CheckResult {
  name: string;
  passed: boolean;
  detected: string;
  error?: string;
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.replace(/^v/, '').split('.').map(Number);
  const parts2 = v2.replace(/^v/, '').split('.').map(Number);
  const len = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < len; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

async function runCheck(name: string, fn: () => Promise<{ passed: boolean; detected: string; error?: string }>): Promise<CheckResult> {
  try {
    const res = await fn();
    return { name, ...res };
  } catch (err: any) {
    return {
      name,
      passed: false,
      detected: 'Error executing check',
      error: err?.message || String(err),
    };
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('AeroCut Environment Verification');
  console.log('='.repeat(70));

  const results: CheckResult[] = [];

  // 1. Node version >= 20
  results.push(
    await runCheck('Node.js version (>= 20)', async () => {
      const version = process.version; // e.g. v24.20.0
      const major = parseInt(process.versions.node.split('.')[0], 10);
      const passed = major >= 20;
      return {
        passed,
        detected: `${version} (major: ${major})`,
      };
    })
  );

  // 2. Python version between 3.10 and 3.12, using the venv interpreter
  const pythonBin = process.platform === 'win32'
    ? path.join(process.cwd(), 'python-services', 'venv', 'Scripts', 'python.exe')
    : path.join(process.cwd(), 'python-services', 'venv', 'bin', 'python');

  results.push(
    await runCheck('Python venv version (3.10 - 3.12)', async () => {
      if (!fs.existsSync(pythonBin)) {
        return {
          passed: false,
          detected: `Venv interpreter not found at ${pythonBin}`,
        };
      }
      const { stdout } = await execa(pythonBin, [
        '-c',
        'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")',
      ]);
      const verStr = stdout.trim();
      const [major, minor, micro] = verStr.split('.').map(Number);
      const inRange = major === 3 && minor >= 10 && minor <= 12;
      return {
        passed: inRange,
        detected: `Python ${verStr} (${pythonBin})`,
        error: inRange ? undefined : `Version ${verStr} is outside supported range [3.10, 3.12]`,
      };
    })
  );

  // 3. ffprobe on PATH
  results.push(
    await runCheck('ffprobe on PATH', async () => {
      const { stdout } = await execa('ffprobe', ['-version']);
      const firstLine = stdout.split('\n')[0].trim();
      return {
        passed: true,
        detected: firstLine,
      };
    })
  );

  // 4. nvidia-smi present, and parse driver version
  results.push(
    await runCheck('NVIDIA driver (nvidia-smi >= 525)', async () => {
      const { stdout } = await execa('nvidia-smi');
      const driverMatch = stdout.match(/Driver Version:\s*([0-9.]+)/i) ||
                          stdout.match(/NVIDIA-SMI\s+([0-9.]+)/i) ||
                          stdout.match(/KMD Version:\s*([0-9.]+)/i);
      if (!driverMatch) {
        return {
          passed: false,
          detected: 'nvidia-smi executed but could not parse driver version',
        };
      }
      const driverVersion = driverMatch[1];
      const majorDriver = parseFloat(driverVersion);
      const passed = majorDriver >= 525;
      return {
        passed,
        detected: `Driver Version: ${driverVersion} (Major: ${majorDriver})`,
        error: passed ? undefined : `Driver version ${driverVersion} is below minimum 525`,
      };
    })
  );

  // 5. remotion package version >= 4.0.484
  let remotionVersion = '';
  results.push(
    await runCheck('remotion version (>= 4.0.484)', async () => {
      const pkgPath = path.join(process.cwd(), 'node_modules', 'remotion', 'package.json');
      if (!fs.existsSync(pkgPath)) {
        return { passed: false, detected: 'remotion package not found in node_modules' };
      }
      const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      remotionVersion = pkgJson.version;
      const passed = compareVersions(remotionVersion, '4.0.484') >= 0;
      return {
        passed,
        detected: `remotion@${remotionVersion}`,
        error: passed ? undefined : `Version ${remotionVersion} is less than required 4.0.484`,
      };
    })
  );

  // 6. all @remotion/* versions identical
  results.push(
    await runCheck('All @remotion/* package versions match', async () => {
      const remotionDir = path.join(process.cwd(), 'node_modules', '@remotion');
      if (!fs.existsSync(remotionDir)) {
        return { passed: false, detected: '@remotion namespace not found in node_modules' };
      }
      const subdirs = fs.readdirSync(remotionDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

      const mismatches: string[] = [];
      const checked: string[] = [];

      for (const subdir of subdirs) {
        const pkgFile = path.join(remotionDir, subdir, 'package.json');
        if (fs.existsSync(pkgFile)) {
          const subPkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
          checked.push(`@remotion/${subdir}@${subPkg.version}`);
          if (subPkg.version !== remotionVersion) {
            mismatches.push(`@remotion/${subdir}@${subPkg.version} (expected ${remotionVersion})`);
          }
        }
      }

      const passed = mismatches.length === 0 && checked.length > 0;
      return {
        passed,
        detected: passed
          ? `All ${checked.length} @remotion/* packages are on version ${remotionVersion}`
          : `Mismatched packages: ${mismatches.join(', ')}`,
        error: passed ? undefined : `Version mismatch detected: ${mismatches.join('; ')}`,
      };
    })
  );

  // 7. NVENC smoke test
  const probeFile = path.join(os.tmpdir(), `nvenc_probe_${Date.now()}.mp4`);
  results.push(
    await runCheck('NVENC smoke test (h264_nvenc probe)', async () => {
      try {
        if (fs.existsSync(probeFile)) {
          fs.unlinkSync(probeFile);
        }
        await execa('ffmpeg', [
          '-f', 'lavfi',
          '-i', 'testsrc=duration=1:size=640x360:rate=30',
          '-c:v', 'h264_nvenc',
          '-b:v', '2M',
          '-y',
          probeFile,
        ]);

        if (fs.existsSync(probeFile)) {
          const stats = fs.statSync(probeFile);
          if (stats.size > 0) {
            return {
              passed: true,
              detected: `Produced ${stats.size} bytes video file via h264_nvenc (${probeFile})`,
            };
          }
          return {
            passed: false,
            detected: 'File produced but size is 0 bytes',
          };
        }
        return {
          passed: false,
          detected: 'Probe file was not created by ffmpeg',
        };
      } catch (err: any) {
        return {
          passed: false,
          detected: 'ffmpeg nvenc probe failed',
          error: err?.stderr || err?.message || String(err),
        };
      } finally {
        if (fs.existsSync(probeFile)) {
          try {
            fs.unlinkSync(probeFile);
          } catch {
            // ignore cleanup error
          }
        }
      }
    })
  );

  // 8. faster-whisper importable in venv
  results.push(
    await runCheck('faster-whisper importable in venv', async () => {
      if (!fs.existsSync(pythonBin)) {
        return {
          passed: false,
          detected: `Venv interpreter not found at ${pythonBin}`,
        };
      }
      const { stdout } = await execa(pythonBin, [
        '-c',
        'import faster_whisper; print(faster_whisper.__version__)',
      ]);
      const fwVer = stdout.trim();
      return {
        passed: true,
        detected: `faster-whisper v${fwVer} successfully imported in venv`,
      };
    })
  );

  // Print results
  console.log('\nVerification Summary:');
  console.log('-'.repeat(70));
  let allPassed = true;
  for (const r of results) {
    const statusTag = r.passed ? '[PASS]' : '[FAIL]';
    console.log(`${statusTag.padEnd(8)} ${r.name}`);
    console.log(`         Detected: ${r.detected}`);
    if (r.error) {
      console.log(`         Details:  ${r.error.replace(/\r?\n/g, ' ')}`);
    }
    if (!r.passed) {
      allPassed = false;
    }
  }
  console.log('-'.repeat(70));

  if (allPassed) {
    console.log('ALL CHECKS PASSED [8/8]\n');
    process.exit(0);
  } else {
    console.error('ONE OR MORE CHECKS FAILED!\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
