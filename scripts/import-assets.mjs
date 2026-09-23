// Kopiert die Bilder aus dem Claude-Design-Export an die richtigen Stellen und
// erzeugt danach die Icons neu.
//   npm run assets -- /Pfad/zum/export
// Der Pfad darf der Export-Ordner selbst oder ein Unterordner davon sein — gesucht
// wird nach den Dateinamen aus dem Design System.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = process.argv[2];
if (!from || !existsSync(from)) { console.error('Bitte den Pfad zum Design-Export angeben.'); process.exit(1); }

const WANT = {
  'miro-neutral.png': 'public/assets/mascot', 'miro-listening.png': 'public/assets/mascot', 'miro-cheering.png': 'public/assets/mascot',
  'miro-disappointed.png': 'public/assets/mascot', 'miro-proud.png': 'public/assets/mascot', 'miro-sleepy.png': 'public/assets/mascot',
  'miro-head-halfprofile.png': 'public/assets/mascot', 'miro-sorting-cards.png': 'public/assets/illustrations', 'app-icon.png': 'design-assets',
};
const found = {};
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (WANT[basename(p)] && !found[basename(p)]) found[basename(p)] = p;
  }
};
walk(from);
// Miro wird höchstens 130 px groß angezeigt: auf 480 px verkleinern (scharf bis @3x),
// damit der Offline-Cache klein bleibt. Das Icon-Master bleibt unverändert.
const sharp = (await import('sharp')).default;
for (const [name, dest] of Object.entries(WANT)) {
  if (!found[name]) { console.warn('fehlt:', name); continue; }
  mkdirSync(join(root, dest), { recursive: true });
  const target = join(root, dest, name);
  if (dest === 'design-assets') copyFileSync(found[name], target);
  else await sharp(found[name]).resize(480, 480, { fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9, palette: false }).toFile(target);
  console.log('ok  ', name, '→', dest);
}
execSync('node scripts/icons.mjs', { cwd: root, stdio: 'inherit' });
