// Vertont alle Dialoge und Texte mit edge-tts und schreibt die Dateien nach
// public/audio/ plus eine Übersicht nach src/content/audio.json.
//
//   npm run audio            nur Neues/Geändertes vertonen
//   npm run audio -- --force alles neu vertonen
//
// Voraussetzung: uv (https://docs.astral.sh/uv/) — edge-tts wird per `uvx` geholt.
// Alternativ ein installiertes `edge-tts` über EDGE_TTS="edge-tts".
// Hinweis: edge-tts nutzt den (inoffiziellen) Vorlese-Dienst von Microsoft Edge.
// Die Audios entstehen hier einmalig beim Entwickeln; die App selbst ruft nie
// einen Server auf, sondern spielt nur die mitgelieferten Dateien ab.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { loadChapters } from './load-chapters.mjs';
import { castDialog, NARRATOR } from './voices.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public/audio');
const manifestPath = join(root, 'src/content/audio.json');
const force = process.argv.includes('--force');
const CMD = (process.env.EDGE_TTS || 'uvx edge-tts').split(' ');
const PARALLEL = 4;

mkdirSync(outDir, { recursive: true });

// Kleine Aussprachehilfen für das Vorlesen (der angezeigte Text bleibt unverändert).
function speakable(t) {
  return t
    .replace(/(\d{1,2}):(\d{2})/g, (_, h, m) => (m === '00' ? `${h} Uhr` : `${h} Uhr ${Number(m)}`)).replace(/Uhr (\d+) Uhr/g, 'Uhr $1')
    .replace(/\bDr\./g, 'Doktor')
    .replace(/„|“/g, '"');
}

const jobs = [];
const manifest = {};
const add = (itemId, text, v, who, gap) => {
  const t = speakable(text);
  const hash = createHash('sha1').update([v.voice, v.rate, v.pitch, t].join('|')).digest('hex').slice(0, 16);
  const file = `${hash}.mp3`;
  (manifest[itemId] ||= { segments: [] }).segments.push({ file: `audio/${file}`, who, gap });
  if (!jobs.some((j) => j.file === file)) jobs.push({ file, text: t, ...v });
};

for (const chapter of loadChapters()) {
  for (const lesson of chapter.lessons) {
    for (const item of lesson.items || []) {
      if (item.type === 'dialog') {
        const cast = castDialog(item);
        if (item.lines) item.lines.forEach((l) => add(item.id, l.text, cast[l.who], l.who, 380));
        else add(item.id, item.text, cast._, null, 0);
      } else {
        add(item.id, `${item.title}.`, NARRATOR, null, 600);
        item.paragraphs.forEach((p) => add(item.id, p, NARRATOR, null, 450));
      }
    }
  }
}

function run(job) {
  const dest = join(outDir, job.file);
  const args = [...CMD.slice(1), '--voice', job.voice, `--rate=${job.rate}`, `--pitch=${job.pitch}`, '--text', job.text, '--write-media', dest];
  return new Promise((resolve, reject) => {
    const p = spawn(CMD[0], args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => (code === 0 && existsSync(dest) && statSync(dest).size > 1000 ? resolve() : reject(new Error(err.trim().split('\n').pop() || `exit ${code}`))));
  });
}

const todo = jobs.filter((j) => force || !existsSync(join(outDir, j.file)));
console.log(`${jobs.length} Audio-Abschnitte, davon ${todo.length} neu zu vertonen …`);
let done = 0;
const failed = [];
async function worker() {
  while (todo.length) {
    const job = todo.shift();
    for (let attempt = 1; ; attempt++) {
      try { await run(job); break; } catch (e) {
        if (attempt >= 3) { failed.push(`${job.file}: ${e.message}`); break; }
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
    done++;
    if (done % 20 === 0) console.log(`  ${done} fertig`);
  }
}
await Promise.all(Array.from({ length: PARALLEL }, worker));

// Nicht mehr benötigte Dateien entfernen.
const keep = new Set(jobs.map((j) => j.file));
let removed = 0;
for (const f of readdirSync(outDir)) if (f.endsWith('.mp3') && !keep.has(f)) { rmSync(join(outDir, f)); removed++; }

// Nur Items aufnehmen, deren Dateien vollständig da sind (sonst liest die Gerätestimme).
const complete = Object.fromEntries(Object.entries(manifest).filter(([, m]) => m.segments.every((s) => existsSync(join(root, 'public', s.file)))));
writeFileSync(manifestPath, JSON.stringify(complete, null, 1) + '\n');

const bytes = [...keep].reduce((n, f) => n + (existsSync(join(outDir, f)) ? statSync(join(outDir, f)).size : 0), 0);
console.log(`Fertig: ${Object.keys(complete).length} Dialoge/Texte vertont, ${(bytes / 1024 / 1024).toFixed(1)} MB, ${removed} alte Dateien entfernt.`);
if (failed.length) { console.error(`${failed.length} Abschnitte fehlgeschlagen:\n${failed.join('\n')}`); process.exit(1); }
