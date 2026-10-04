// Vorlese-Audios mit Gemini-TTS (Google AI Studio, kostenloser API-Key).
//
// Statt Tempo/Tonhöhe in Zahlen bekommt jede Figur eine Regieanweisung ("style")
// aus ihrem Archetyp und eine feste Gemini-Stimme. Der Key steht in .env.local
// als GEMINI_API_KEY (nicht im Git). Gemini liefert WAV, ffmpeg macht MP3 daraus.
import { readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir, homedir } from 'node:os';
import { WORLD } from './voices.mjs';
import { voiceOf, speakersOf } from '../src/engine/world.js';
import { normalize, levenshtein } from '../src/engine/answer.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts';

function apiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const env = join(root, '.env.local');
  const m = existsSync(env) && readFileSync(env, 'utf8').match(/^GEMINI_API_KEY=(.+)$/m);
  if (!m || !m[1].trim()) throw new Error('GEMINI_API_KEY fehlt (in .env.local eintragen)');
  return m[1].trim().replace(/^["']|["']$/g, '');
}

// Regieanweisung je Archetyp. Gemini versteht freie Sprache.
export const STYLES = {
  'hibbelig-aufgeregt': 'hibbelig und aufgeregt, schnell, lebhaft, mit viel Betonung',
  'monoton-trocken': 'trocken und wortkarg, eher monoton, gelassen, wenig Betonung',
  'warm-ruhig': 'warm, ruhig und freundlich, gemächlich',
  'energisch-jung': 'jung, energisch und motiviert, zügig',
  'müde-genervt': 'müde und genervt, etwas gedehnt, leicht seufzend',
  'sachlich-neutral': 'sachlich, klar und freundlich, natürliches Gesprächstempo',
};
const BASE = 'natürliches Alltagsgespräch auf Hochdeutsch';

// Stimmen nach Geschlecht, grob passend zum Archetyp vorsortiert.
// Google gibt kein Geschlecht an; die Zuordnung ist nach Gehör.
const FEMALE = {
  'hibbelig-aufgeregt': ['Laomedeia', 'Zephyr', 'Autonoe'],
  'monoton-trocken': ['Kore', 'Erinome'],
  'warm-ruhig': ['Sulafat', 'Vindemiatrix', 'Achernar'],
  'energisch-jung': ['Leda', 'Aoede', 'Callirrhoe'],
  'müde-genervt': ['Despina', 'Gacrux'],
  'sachlich-neutral': ['Erinome', 'Kore', 'Autonoe'],
};
const MALE = {
  'hibbelig-aufgeregt': ['Fenrir', 'Puck'],
  'monoton-trocken': ['Algenib', 'Alnilam', 'Schedar'],
  'warm-ruhig': ['Achird', 'Umbriel', 'Algieba'],
  'energisch-jung': ['Puck', 'Sadachbia', 'Zubenelgenubi'],
  'müde-genervt': ['Enceladus', 'Zubenelgenubi'],
  'sachlich-neutral': ['Iapetus', 'Charon', 'Rasalgethi'],
};
const all = (pools) => [...new Set(Object.values(pools).flat())];

/** Erzählstimme für die Lesetexte ("Miro liest vor"). */
export const NARRATOR = { voice: 'Sadaltager', style: 'ruhiger, warmer Erzähler, der eine kurze Geschichte vorliest, gemächlich, mit natürlichen Pausen' };

function hashStr(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** Stimme + Stil für alle Sprecher eines Dialogs: { [who | '_']: {voice, style} }. */
export function castDialog(item) {
  const cast = {};
  const used = new Set();
  for (const ch of speakersOf(WORLD, item)) {
    const v = voiceOf(WORLD, ch);
    const arche = WORLD.archetypes[ch.personality] ? ch.personality : 'sachlich-neutral';
    const pools = v.gender === 'male' ? MALE : v.gender === 'female' ? FEMALE : { ...FEMALE, ...MALE };
    const pool = [...(pools[arche] || []), ...all(pools)];
    let voice = ch.voiceProfile?.geminiVoice;
    if (!voice || used.has(voice)) {
      const start = hashStr(ch.id) % (pools[arche]?.length || 1);
      voice = [...pool.slice(start), ...pool].find((c) => !used.has(c));
    }
    used.add(voice);
    const style = [ch.voiceProfile?.geminiStyle || STYLES[arche], BASE].join(', ');
    cast[item.lines ? ch.name : '_'] = { voice, style, ...(item.geminiVoices?.[ch.name] || {}) };
  }
  return cast;
}

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || `ffmpeg exit ${code}`))));
  });
}

