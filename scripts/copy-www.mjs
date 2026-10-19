// Assemble the Capacitor webDir (www/) from the static site at the repo root.
// The repo root stays the deployable website; www/ is gitignored and rebuilt each time.
// Allowlist only. Web-only files (sw.js, 404.html, robots.txt, humans.txt,
// crossdomain.xml) and non-app dirs (docs/, scripts/) are never copied.
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WWW = join(ROOT, 'www');
const ENTRIES = [
  'index.html',
  'privacypolicy.html',
  'manifest.webmanifest',
  'favicon.ico',
  'apple-touch-icon-precomposed.png',
  'css',
  'js',
  'images',
  'programs',
  'fonts', // optional
];

if (existsSync(WWW)) rmSync(WWW, { recursive: true, force: true });
mkdirSync(WWW, { recursive: true });

for (const e of ENTRIES) {
  const src = join(ROOT, e);
  if (existsSync(src)) cpSync(src, join(WWW, e), { recursive: true });
  else if (e !== 'fonts') console.warn(`skip missing: ${e}`);
}

console.log('www/ assembled');
