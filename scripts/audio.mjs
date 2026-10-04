// Vertont alle Dialoge und Texte und schreibt die Dateien nach public/audio/ plus
// eine Übersicht nach src/content/audio.json.
//
//   npm run audio                     nur Neues/Geändertes vertonen (edge-tts)
//   npm run audio -- --force          alles neu vertonen (edge-tts)
//   npm run audio -- --engine=gemini  mit Gemini-Stimmen vertonen, Level für Level
//   npm run audio -- --engine=gemini --max=3   höchstens 3 Level in diesem Lauf
//   npm run audio -- --engine=gemini --plan    nur zeigen, was noch fehlt
//   npm run audio -- --engine=gemini --only=z6-auto,z6-buero   nur bestimmte Level
//   npm run audio -- --engine=gemini --retry-items   nicht schneidbare Level Teil für Teil neu anfragen
//
// Zwei Stimm-Quellen:
// - Gemini (Google AI Studio, kostenloser Key in .env.local): lebendige Stimmen. Ein ganzes
//   Level (alle Teile einer Geschichte) wird in EINER Anfrage gesprochen, danach an den Pausen
//   in Abschnitte geschnitten und mit Whisper geprüft (scripts/gemini-tts.mjs). Das Gratis-
//   Kontingent reicht für ca. 10 Level pro Tag; ein neuer Lauf macht dort weiter, wo der
//   letzte aufgehört hat. Rohaufnahmen bleiben in .audio-cache/, damit nie doppelt angefragt wird.
// - edge-tts (uv, https://docs.astral.sh/uv/ — per `uvx` geholt): Ersatz, solange ein Level
//   noch nicht mit Gemini fertig ist. Nutzt den inoffiziellen Vorlese-Dienst von Microsoft Edge.
//
// Die App bevorzugt pro Dialog/Text immer die Gemini-Fassung, sobald sie vollständig ist.
// Die Audios entstehen hier einmalig beim Entwickeln; die App selbst ruft nie einen Server
// auf, sondern spielt nur die mitgelieferten Dateien ab.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { loadChapters } from './load-chapters.mjs';
import { castDialog, NARRATOR, WORLD } from './voices.mjs';
import * as gemini from './gemini-tts.mjs';
import { audioParts } from '../src/engine/content.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public/audio');
const cacheDir = join(root, '.audio-cache');
const manifestPath = join(root, 'src/content/audio.json');
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const force = process.argv.includes('--force');
const engine = arg('engine') || 'edge';
const maxLevels = Number(arg('max') || Infinity);
const planOnly = process.argv.includes('--plan');
// Lässt sich eine Level-Aufnahme nicht sauber schneiden, Teil für Teil neu anfragen (kostet Anfragen).
const retryItems = process.argv.includes('--retry-items');
const only = arg('only')?.split(',');
const CMD = (process.env.EDGE_TTS || 'uvx edge-tts').split(' ');
const PARALLEL = 4;

mkdirSync(outDir, { recursive: true });
mkdirSync(cacheDir, { recursive: true });

// Kleine Aussprachehilfen für das Vorlesen (der angezeigte Text bleibt unverändert).
function speakable(t) {
  return t
    .replace(/(\d{1,2}):(\d{2})/g, (_, h, m) => (m === '00' ? `${h} Uhr` : `${h} Uhr ${Number(m)}`)).replace(/Uhr (\d+) Uhr/g, 'Uhr $1')
    .replace(/\bDr\./g, 'Doktor')
    .replace(/„|“/g, '"');
}
const sha = (parts) => createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);

/**
 * Alle Abschnitte, Level für Level. Jeder Abschnitt kennt seine edge- und seine Gemini-Datei.
 * Gemini-Stimmen werden pro Level vergeben, damit eine Figur in allen Teilen gleich klingt.
 *
 * Aufnahme-Einheiten (units) und Abspiel-Abschnitte (segs) sind getrennt: Gemini spricht
 * Einheiten, die App spielt Abschnitte. Bei Monologen bleibt die Einheit an der ersten
 * Zwischenfrage geteilt (so bleiben vorhandene Aufnahmen gültig); jede weitere Pause wird
 * lokal aus der Einheit geschnitten. Neue Zwischenfragen kosten so keine neue Anfrage.
 */
