// Gemeinsame Welt: Figuren mit Persönlichkeits-Archetyp und Stimmprofil.
// Die Welt verbindet Zuhören und Lesen nur inhaltlich — aufs Scheduling hat sie
// keinen Einfluss.

export function buildWorld(world) {
  const byId = new Map(world.characters.map((c) => [c.id, c]));
  const byName = new Map(world.characters.map((c) => [c.name, c]));
  const locations = new Map((world.locations || []).map((l) => [l.id, l]));
  return { ...world, byId, byName, locations };
}

/** pitch/rate als Faktoren (1 = normal) für eine Figur, aus ihrem Archetyp. */
export function voiceOf(world, character) {
  const a = world.archetypes[character?.personality] || world.archetypes['sachlich-neutral'];
  const vp = character?.voiceProfile || {};
  return {
    gender: vp.gender || null,
    pitch: vp.pitch ?? a.pitch,
    rate: vp.rate ?? a.rate,
    voiceNameHints: vp.voiceNameHints || [],
    edgeVoice: vp.edgeVoice || null,
  };
}

/**
 * Faktoren → edge-tts-Parameter. Rate 1.2 → "+20%". Pitch kennt edge-tts nur in Hz;
 * 50 Hz pro Faktor-Einheit hält die Stimmen natürlich (1.35 → +18 Hz, 0.85 → −8 Hz).
 */
export function edgeParams(v) {
  const r = Math.round((v.rate - 1) * 100);
  const p = Math.round((v.pitch - 1) * 50);
  return { rate: `${r >= 0 ? '+' : ''}${r}%`, pitch: `${p >= 0 ? '+' : ''}${p}Hz` };
}

/** Sprecher eines Dialogs in Reihenfolge des ersten Auftretens (Figur-Objekte). */
export function speakersOf(world, item) {
  if (!item.lines) {
    const c = world.byId.get(item.characterId);
    return c ? [c] : [];
  }
  const seen = new Map();
  for (const l of item.lines) if (!seen.has(l.who)) seen.set(l.who, world.byName.get(l.who) || { id: l.who, name: l.who });
  return [...seen.values()];
}

export function initials(name) {
  const parts = name.replace(/^(Frau|Herr|Oma|Opa|Tante|Onkel|Meister|Azubi)\s+/, '').split(/\s+/);
  return parts.map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}
