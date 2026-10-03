// Hörprobe: vertont einen Dialog/Text mit Gemini und legt ihn neben die
// bisherige edge-tts-Fassung. Ändert nichts an public/audio/.
//
//   node scripts/tts-probe.mjs <itemId> [Zielordner]
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadChapters } from './load-chapters.mjs';
import { castDialog, synthRetry, NARRATOR } from './gemini-tts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [id, outArg] = process.argv.slice(2);
const out = outArg || join(root, 'audio-probe');
mkdirSync(out, { recursive: true });

const item = loadChapters().flatMap((c) => c.lessons.flatMap((l) => l.items || [])).find((i) => i.id === id);
if (!item) throw new Error(`Item ${id} nicht gefunden`);

const parts = [];
if (item.type === 'dialog') {
  const cast = castDialog(item);
  console.log('Besetzung:', cast);
  if (item.lines) item.lines.forEach((l) => parts.push({ text: l.text, ...cast[l.who], who: l.who }));
  else parts.push({ text: item.text, ...cast._ });
} else {
  parts.push({ text: `${item.title}.`, ...NARRATOR }, ...item.paragraphs.map((p) => ({ text: p, ...NARRATOR })));
}

// Gleiche Schreibweise wie in audio.mjs.
const speakable = (t) => t.replace(/„|“/g, '"').replace(/\bDr\./g, 'Doktor');

const files = [];
for (const [i, p] of parts.entries()) {
  const dest = join(out, `${id}-${String(i).padStart(2, '0')}.mp3`);
  process.stdout.write(`  ${i + 1}/${parts.length} ${p.who || ''} (${p.voice}) … `);
  if (!existsSync(dest)) await synthRetry({ ...p, text: speakable(p.text) }, dest, (m) => process.stdout.write(m + ' '));
  console.log('ok');
  files.push(dest);
}

// Alles mit kurzen Pausen zu einer Datei zusammenfügen, ebenso die alte Fassung.
function join_(list, dest) {
  const txt = join(out, 'list.txt');
  const sil = join(out, 'silence.mp3');
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', '0.4', '-b:a', '48k', sil]);
  writeFileSync(txt, list.flatMap((f) => [`file '${f}'`, `file '${sil}'`]).join('\n'));
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', txt, '-ar', '24000', '-ac', '1', '-b:a', '48k', dest], { stdio: 'inherit' });
}
join_(files, join(out, `${id}-NEU-gemini.mp3`));

const manifest = JSON.parse(readFileSync(join(root, 'src/content/audio.json'), 'utf8'));
const old = (manifest[id]?.segments || []).map((s) => join(root, 'public', s.file)).filter(existsSync);
if (old.length) join_(old, join(out, `${id}-ALT-edge.mp3`));
console.log(`Fertig: ${out}`);