function buildLevels() {
  const chapters = loadChapters().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  // Erst die Hör-Kapitel (Gespräche), dann die Lesetexte.
  const ordered = [...chapters.filter((c) => c.track !== 'read'), ...chapters.filter((c) => c.track === 'read')];
  const levels = [];
  for (const chapter of ordered) {
    for (const lesson of chapter.lessons) {
      if (!lesson.items?.length) continue;
      const nameOf = (item) => WORLD.byId.get(item.characterId)?.name || item.characterId;
      // Alle Figuren des Levels in einer gemeinsamen Besetzung.
      const who = lesson.items.flatMap((it) => (it.type !== 'dialog' ? [] : it.lines ? it.lines.map((l) => l.who) : [nameOf(it)]));
      const gemCast = who.length ? gemini.castDialog({ lines: [...new Set(who)].map((w) => ({ who: w })) }) : {};
      const units = [];
      for (const item of lesson.items) {
        const seg = (text, who, gap, edge, gem, quiz) => {
          const t = speakable(text);
          return {
            itemId: item.id, text: t, who, gap, quiz,
            edgeFile: `${sha([edge.voice, edge.rate, edge.pitch, t])}.mp3`, edge,
            gemFile: `${sha(['gemini', gem.voice, gem.style, t])}.mp3`, gem,
          };
        };
        const unit = (subs) => ({ text: subs.length === 1 ? subs[0].text : speakable(subs.raw), gem: subs[0].gem, subs });
        if (item.type === 'dialog') {
          const cast = castDialog(item);
          const segs = audioParts(item).map((p) => {
            const speaker = p.who || nameOf(item);
            const line = item.lines?.find((l) => l.who === p.who && l.text === p.text);
            const g = gemCast[speaker];
            const style = [g.style, line?.tone || item.tone].filter(Boolean).join(', ');
            return seg(p.text, p.who, item.lines ? 380 : 300, item.lines ? cast[p.who] : cast._, { speaker, voice: g.voice, style }, p.quiz);
          });
          if (item.lines) { segs.forEach((s) => units.push(unit([s]))); continue; }
          // Monolog: Einheiten nur an der ersten Zwischenfrage geteilt.
          const recParts = audioParts({ ...item, popQuiz: (item.popQuiz || []).slice(0, 1) });
          const cut = segs.findIndex((x) => x.quiz === 0) + 1;
          const groups = recParts.length > 1 ? [segs.slice(0, cut), segs.slice(cut)] : [segs];
          groups.forEach((subs, i) => { subs.raw = recParts[i].text; units.push(unit(subs)); });
        } else {
          const gem = { speaker: 'Miro', voice: gemini.NARRATOR.voice, style: gemini.NARRATOR.style };
          units.push(unit([seg(`${item.title}.`, null, 600, NARRATOR, gem)]));
          item.paragraphs.forEach((p) => units.push(unit([seg(p, null, 450, NARRATOR, gem)])));
        }
      }
      levels.push({ id: lesson.id, units, segs: units.flatMap((u) => u.subs) });
    }
  }
  return levels;
}

const levels = buildLevels();
const have = (f) => existsSync(join(outDir, f));
const items = new Map(); // itemId → Abschnitte
for (const l of levels) for (const s of l.segs) (items.get(s.itemId) || items.set(s.itemId, []).get(s.itemId)).push(s);
const gemDone = (itemId) => items.get(itemId).every((s) => have(s.gemFile));

/* ---- Gemini: Level für Level ---------------------------------------------------- */

/** Einheiten eines Levels in Anfragen zu höchstens 2 Stimmen aufteilen (die häufigsten zusammen). */
function batches(units) {
  const count = new Map();
  for (const u of units) count.set(u.gem.speaker, (count.get(u.gem.speaker) || 0) + 1);
  const speakers = [...count.keys()].sort((a, b) => count.get(b) - count.get(a));
  const groups = [];
  for (let i = 0; i < speakers.length; i += 2) groups.push(new Set(speakers.slice(i, i + 2)));
  return groups.map((g) => units.filter((u) => g.has(u.gem.speaker)));
}
const unitDone = (u) => u.subs.every((s) => have(s.gemFile));