/** Eine Anfrage an Gemini → WAV-Datei (Pfad). Wirft bei Fehlern; 429 enthält retryAfter (ms). */
async function request(content, speechConfig, wavPath) {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      input: [{ type: 'user_input', content }],
      response_format: { type: 'audio' },
      generation_config: { speech_config: speechConfig },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(`HTTP ${res.status}: ${body.error?.message || res.statusText}`);
    e.status = res.status;
    const delay = body.error?.details?.find((d) => d.retryDelay)?.retryDelay;
    const hint = (delay || e.message.match(/retry in ([\d.]+)s/)?.[1]);
    if (hint) e.retryAfter = parseFloat(hint) * 1000;
    throw e;
  }
  const audio = (body.steps || []).filter((s) => s.type === 'model_output').flatMap((s) => s.content || []).filter((c) => c.type === 'audio').pop();
  if (!audio?.data) throw new Error('Antwort ohne Audio');
  const raw = join(tmpdir(), `spur-${process.pid}-${Date.now()}.bin`);
  writeFileSync(raw, Buffer.from(audio.data, 'base64'));
  try {
    // Gemini liefert meist WAV mit Header; sonst rohes PCM (24 kHz, mono, 16 bit). Einheitlich als WAV ablegen.
    const pcm = audio.mime_type && !/wav/.test(audio.mime_type);
    await ffmpeg([...(pcm ? ['-f', 's16le', '-ar', '24000', '-ac', '1'] : []), '-i', raw, '-ar', '24000', '-ac', '1', wavPath]);
  } finally {
    rmSync(raw, { force: true });
  }
  return wavPath;
}

/** Ausschnitt [from, to] als MP3 (48 kbit/s) oder, bei Ziel *.wav, verlustfrei als WAV. */
export const toMp3 = (src, dest, from, to) => ffmpeg([...(from != null ? ['-ss', from.toFixed(3)] : []), ...(to != null ? ['-to', to.toFixed(3)] : []),
  '-i', src, ...(dest.endsWith('.wav') ? ['-c:a', 'pcm_s16le'] : ['-codec:a', 'libmp3lame', '-b:a', '48k']), '-ac', '1', dest]);

/** Ein Abschnitt → MP3 unter dest. */
export async function synth({ text, voice, style }, dest) {
  const wav = join(tmpdir(), `spur-${process.pid}-${hashStr(dest)}.wav`);
  try {
    await request([{ type: 'text', text, annotations: [{ type: 'speech_metadata', style }] }], [{ voice }], wav);
    await toMp3(wav, dest);
  } finally {
    rmSync(wav, { force: true });
  }
}

/**
 * Ein ganzes Gespräch (höchstens 2 Stimmen) oder mehrere Abschnitte einer Stimme in EINER
 * Anfrage → WAV. turns: [{ text, speaker?, voice, style }]. Zwischen den Abschnitten steht
 * eine lange Pause, an der später geschnitten wird.
 */
