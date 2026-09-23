# spur — Gedächtnistraining mit Miro

Progressive Web App für einen einzelnen Nutzer, komplett lokal: kein Server, kein Konto, kein Tracking.
Trainiert zwei Fähigkeiten in täglichen Kurz-Sessions:

- **Zuhören** – beiläufige Details aus Gesprächen behalten und nach Tagen ohne Vorwarnung abrufen
- **Lesen** – einen Sachtext frei wiedergeben und sich selbst anhand von Kernpunkten bewerten

Design, Farben, Typografie, Komponenten und Copy stammen 1:1 aus dem Claude-Design-Export
(`SPUR App.dc.html`, SPUR Design System, `design_handoff_spur_app/README.md`).

## Starten

```bash
npm install
npm run dev            # Entwicklung (ohne Service Worker)
npm run build          # Produktions-Build nach dist/
npm run preview        # Build lokal ansehen (mit Service Worker)
npm test               # Tests der Spaced-Repetition- und Spiel-Logik
npm run check:content  # Inhalte prüfen (Schema + jede Musterlösung wird erkannt)
```

`dist/` ist eine rein statische Seite. Für die Installation als App braucht sie HTTPS
(z. B. Cloudflare Pages, Netlify, GitHub Pages). Danach auf dem iPhone in Safari „Teilen →
Zum Home-Bildschirm“, auf Android „App installieren“.

## Bilder aus dem Design-Export übernehmen (einmalig)

Die Miro-Illustrationen (PNG) ließen sich über die Design-Schnittstelle nicht herunterladen.
Bis sie da sind, zeigt die App den Platzhalter aus dem Design System (gestrichelter Kreis mit Feder).

1. In Claude Design das Projekt exportieren bzw. herunterladen und entpacken.
2. `npm run assets -- /Pfad/zum/entpackten/Export`

Das Skript sucht `miro-*.png`, `miro-sorting-cards.png` und `app-icon.png`, verkleinert Miro für
den Offline-Cache auf 480 px, legt alles unter `public/assets/` ab und erzeugt die Home-Screen-Icons
aus dem PNG-Master neu (`npm run icons`). Danach neu bauen.

## Gemeinsame Welt, getrenntes Scheduling

- **Welt** (`src/content/world.json`): Alle Figuren mit Beziehung zu dir, Persönlichkeits-Archetyp
  und Stimmprofil, dazu Orte. Jeder Dialog hat eine `characterId` (die Figur mit der wichtigen
  Info) und `worldRefs` (erwähnte Figuren/Orte). Die Welt verbindet die Spuren nur inhaltlich.
- **Zuhören und Lesen schalten unabhängig frei.** Jede Spur hat ihren eigenen aktuellen Knoten.
  Neue Gespräche kommen in Schwierigkeits-Reihenfolge dazu, danach wird jede Karte nur nach ihren
  eigenen Intervallen fällig, unabhängig von allem anderen. Checkpoints wiederholen nur ihre Spur.
- **Zuhören in zwei Schritten:** Bei neuen Gesprächen gibt es zuerst nur Stimmen. Die sprechenden
  Figuren erscheinen als Avatare, die aktive Figur atmet. Es gibt höchstens 2 Wiedergaben, kein Text
  und keine Frage. Danach kommen die Fragen. Bei fälligen Wiederholungen entfällt der Hör-Schritt.
  Nur wenn Vorlesen komplett scheitert, lässt sich der Text ausnahmsweise einblenden.

### Archetypen

| Archetyp | pitch | rate | Beispiele |
|---|---|---|---|
| hibbelig-aufgeregt | 1.35 | 1.2 | Frau Berger (Nachbarin), Tante Vera, Kim |
| monoton-trocken | 0.85 | 0.88 | Thomas (Kollege), Meister Kowalski |
| warm-ruhig | 1.02 | 0.92 | Oma Ilse, Marta |
| energisch-jung | 1.2 | 1.12 | Mia (Freundin), Azubi Timo |
| müde-genervt | 0.9 | 0.82 | Sandra (Kollegin), Frau Heller |
| sachlich-neutral | 1.0 | 1.0 | Jana (Chefin), Frau Demir |