/** Eine Anfrage (aus dem Cache, wenn schon da) sprechen lassen und in Dateien schneiden. */
async function renderBatch(units, log, { cachedOnly = false } = {}) {
  const turns = units.map((u) => ({ text: u.text, speaker: u.gem.speaker.replace(/[^A-Za-z]/g, '') || 'Sprecher', voice: u.gem.voice, style: u.gem.style }));
  const wav = join(cacheDir, `${sha([gemini.MODEL, JSON.stringify(turns)])}.wav`);
  if (!existsSync(wav) && cachedOnly) return false;
  if (!existsSync(wav)) {
    const tmp = `${wav}.part.wav`;
    await gemini.withRetry(() => gemini.synthBatch(turns, tmp), log);
    copyFileSync(tmp, wav);
    rmSync(tmp, { force: true });
    log('Aufnahme da, schneide …');
  } else log('Aufnahme aus dem Cache, schneide …');
  // Erst in einen Zwischenordner schneiden, damit nie halbfertige Dateien in public/audio landen.
  const tmpDir = join(cacheDir, 'cut');
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });
  try {
    const unitWavs = units.map((_, i) => join(tmpDir, `u${i}.wav`));
    await gemini.splitBatch(wav, units.map((u) => u.text), unitWavs);
    const out = [];
    for (const [i, u] of units.entries()) {
      const dests = u.subs.map((s, j) => join(tmpDir, `u${i}-${j}-${s.gemFile}`));
      // Weitere Zwischenfragen im Monolog: die Einheit lokal an der Satzgrenze teilen.
      if (u.subs.length > 1) log(`teile Einheit ${i + 1} in ${u.subs.length} Abschnitte …`);
      await gemini.splitBatch(unitWavs[i], u.subs.map((s) => s.text), dests, { fine: true });
      u.subs.forEach((s, j) => out.push([dests[j], s.gemFile]));
    }
    for (const [from, file] of out) copyFileSync(from, join(outDir, file));
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
  return true;
}

async function runGemini() {
  if (!gemini.canVerify()) console.warn('Hinweis: whisper-cli oder Modell fehlt, Schnitte werden NICHT geprüft (brew install whisper-cpp, Modell nach ~/.cache/whisper).');
  const open = levels.filter((l) => (!only || only.includes(l.id)) && l.segs.some((s) => !have(s.gemFile)));
  const plan = open.map((l) => ({ l, n: batches(l.units).filter((b) => b.some((u) => !unitDone(u))).length }));
  const doneCount = levels.filter((l) => l.segs.every((s) => have(s.gemFile))).length;
  console.log(`Gemini: ${doneCount} von ${levels.length} Leveln fertig, ${open.length} offen${only ? ' (gefiltert)' : ''} (${plan.reduce((a, p) => a + p.n, 0)} Anfragen).`);
  if (planOnly) { plan.forEach((p) => console.log(`  ${p.l.id}: ${p.n} Anfrage(n)`)); return; }
  let rendered = 0;
  for (const { l } of plan) {
    if (rendered >= maxLevels) break;
    const log = (m) => console.log(`  ${l.id}: ${m}`);
    try {
      // Immer das ganze Level zusammenstellen, damit die Aufnahme im Cache wieder passt.
      for (const b of batches(l.units)) {
        if (b.every(unitDone)) continue;
        try {
          await renderBatch(b, log);
        } catch (e) {
          if (gemini.isDailyLimit(e) || !e.problems) throw e;
          log(`Level-Aufnahme nicht sauber schneidbar:\n      ${e.problems.join('\n      ')}`);
          // Teil für Teil: schon vorhandene Einzelaufnahmen immer nutzen, neue nur mit --retry-items.
          for (const itemId of [...new Set(b.map((u) => u.subs[0].itemId))]) {
            const part = b.filter((u) => u.subs[0].itemId === itemId);
            if (part.every(unitDone)) continue;
            try {
              if (!(await renderBatch(part, log, { cachedOnly: !retryItems }))) log(`${itemId} offen (mit --retry-items einzeln neu anfragen)`);
            } catch (e2) {
              if (gemini.isDailyLimit(e2)) throw e2;
              log(`${itemId} übersprungen: ${e2.message}`);
            }
          }
        }
      }
      if (l.segs.some((s) => !have(s.gemFile))) { log('noch nicht vollständig.'); continue; }
      rendered++;
      log('fertig.');
    } catch (e) {
      if (gemini.isDailyLimit(e)) { console.log('Tageskontingent von Gemini erreicht. Morgen einfach nochmal starten, es geht hier weiter.'); break; }
      log(`Fehler: ${e.message}`);
    }
  }
}