export async function synthBatch(turns, wavPath) {
  const voices = [...new Map(turns.map((t) => [t.speaker || '_', t.voice])).entries()];
  if (voices.length > 2) throw new Error('Gemini kann höchstens 2 Stimmen pro Anfrage');
  const multi = voices.length === 2;
  const content = turns.map((t, i) => ({
    type: 'text',
    text: i < turns.length - 1 ? `${t.text} <long pause>` : t.text,
    annotations: [{ type: 'speech_metadata', style: t.style, ...(multi ? { speaker: t.speaker } : {}) }],
  }));
  const config = multi
    ? { mode: 'conversational', speakers: voices.map(([speaker, voice]) => ({ speaker, voice })) }
    : [{ voice: voices[0][1] }];
  return request(content, config, wavPath);
}

/** Stille-Stellen einer Datei (ab minDur Sekunden): [{ start, end }] in Sekunden, plus Gesamtdauer. */
async function silences(wav, minDur = 0.25) {
  const out = await new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-i', wav, '-af', `silencedetect=noise=-38dB:d=${minDur}`, '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', () => resolve(err));
  });
  const list = [];
  for (const m of out.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g)) list.push({ start: +m[1], end: +m[2] });
  const d = out.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return { list, total: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : 0 };
}

// Lokale Spracherkennung zur Kontrolle der Schnitte (whisper.cpp, `brew install whisper-cpp`,
// Modell ggml-small.bin in ~/.cache/whisper). Fehlt sie, wird ohne Kontrolle geschnitten.
const WHISPER_MODEL = process.env.WHISPER_MODEL || join(homedir(), '.cache/whisper/ggml-small.bin');
export const canVerify = () => existsSync(WHISPER_MODEL) && spawnSync('which', ['whisper-cli']).status === 0;

/** Text jeder Datei (ein Lauf, Modell wird nur einmal geladen). */
async function transcribeFiles(files) {
  await new Promise((resolve, reject) => {
    const p = spawn('whisper-cli', ['-m', WHISPER_MODEL, '-l', 'de', '-nt', '-np', '-otxt', ...files.flatMap((f) => ['-f', f])], { stdio: 'ignore' });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`whisper-cli exit ${code}`))));
  });
  return files.map((f) => {
    const txt = `${f}.txt`;
    const t = existsSync(txt) ? readFileSync(txt, 'utf8') : '';
    rmSync(txt, { force: true });
    return t;
  });
}

