// Erzeugt die Home-Screen-Icons. Quelle: design-assets/app-icon.png (Master aus dem
// Design-Export, falls vorhanden), sonst design-assets/app-icon.svg.
import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const png = join(root, 'design-assets/app-icon.png');
const src = existsSync(png) ? png : join(root, 'design-assets/app-icon.svg');
const out = join(root, 'public/icons');
mkdirSync(out, { recursive: true });
const base = () => sharp(src, { density: 400 });

// Das PNG-Master hat bereits abgerundete Ecken; für iOS/Android wird es auf die
// Markenfläche gelegt, damit die Systemmaske keine hellen Ecken zeigt.
const onBrand = async (size, inset) => {
  const inner = Math.round(size * inset);
  const img = await base().resize(inner, inner).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: '#3730A5' } })
    .composite([{ input: img, gravity: 'center' }]).png();
};

await (await onBrand(180, 1)).toFile(join(out, 'apple-touch-icon.png'));
await (await onBrand(192, 1)).toFile(join(out, 'icon-192.png'));
await (await onBrand(512, 1)).toFile(join(out, 'icon-512.png'));
await (await onBrand(512, 0.8)).toFile(join(out, 'icon-maskable-512.png'));
console.log('Icons erzeugt aus', src.replace(root + '/', ''));
