import fs from 'node:fs';
import path from 'node:path';

function walk(dir) {
  let files = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name);
    if (item.isDirectory()) files.push(...walk(p));
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) files.push(p);
  }
  return files;
}

const files = walk('src/remotion');
console.log(`Auditing ${files.length} files in src/remotion/ ...`);

const forbiddenImports = /from\s+['"][^'"]*(server|fs|path|child_process)/i;
const forbiddenCalls = /(Math\.random|Date\.now|setTimeout|transition\s*:)/;

let issues = 0;
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    if (file.includes('sample-') && line.includes('code:')) return;
    if (forbiddenImports.test(line)) {
      console.log(`FORBIDDEN IMPORT: ${file}:${i + 1} -> ${line.trim()}`);
      issues++;
    }
    if (forbiddenCalls.test(line)) {
      console.log(`FORBIDDEN CALL/TRANSITION: ${file}:${i + 1} -> ${line.trim()}`);
      issues++;
    }
  });
}

if (issues === 0) {
  console.log('[ALL PASS] Zero server imports, zero Node builtins (fs/path/child_process), zero Math.random, zero Date.now, zero setTimeout, zero CSS transitions.');
} else {
  console.log(`[FAIL] Found ${issues} issues`);
  process.exit(1);
}