Die Faktoren wirken an zwei Stellen. Bei den mitgelieferten Aufnahmen werden sie in edge-tts-Werte
umgerechnet (Tempo in %, Tonhöhe in Hz, 50 Hz pro Faktor-Einheit). Bei der Gerätestimme als
Fallback werden sie direkt als `pitch`/`rate` gesetzt. Dort wird zusätzlich eine Stimme nach
Geschlecht und `voiceNameHints` gesucht.

## Vorlese-Stimmen

Dialoge und Texte werden nicht live vom Gerät vorgelesen, sondern mit mitgelieferten Audiodateien
(`public/audio/`, ca. 9 MB, 25 Minuten). Erzeugt werden sie mit neuronalen Microsoft-Stimmen
über [edge-tts](https://github.com/rany2/edge-tts):

- Jede Figur hat eine feste Stimme (`voiceProfile.edgeVoice` oder stabil aus dem Pool gewählt),
  wiederkehrende Figuren klingen überall gleich. Zwei Figuren im selben Gespräch bekommen nie
  dieselbe Stimme.
- Tempo und Tonhöhe kommen aus dem Archetyp der Figur.
- Die Lesetexte liest immer dieselbe ruhige Erzählstimme („Miro“), die in keinem Gespräch vorkommt.

```bash
npm run audio            # vertont nur Neues/Geändertes, löscht Verwaistes
npm run audio -- --force # alles neu
```

Voraussetzung ist [uv](https://docs.astral.sh/uv/), edge-tts wird dann per `uvx` geholt. Nach
neuen Kapiteln oder Figuren: `npm run audio`, danach committen. Vercel baut nur und vertont nichts.

Hinweis: edge-tts nutzt den inoffiziellen Vorlese-Dienst des Edge-Browsers. Das ist eine
rechtliche Grauzone und kann jederzeit wegfallen. Die fertigen Dateien bleiben aber nutzbar.
Das Vertonen passiert nur einmal beim Entwickeln. Die App selbst spielt nur die mitgelieferten
Dateien ab und schickt nichts an einen Server. Fehlt eine Datei, liest die Gerätestimme.

## Wie gelernt wird

| Prinzip | Umsetzung |
|---|---|
| Spaced Repetition (Ebbinghaus) | Intervalle 1 · 2 · 4 · 8 · 16 · 30 · 60 Tage. Gut erinnert → eine Stufe weiter, teilweise → Stufe bleibt, kaum etwas → Stufe 0. Neue Karten starten bei Stufe −1 (sofort fällig). `src/engine/srs.js` |
| Retrieval Practice | Fällige Wiederholungen zeigen nie den Originaltext, nur Frage bzw. Thema. Erst nach der Antwort kommt das Original als Gedächtnisstütze. |
| Desirable Difficulty (Bjork) | Kapitel werden länger und dichter: von 3 Details in 2 Sätzen bis zu 6 Details in Gesprächen mit mehreren Personen, von 3 bis zu 6 Kernpunkten. Ab Kapitel 3 gemischte Checkpoints. |
| Interleaving | Neue Lektionen mischen bis zu 3 fällige Karten der anderen Spur ein. Folgefragen zu einem Gespräch kommen erst später in der Session („Ich frage später nach“). Bei „Beides“ wechseln sich die Kapitel ab. |

Antwortprüfung beim Zuhören: Groß-/Kleinschreibung und Umlaute werden normalisiert. Ein
Schlüsselwort zählt auch mit einem Tippfehler (Levenshtein ≤ 1, Buchstabendreher inklusive).
Fragen mit mehreren Details geben Teilpunkte. Wird eine richtige Antwort nicht erkannt, kannst du
sie im Feedback selbst als gemerkt zählen.

## Spielregeln

- **Federn:** +10 gut erinnert, +5 teilweise, +2 kaum etwas. Teilnahme bringt nie 0.
- **Streak:** +1 pro Kalendertag mit mindestens einer Karte. Nach einer Lücke einmalig der Screen
  „Gestern war Pause. Macht nichts.“, der längste Streak bleibt stehen.
- **Herzen:** maximal 5. Nur eine neue Karte mit „kaum etwas“ kostet ein Herz, Wiederholungen nie.
  Ein Herz kommt alle 2 Stunden zurück. Bei 0 Herzen bleiben Wiederholungen immer möglich.
- **Meilensteine** 7, 14, 30, 50, 100 … Tage: Flammen-Screen und unendliche Aufmerksamkeit bis Mitternacht.
- **Tagesziel** 1 / 3 / 5 / 8 Karten (3 empfohlen). Ist es erreicht und nichts mehr fällig, kommt
  „Für heute ist alles gemerkt“ mit „Freiwillige Runde“.

## Felder, Teilübungen und Inhalte

Jeder Knoten im Pfad ist ein **Feld** mit 1–4 **Teilübungen**. Die Anzahl ist bewusst
unterschiedlich. Ein Feld ist erst abgeschlossen, wenn **alle** Teilübungen gemeistert sind,
also mindestens teilweise richtig beantwortet. Erst dann schaltet sich das nächste Feld frei.
Ist eine Übung daneben, kommt am Ende der Runde ein zweiter Versuch. Er kostet kein Herz und
ändert kein Intervall. Jede Teilübung hat ihren eigenen Spaced-Repetition-Verlauf.

| Typ | Übung | Anteil |
|---|---|---|
| `recall_text` mit `answers` | Freitext, automatisch geprüft | Großteil (Kernmechanik) |
| `recall_text` ohne `answers` (id `retell`) | Text frei nacherzählen, Selbstbewertung über `keyPoints` | jeder Lesetext |
| `sequence_events` | 3–4 Ereignisse in die richtige Reihenfolge tippen | gelegentlich |
| `detail_match` | Antwort-Chips, eine oder mehrere richtig | gelegentlich |

Am Knoten zeigt ein **Segment-Ring** den Stand: ein Bogen pro Teilübung. Gemeisterte Bögen
sind voll in der Spurfarbe, offene zu 28 %. In der Übung steht oben „Frage X von Y“, bezogen
auf das aktuelle Feld.

Jede JSON-Datei in `src/content/chapters/` ist ein Kapitel. Ein neues Kapitel ist einfach eine
neue Datei, danach `npm run check:content` und `npm run audio`.

```jsonc
{
  "id": "zuhoeren-6", "order": 6, "title": "…", "track": "listen" /* | "read" | "mixed" */, "difficulty": 6,
  "lessons": [                                         // Felder, beliebig viele
    { "id": "z6-beispiel", "title": "Beispiel", "items": [
      { "id": "z6-beispiel-d", "type": "dialog", "title": "…", "characterId": "frau-berger",
        "text": "…"                                   /* oder "lines": [{ "who": "Name", "text": "…" }] */,
        "subExercises": [                              // 1–4 pro Feld
          { "id": "q1", "type": "recall_text", "prompt": "Frage?", "answers": [["Jonas", "Bruder"]], "solution": "…", "quote": "„…“" },
          { "id": "s1", "type": "sequence_events", "prompt": "Was passierte zuerst?", "events": ["…", "…", "…"] },
          { "id": "m1", "type": "detail_match", "prompt": "…", "options": ["…", "…", "…"], "correct": ["…"], "quote": "„…“" }
        ],
        "worldRefs": { "charactersReferenced": [], "locationsReferenced": [] } },
      { "id": "l6-text-t", "type": "text", "title": "…", "topic": "…", "paragraphs": ["…"], "keyPoints": ["…"],
        "subExercises": [{ "id": "retell", "type": "recall_text" }] }
    ] },
    { "id": "z6-checkpoint", "type": "checkpoint", "title": "Checkpoint" }
  ]
}
```

Werden Karten-IDs umgebaut, etwa weil ein Gespräch in zwei Teile geteilt wird, trägt man die
alte und die neue ID in `src/content/migrations.json` ein. Verlauf und Intervalle wandern beim
nächsten Start mit.

Mitgeliefert: 11 Kapitel mit 57 Feldern und 163 Teilübungen. Davon sind 106 Freitext,
24 Nacherzählen, 16 Reihenfolge und 17 Auswahl. Die Lesetexte haben 117–193 Wörter. Die
Gespräche haben 200–260 Wörter, meist aufgeteilt in zwei Hörteile.

## Pfad

- **Sticky Kapitel-Leiste:** Beim Scrollen zeigt eine schmale Leiste unter der Statusleiste,
  in welchem Kapitel du gerade bist. Die Erkennung läuft über einen IntersectionObserver auf
  die Kapitel-Abschnitte. Antippen springt zum Kapitelanfang.
- **„Zur aktuellen Position“:** Ist der nächste fällige bzw. unerledigte Knoten außer Sicht,
  erscheint unten rechts ein runder Button, ebenfalls über einen IntersectionObserver erkannt.
  Antippen scrollt sanft zurück.

## Zufällige Erinnerungs-Pop-ups

Unabhängig vom Pfad-Scheduling (`src/engine/game.js`, `schedulePopup` / `pickPopup`):

- Wird ein Kapitel abgeschlossen, bekommt es mit 60 % Wahrscheinlichkeit einen Pop-up-Termin.
  Der Termin liegt zufällig 3–5 Tage später, auch über die Tageszeit gestreut. 40 % der
  Kapitel bekommen bewusst nie eines.
- Beim Öffnen des Pfads erscheint höchstens ein Pop-up pro Tag. Sind mehrere fällig, wird
  eines zufällig gewählt. Die anderen rutschen erneut 3–5 Tage zufällig nach hinten.
- **„Kurzer Test“** stellt 3 zufällige Übungen aus dem ganzen Kapitel. Die Intervalle bleiben
  unberührt, Streak und Tagesziel auch, es gibt nur Bonus-Federn. **„Nicht jetzt“** schließt
  das Pop-up folgenlos.

## Daten & Datenschutz

- Alles liegt in IndexedDB auf dem Gerät (Fallback: localStorage). Schrift (Quicksand), Icons
  (Lucide) und Vorlese-Audios sind mitgebündelt. Die App macht **keinen einzigen Netzwerk-Request** an Dritte, und
  der Service Worker cacht alles für die Offline-Nutzung.
- „Fortschritt zurücksetzen“ löscht Karten, Intervalle, Federn und Streak. Die Einstellungen bleiben.
- Erinnerungen kommen als lokale Mitteilung, ohne Push-Server. Die App prüft minütlich, solange sie
  offen oder im Hintergrund ist. Installierte PWAs auf Chromium nutzen zusätzlich Periodic Background
  Sync. Auf iOS gehen Mitteilungen erst ab 16.4 und nur für installierte PWAs. Die Einstellungen
  versprechen deshalb keine zuverlässige Zustellung.

## Abweichungen vom Design (bewusst)

- **Token-Kollision:** In den Tokens ist `--text-body` doppelt belegt (Farbe in `colors.css`,
  15 px in `typography.css`). Die Größe gewinnt, `color: var(--text-body)` war damit ungültig.
  Die Farbe heißt deshalb hier `--text-ink`.
- **Dark Mode:** Die Dark-Tokens lassen die Soft-Flächen hell. Für lesbaren Kontrast sind sie
  hier dunkel abgeleitet. Standard ist Light, wie abgenommen.
- **„Teilweise“-Feedback:** Das Design kennt nur richtig/daneben, die Bewertung hat aber drei Stufen.
  „Teilweise“ nutzt deshalb Amber-Töne aus den Tokens.
- **Einstellungen:** Zusätzlich gibt es die Zeile „Training“ (Zuhören / Lesen / Beides), weil das
  Onboarding „Du kannst das später jederzeit ändern“ verspricht. Die Erinnerungszeit bietet
  zusätzlich 21:00, passend zum Onboarding.
- Nach „kaum etwas“ geht eine Karte zurück auf Stufe 0 (1 Tag), wie im Auftrag. Die Annahme im
  Handoff wäre Stufe 1 gewesen.

## Struktur

```
src/engine/    Logik ohne UI: srs.js, answer.js, game.js (Herzen, Streak, Pfad, Sessions), content.js, storage.js
src/content/   Kapitel als JSON
src/ds/        Design-System-Komponenten (nachgebaut aus ds-components/)
src/screens/   Splash, Onboarding, Home/Pfad, Lektion, Intervall, Abschluss-Screens, Einstellungen
src/sw.js      Service Worker (Offline-Cache, lokale Erinnerung)
scripts/       Icons, Asset-Import, Content-Check
```
