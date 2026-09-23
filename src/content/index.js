import { buildIndex } from '../engine/content.js';

// Jede JSON-Datei in ./chapters ist ein Kapitel. Neues Kapitel = neue Datei.
const modules = import.meta.glob('./chapters/*.json', { eager: true, import: 'default' });

export const CHAPTERS = Object.values(modules);
export const INDEX = buildIndex(CHAPTERS);
