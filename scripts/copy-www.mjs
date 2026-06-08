// Assemble the Capacitor webDir (www/) from the static site at the repo root.
// Repo root stays the deployable website; www/ is gitignored and rebuilt each time.
// Web-only files (robots.txt, humans.txt, crossdomain.xml, 404.html) are excluded.
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';

const WWW = 'www';
const ENTRIES = [
  'index.html',
  'manifest.webmanifest',
  'privacypolicy.html',
  'favicon.ico',
  'apple-touch-icon-precomposed.png',
  'css',
  'js',
  'images',
  'programs',
];

if (existsSync(WWW)) rmSync(WWW, { recursive: true, force: true });
mkdirSync(WWW, { recursive: true });

for (const e of ENTRIES) {
  if (existsSync(e)) cpSync(e, `${WWW}/${e}`, { recursive: true });
  else console.warn(`skip missing: ${e}`);
}

console.log('www/ assembled');
