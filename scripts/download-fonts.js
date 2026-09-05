import fs from 'node:fs';
import path from 'node:path';

async function downloadFonts() {
  const fontDir = path.resolve('public', 'fonts');
  fs.mkdirSync(fontDir, { recursive: true });

  const cssUrl = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&family=JetBrains+Mono:wght@400;700&display=swap';
  const res = await fetch(cssUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  const css = await res.text();

  const regex = /font-family:\s*['"]?([^'"]+)['"]?;[\s\S]*?font-weight:\s*(\d+);[\s\S]*?src:\s*url\((https:[^)]+)\)/g;
  let match;
  const fonts = [];
  while ((match = regex.exec(css)) !== null) {
    fonts.push({ family: match[1], weight: match[2], url: match[3] });
  }

  console.log(`Found ${fonts.length} fonts to download.`);
  for (const f of fonts) {
    const filename = `${f.family.replace(/\s+/g, '')}-${f.weight}.ttf`;
    const target = path.join(fontDir, filename);
    console.log(`Downloading ${filename} from ${f.url}...`);
    const fontRes = await fetch(f.url);
    const buf = Buffer.from(await fontRes.arrayBuffer());
    fs.writeFileSync(target, buf);
    console.log(`Saved ${filename} (${buf.byteLength} bytes)`);
  }
}

downloadFonts().catch((err) => {
  console.error(err);
  process.exit(1);
});
