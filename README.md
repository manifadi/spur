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

## Inhalte erweitern

Jede JSON-Datei in `src/content/chapters/` ist ein Kapitel. Ein neues Kapitel ist einfach eine neue
Datei, der Code bleibt unverändert. Danach `npm run check:content`.

```jsonc
{
  "id": "zuhoeren-6", "order": 6, "title": "…", "track": "listen" /* | "read" | "mixed" */, "difficulty": 6,
  "lessons": [
    { "id": "z6-beispiel", "title": "Beispiel", "items": [
      { "id": "z6-beispiel-d", "type": "dialog", "title": "…",
        "text": "…"                                   /* oder "lines": [{ "who": "Name", "text": "…" }] */,
        "questions": [
          { "id": "q1", "prompt": "Frage?", "answers": [["Jonas", "Bruder"], ["30", "dreißig"]],
            "solution": "Ihr Bruder Jonas, 30.", "quote": "„… Zitat aus dem Dialog …“" }
        ] },
      { "id": "l6-text-t", "type": "text", "title": "…", "topic": "Kurzes Thema",
        "paragraphs": ["…", "…"], "keyPoints": ["…", "…", "…", "…"] }
    ] },
    { "id": "z6-checkpoint", "type": "checkpoint", "title": "Checkpoint" }
  ]
}
```

`answers` ist eine Liste von Gruppen. Jede Gruppe ist ein Detail, das genannt werden soll, mit
gleichwertigen Schreibweisen. `order` legt die Reihenfolge innerhalb der Spur fest.

Mitgeliefert: 5 Kapitel Zuhören, 5 Kapitel Lesen und 1 gemischtes Kapitel. Das sind 50 Lektionen
mit 120 Karten.

## Daten & Datenschutz

- Alles liegt in IndexedDB auf dem Gerät (Fallback: localStorage). Schrift (Quicksand) und Icons
  (Lucide) sind mitgebündelt. Die App macht **keinen einzigen Netzwerk-Request** an Dritte, und
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