/* ---- edge-tts: Ersatz für alles, was noch keine Gemini-Fassung hat --------------- */

function runEdgeJob(job) {
  const dest = join(outDir, job.file);
  const args = [...CMD.slice(1), '--voice', job.voice, `--rate=${job.rate}`, `--pitch=${job.pitch}`, '--text', job.text, '--write-media', dest];
  return new Promise((resolve, reject) => {
    const p = spawn(CMD[0], args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => (code === 0 && existsSync(dest) && statSync(dest).size > 1000 ? resolve() : reject(new Error(err.trim().split('\n').pop() || `exit ${code}`))));
  });
}

async function runEdge() {
  const jobs = new Map();
  for (const [itemId, segs] of items) {
    if (gemDone(itemId)) continue;
    for (const s of segs) if (force || !have(s.edgeFile)) jobs.set(s.edgeFile, { file: s.edgeFile, text: s.text, ...s.edge });
  }
  const todo = [...jobs.values()];
  if (!todo.length) return [];
  console.log(`edge-tts: ${todo.length} Abschnitte zu vertonen …`);
  let done = 0;
  const failed = [];
  async function worker() {
    while (todo.length) {
      const job = todo.shift();
      for (let attempt = 1; ; attempt++) {
        try { await runEdgeJob(job); break; } catch (e) {
          if (attempt >= 3) { failed.push(`${job.file}: ${e.message}`); break; }
          await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
      }
      done++;
      if (done % 20 === 0) console.log(`  ${done} fertig`);
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return failed;
}

if (engine === 'gemini') await runGemini();
if (planOnly) process.exit(0);
const failed = await runEdge();

/* ---- Übersicht schreiben, Verwaistes löschen ------------------------------------ */

const manifest = {};
const keep = new Set();
let gemItems = 0;
for (const [itemId, segs] of items) {
  const useGem = gemDone(itemId);
  if (useGem) gemItems++;
  const files = segs.map((s) => (useGem ? s.gemFile : s.edgeFile));
  files.forEach((f) => keep.add(f));
  // Nur Items aufnehmen, deren Dateien vollständig da sind (sonst liest die Gerätestimme).
  if (!files.every(have)) continue;
  manifest[itemId] = { segments: segs.map((s, i) => ({ file: `audio/${files[i]}`, who: s.who, gap: s.gap, ...(s.quiz != null ? { quiz: s.quiz } : {}) })) };
}
let removed = 0;
for (const f of readdirSync(outDir)) if (f.endsWith('.mp3') && !keep.has(f)) { rmSync(join(outDir, f)); removed++; }
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + '\n');

const bytes = [...keep].reduce((n, f) => n + (have(f) ? statSync(join(outDir, f)).size : 0), 0);
console.log(`Fertig: ${Object.keys(manifest).length} Dialoge/Texte vertont (${gemItems} mit Gemini), ${(bytes / 1024 / 1024).toFixed(1)} MB, ${removed} alte Dateien entfernt.`);
if (failed.length) { console.error(`${failed.length} Abschnitte fehlgeschlagen:\n${failed.join('\n')}`); process.exit(1); }