const ONES = ['null', 'ein', 'zwei', 'drei', 'vier', 'fuenf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwoelf',
  'dreizehn', 'vierzehn', 'fuenfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
const TENS = ['', '', 'zwanzig', 'dreissig', 'vierzig', 'fuenfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];
/** 0–9999 als deutsches Zahlwort (normalisiert, ohne Umlaute). Jahreszahlen wie 1985 genügen grob. */
function numWord(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return (n % 10 ? `${ONES[n % 10]}und` : '') + TENS[Math.floor(n / 10)];
  if (n < 1000) return `${ONES[Math.floor(n / 100)]}hundert${n % 100 ? numWord(n % 100) : ''}`;
  return `${ONES[Math.floor(n / 1000)]}tausend${n % 1000 ? numWord(n % 1000) : ''}`;
}
/** Vergleichbare Buchstabenfolge: normalisiert, Zahlen ausgeschrieben, ohne Leerzeichen. */
const letters = (t) => normalize(t).replace(/\d+/g, (d) => (d.length <= 4 ? numWord(+d) : d)).replace(/eins(?=$|[^a-z])/g, 'ein').replace(/ /g, '');

/** Länge der längsten gemeinsamen Teilfolge zweier Zeichenketten. */
function lcs(a, b) {
  let prev = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Uint16Array(b.length + 1);
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Prüft geschnittene Abschnitte: Was Whisper in jedem hört, muss zur Zeile passen (in beide
 * Richtungen, sonst ist ein Stück der Nachbarzeile mit drin oder etwas fehlt).
 * @returns {{ ok: boolean, msg: string }[]}
 */
export async function verifySegments(files, texts, offset = 0) {
  const heard = await transcribeFiles(files);
  return heard.map((h, i) => {
    // Zeichenweise, damit "49"/"neunundvierzig" und "dazurechnen"/"dazu rechnen" gleich zählen.
    const a = letters(texts[i]);
    const b = letters(h);
    const common = lcs(a, b);
    const recall = a.length ? common / a.length : 1;
    const precision = b.length ? common / b.length : 0;
    // Kurze Zeilen ("Fairer Deal.") verhört Whisper leicht; dort reicht eine grobe Übereinstimmung,
    // ein falscher Schnitt fällt ohnehin an der langen Nachbarzeile auf.
    const min = texts[i].split(/\s+/).length <= 4 ? 0.5 : 0.8;
    const ok = recall >= min && precision >= min;
    return { ok, score: recall + precision, msg: ok ? '' : `Abschnitt ${offset + i + 1}: erwartet "${texts[i].slice(0, 50)}…", gehört "${h.trim().slice(0, 50)}…"` };
  });
}

/**
 * Schneidet die Batch-Aufnahme in so viele MP3s, wie es Abschnitte gibt. Gemini hält die
 * eingefügten Pausen nicht immer gleich lang, und auch mitten in einer Zeile wird mal Luft
 * geholt. Deshalb wird jeder Schnitt so gewählt, dass Pausenlänge und erwartete Länge des
 * Abschnitts (nach Wortzahl) zusammen am besten passen. Danach prüft Whisper jeden Abschnitt;
 * passt einer nicht, gibt es einen Fehler, statt falsch zu schneiden.
 */
export async function splitBatch(wav, texts, dests, { fine = false } = {}) {
  const n = texts.length;
  if (n === 1) { await toMp3(wav, dests[0]); return { total: null, cuts: [], verified: false }; }
  // fine: Schnitt zwischen Sätzen derselben Stimme, dort sind die Pausen oft nur 0,1–0,2 s lang.
  const { list, total } = await silences(wav, fine ? 0.08 : 0.25);
  const words = texts.map((t) => t.split(/\s+/).length);
  const sum = words.reduce((a, b) => a + b, 0);
  // Stille am Anfang/Ende zählt nicht als Schnitt.
  const cand = list.filter((s) => s.start > 0.3 && s.end < total - 0.3);
  const m = cand.length;
  if (m < n - 1) throw new Error(`nur ${m} von ${n - 1} Pausen gefunden`);
  // Bestes geordnetes Paar (Schnitt k ↔ Pause j). Eine lange Pause zählt, ein Abschnitt, dessen
  // Länge nicht zu seiner Wortzahl passt, kostet. Gemessen wird pro Abschnitt (nicht absolut),
  // damit unterschiedlich schnelle Sprecher sich über eine lange Aufnahme nicht aufsummieren.
  const rate = total / sum;
  const mid = (j) => (j < 0 ? 0 : (cand[j].start + cand[j].end) / 2);
  const len = (k, i, j) => Math.abs(mid(j) - mid(i) - words[k] * rate) / Math.max(1, words[k] * rate);
  const score = (k, i, j) => Math.min(cand[j].end - cand[j].start, 1.5) - 1.2 * len(k, i, j);
  const best = Array.from({ length: n - 1 }, () => new Array(m).fill(-Infinity));
  const from = Array.from({ length: n - 1 }, () => new Array(m).fill(-1));
  for (let k = 0; k < n - 1; k++) {
    for (let j = k; j < m; j++) {
      if (k === 0) { best[k][j] = score(0, -1, j); continue; }
      for (let i = k - 1; i < j; i++) {
        const v = best[k - 1][i] + score(k, i, j);
        if (v > best[k][j]) { best[k][j] = v; from[k][j] = i; }
      }
    }
  }
  // Der letzte Abschnitt muss auch passen.
  const last = best[n - 2].map((v, j) => v - 1.2 * Math.abs(total - mid(j) - words[n - 1] * rate) / Math.max(1, words[n - 1] * rate));
  let j = last.indexOf(Math.max(...last));
  const cuts = [];
  for (let k = n - 2; k >= 0; k--) { cuts.unshift(cand[j]); j = from[k][j]; }
  // Etwas Stille an den Rändern stehen lassen, damit nichts abgehackt klingt.
  const pad = 0.12;
  const cut = (i, file = dests[i]) => toMp3(wav, file, i === 0 ? null : Math.max(0, cuts[i - 1].end - pad), i === n - 1 ? null : cuts[i].start + pad);
  for (let i = 0; i < n; i++) await cut(i);
  if (!canVerify()) return { total, cuts, verified: false };
  let check = await verifySegments(dests, texts);
  // Reparatur: Für jeden Schnitt neben einem falschen Abschnitt die anderen Pausen zwischen den
  // Nachbarschnitten durchprobieren und die nehmen, bei der beide Abschnitte am besten passen.
  // Zwei Durchgänge, weil ein Abschnitt an beiden Enden falsch geschnitten sein kann.
  for (let pass = 0; pass < 2 && check.some((c) => !c.ok); pass++) {
    const bad = [...new Set(check.flatMap((c, i) => (c.ok ? [] : [i - 1, i])))].filter((x) => x >= 0 && x < n - 1).sort((x, y) => x - y);
    for (const b of bad) {
      if (check[b].ok && check[b + 1].ok) continue;
      const lo = b === 0 ? 0 : cuts[b - 1].end;
      const hi = b + 1 < n - 1 ? cuts[b + 1].start : total;
      // Die Pausen in der Nähe der erwarteten Stelle (nach Wortzahl) zuerst probieren.
      const expect = lo + (hi - lo) * (words[b] / (words[b] + words[b + 1]));
      const dist = (x) => Math.abs((x.start + x.end) / 2 - expect);
      const options = list.filter((x) => x.start > lo + 0.3 && x.end < hi - 0.3 && x !== cuts[b])
        .sort((x, y) => dist(x) - dist(y)).slice(0, 10);
      let top = { cut: cuts[b], r: [check[b], check[b + 1]], score: check[b].score + check[b + 1].score };
      for (const o of options) {
        cuts[b] = o;
        const tmp = [0, 1].map((d) => dests[b + d].replace(/(\.\w+)$/, '.try$1'));
        await cut(b, tmp[0]);
        await cut(b + 1, tmp[1]);
        const r = await verifySegments(tmp, [texts[b], texts[b + 1]], b);
        tmp.forEach((f) => rmSync(f, { force: true }));
        if (r[0].score + r[1].score > top.score) top = { cut: o, r, score: r[0].score + r[1].score };
        if (r[0].ok && r[1].ok) break;
      }
      cuts[b] = top.cut;
      [check[b], check[b + 1]] = top.r;
      await cut(b);
      await cut(b + 1);
    }
  }
  const problems = check.filter((c) => !c.ok).map((c) => c.msg);
  if (problems.length) throw Object.assign(new Error(`falsch geschnitten:\n  ${problems.join('\n  ')}`), { problems });
  return { total, cuts, verified: true };
}

/** Tageskontingent aufgebraucht? Dann lohnt kein weiterer Versuch heute. */
export const isDailyLimit = (e) => e?.status === 429 && /per day|RPD|daily/i.test(e.message);

/** Führt fn aus und wartet bei Rate-Limits pro Minute (429) und kurzen Serverfehlern. */
export async function withRetry(fn, log = () => {}) {
  for (let attempt = 1; ; attempt++) {
    try { return await fn(); } catch (e) {
      const transient = e.status === 429 || e.status >= 500 || !e.status;
      if (!transient || attempt >= 8 || isDailyLimit(e)) throw e;
      const wait = (e.retryAfter || 5000 * attempt) + 1000;
      log(`warte ${Math.round(wait / 1000)} s (${e.status || e.message}) …`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

/** Wie synth, mit withRetry. */
export const synthRetry = (job, dest, log) => withRetry(() => synth(job, dest), log);
