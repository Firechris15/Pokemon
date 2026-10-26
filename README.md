# YGO Trainer

Private Yu-Gi-Oh!-Trainings-App im Stil von Chess.com: Decks, Hand-Trainer, Combos, Puzzles, KI-Duell und Analyse.
Hauptgerät ist das **iPad** (Querformat). Die App läuft dort **vollständig offline**, ohne PC und ohne Server.
Zusätzlich läuft sie auf dem iPhone und im Browser (Expo Web).

> Nur für die private Nutzung. Kartendaten und -bilder stammen von der [YGOPRODeck-API](https://ygoprodeck.com/api-guide/).
> Yu-Gi-Oh! ist eine Marke von Konami, Kartenbilder sind urheberrechtlich geschützt. Die App wird **nicht** im App Store veröffentlicht.

## Stand: Phase 1 – Deck-Verwaltung ✅

| Bereich | Umgesetzt |
| --- | --- |
| Kartendaten | Alle Karten von YGOPRODeck (Englisch + deutsche Texte über `language=de`, Fallback Englisch), Banlist TCG/OCG, lokal in SQLite. Der Update-Button prüft zuerst `checkDBVer.php` und lädt nur bei neuer Version alles neu, sonst nur die Banlist. |
| Bild-Cache | Jedes Bild wird **einmal** geladen (Rate-Limit 8 Anfragen/s, YGOPRODeck erlaubt 20) und danach nur noch lokal angezeigt. Optional: Bilder aller Decks oder alle Vorschaubilder vorab laden. |
| Karten-Anzeige | Überall Bild + Name. Antippen öffnet die große Detailansicht (Bild, kompletter Text DE/EN, Werte, Archetyp, Banlist). Schließen durch Tippen daneben, Wischen nach unten, X oder Esc. Wischen nach links/rechts blättert durch die Liste. |
| Kartensuche | Name (DE/EN, ohne Rücksicht auf Groß-/Kleinschreibung und Umlaute), Passcode, optional Kartentext; Filter für Kartenart, Monsterart (Main/Extra, Effekt, Fusion, Synchro, Xyz, Link, Pendel, Empfänger …), Attribut, Stufe/Rang/Link, Monstertyp, Zauber-/Fallentyp, Archetyp, „nur erlaubte“. |
| Decks | Mehrere Decks anlegen, bearbeiten, umbenennen, duplizieren, löschen. Main/Extra/Side mit Validierung (40–60 / max. 15 / max. 15, max. 3 Kopien über alle Bereiche, aktuelle Banlist, falsch einsortierte Karten). |
| Import | `.ydk`-Datei aus der Dateien-App, Einfügen aus der Zwischenablage, YDK-Text, `ydke://`-Links, Passcode-Listen und Namenslisten („3 Ash Blossom & Joyous Spring“, auch deutsche Namen). Alternative Artworks werden erkannt. |
| Export | `.ydk` über das Teilen-Menü (Dateien, AirDrop …) und `ydke://`-Link in die Zwischenablage. |
| iPad | Deck-Editor im Querformat zweispaltig (Deck links, Suche rechts); auf dem iPhone umschaltbar. Apple Pencil funktioniert wie ein Finger. |

## Stand: Phase 2 – Opening-/Hand-Trainer ✅

Erreichbar über die Kachel **Hand-Trainer** oder im Deck-Editor über das Hand-Symbol. Vier Reiter pro Deck:

| Reiter | Inhalt |
| --- | --- |
| Starthand | Zufällige Starthand als Erster (5 Karten) oder Zweiter (5 + 1 gezogen), weitere Karten ziehen, Auswertung nach deinen Tags. |
| Tags | Jede Karte als **Starter, Extender, Handtrap, Brick oder Board-Breaker** markieren (auch mehrfach). Starter-Rangliste per Pfeiltasten. Ein Knopf schlägt bekannte Handtraps und Board-Breaker vor. Tags gelten pro Deck und werden beim Duplizieren mitkopiert. |
| Statistik | Exakte Werte (multivariat hypergeometrisch) für Erster und Zweiter, zur Kontrolle eine Simulation mit 100.000 Händen: spielbare Hand, mind. 1/2 Starter, Starter + Extender, Handtrap, Starter + Handtrap, Board-Breaker, Bricks. Dazu die Verteilung der Starter-Anzahl, Tag-Übersicht, Einzelkarten-Tabelle (1–3 Kopien) und ein freier Rechner. Kombinationen wie „Starter + Handtrap“ zählen nur mit zwei verschiedenen Karten. |
| Üben | Die App zeigt eine Hand: „spielbar/nicht spielbar?“, dann „mit welcher Karte startest du?“. Danach die Auswertung mit Erklärung nach deinen Tags und deiner Starter-Rangliste. Sitzungs- und Gesamtquote werden gespeichert. |

Regel für „spielbar“: als Erster mindestens 1 Starter, als Zweiter mindestens 1 Starter oder 1 Board-Breaker.

## Stand: Phase 3 – Combo-Trainer ✅

Erreichbar über die Kachel **Combos**. Die Kachel zeigt an, wie viele Combos zur Wiederholung fällig sind.

| Bereich | Inhalt |
| --- | --- |
| Combo erfassen | Name, zugehöriges Deck, Starthand, dann Schritt für Schritt: **Karte + Aktion** (Normal-/Spezial-/Link-/Xyz-/Synchro-/Fusions-/Ritualbeschwörung, Effekt aktivieren, Suchen, Friedhof, Verbannen, Ziehen, Anhängen …), beteiligte Karten (z. B. gesuchte Karte, Materialien) und eine Erklärung. Am Ende das Endboard („Feld übernehmen“ übernimmt den berechneten Stand). |
| Spielstand | Die App verfolgt automatisch, welche Karten nach jedem Schritt in Hand, Feld, Xyz-Material, Friedhof und Verbannt liegen. Wohin die Karten wandern, ist pro Aktion vorbelegt und pro Schritt änderbar. |
| Kartenauswahl | Ein gemeinsamer Auswahl-Dialog: Karten aus dem aktuellen Spielstand, Main und Extra Deck oder über die Suche. Mehrfachauswahl für Starthand, Materialien und Endboard. |
| Quiz | Zeigt den Spielstand und fragt „Was ist der nächste Schritt?“, entweder **Multiple Choice** (passende Ablenker aus derselben Combo und vom Spielfeld) oder **frei** (Karte + Aktion wählen). Fehler werden markiert, die richtige Lösung wird mit deiner Erklärung gezeigt. |
| Wiederholung | **Spaced Repetition (SM-2)** pro Combo: Fehlerfreie Durchgänge kommen nach 1 Tag, dann 3 Tagen, danach in wachsenden Abständen wieder. Ein misslungener Durchgang kommt nach 10 Minuten wieder, und die Combo erscheint künftig öfter. Pro Schritt wird gezählt, wie oft er falsch war. „Fällige wiederholen“ arbeitet alle fälligen Combos nacheinander ab. |

## Tech-Stack

- **React Native 0.88 + Expo SDK 58**, TypeScript, Expo Router (dateibasierte Navigation)
- **Expo Development Build** (`expo-dev-client`) statt Expo Go, damit später native Module (Regel-Engine) möglich sind
- **Zustand** für den State, **expo-sqlite** für alle lokalen Daten (auf iOS eine Datei, im Browser OPFS)
- **expo-file-system** für den Bild-Cache, **expo-image** für die Anzeige
- **react-native-gesture-handler 3** und **Reanimated 4** für Gesten (Wischen in der Detailansicht, später Drag & Drop auf dem Spielfeld)
- **EAS Build + EAS Submit** für iOS-Builds in der Cloud und die Installation über TestFlight, ohne Mac

## Ordnerstruktur

```
app.json · eas.json · metro.config.js · eslint.config.js
.github/workflows/web.yml   Prüfen + Web-Version auf GitHub Pages veröffentlichen
.devcontainer/              Entwicklungsumgebung für GitHub Codespaces
assets/images/              App-Icon, Splash, Favicon
src/
├─ app/                     Screens (Expo Router)
│  ├─ _layout.tsx           Root: DB-Initialisierung, Theme, globale Karten-Detailansicht und Dialoge
│  ├─ index.tsx             Startseite mit Kacheln
│  ├─ cards.tsx             Kartendatenbank durchsuchen
│  ├─ settings.tsx          Kartendaten-Update, Banlist, Sprache, Bild-Cache
│  ├─ decks/                index (Liste) · [id] (Editor) · import
│  ├─ hand/                 index (Deckwahl) · [deckId] (Starthand, Tags, Statistik, Üben)
│  └─ combos/               index (Liste) · [id] (Editor) · quiz/[id] · review (fällige Combos)
├─ components/              Wiederverwendbare UI
│  ├─ cards/                CardImage, CardTile, CardListItem, CardDetailModal, CardSearchPanel, CardPickerModal, BanBadge
│  ├─ combos/               ComboQuiz, StepEditor, StepRow, ZoneBoard
│  ├─ handtrainer/          Reiter des Hand-Trainers, Hand-Anzeige, Tag-Chips, Diagramme
│  └─ ui/                   Button, Chip, TextField, Screen, ProgressBar, Dialoge/Toasts
├─ db/                      SQLite-Verbindung und Migrationen
├─ features/                Fachlogik je Bereich (später auch handtrainer/, combos/, puzzles/, engine/, ai/, analysis/)
│  ├─ cards/                YGOPRODeck-Client, Sync, Repository/Suche, Bild-Cache, Labels (Deutsch)
│  ├─ decks/                Store, Repository, YDK/ydke-Parser, Import, Export, Validierung, Sortierung
│  ├─ handtrainer/          Tags, Wahrscheinlichkeit (exakt + Simulation), Hand-Bewertung, Übungsverlauf
│  ├─ combos/               Combo-Modell, Aktionen, Spielstand-Tracker, Quiz, SM-2-Wiederholung
│  └─ settings/             Einstellungen
├─ lib/                     Rate-Limiter/Queue, Text-Helfer, Base64
├─ theme/                   Farben, Abstände, Kartenrahmen-Farben
└─ __tests__/               Jest-Tests (Parser, Validierung, Mapping, SQL-Suche, Rate-Limiter, Wahrscheinlichkeiten, Übungsauswertung, Combos/SM-2, Migrationen)
test/
├─ fixtures/                Beispiel-Antworten der YGOPRODeck-API
└─ e2e/                     Web-Smoketest mit Playwright (simulierte API)
```

Plattformspezifischer Code liegt in `*.web.ts`-Dateien (z. B. `imageBackend.web.ts`: Cache Storage statt Dateisystem).

## Auf dem iPad testen (ohne PC)

### A) Web-Version in Safari (am einfachsten)

Bei jeder Änderung an `main` baut GitHub die Browser-Version automatisch, prüft sie vorher mit Typecheck, Lint und Tests und veröffentlicht sie über GitHub Pages (`.github/workflows/web.yml`).

1. **Einmalig:** Im Repo auf GitHub → *Settings* → *Pages* → bei *Build and deployment* unter *Source* „**GitHub Actions**“ wählen.
2. Danach startet der Bau bei jeder Änderung an `main`. Manuell geht es über *Actions* → *Web-Version* → *Run workflow*. Ein Durchlauf dauert ein paar Minuten.
3. In Safari öffnen: **https://firechris15.github.io/Pokemon/**. Über Teilen → „Zum Home-Bildschirm“ wirkt sie wie eine App.
4. In der App auf „Herunterladen“ tippen (Kartendatenbank). Decks, Tags und Combos werden im Browser gespeichert.

Hinweise: Safari kann Website-Daten löschen, wenn eine Seite 7 Tage nicht benutzt wurde. Über den Home-Bildschirm gestartet gilt das nicht, deshalb lieber so öffnen. Die Seite ist öffentlich erreichbar, die Daten bleiben aber nur in deinem Browser. Kartenbilder lädt dein Browser direkt von YGOPRODeck. Die Web-Version ist zum Ausprobieren gedacht. Für die echte iPad-App (Apple Pencil, Dateien-App, Offline-Speicher im App-Container) ist TestFlight der Weg.

### B) Native App in Expo Go über GitHub Codespaces

Das ist näher an der fertigen App, aber aufwendiger. Der Entwicklungsserver läuft in einer Cloud-Umgebung im Browser.

1. Die App **Expo Go** aus dem App Store installieren und dich darin mit einem kostenlosen Expo-Konto anmelden (<https://expo.dev/signup>).
2. Auf GitHub im Repo: *Code* → *Codespaces* → *Create codespace on main*. Die Umgebung (`.devcontainer/`) installiert alles automatisch.
3. Im Terminal des Codespace:

   ```bash
   npx expo login          # mit demselben Expo-Konto
   npm run start:tunnel    # = expo start --go --tunnel
   ```

4. In Expo Go erscheint das Projekt unter „Development servers“. Alternativ den angezeigten `exp://…`-Link in Safari öffnen.

## Lokales Setup (PC, Windows/macOS/Linux)

Voraussetzungen: [Node.js 22 LTS](https://nodejs.org) und Git.

```bash
git clone <repo-url> && cd <repo>
npm install
npm run web          # App im Browser starten (http://localhost:8081)
npm test             # Unit-Tests
npm run typecheck    # TypeScript
npm run lint         # ESLint
npm run test:e2e     # Web-Smoketest (braucht Playwright: npx playwright install chromium)
```

Neue Pakete immer mit `npx expo install <paket>` hinzufügen, damit die Versionen zum SDK passen.

## iPad-Installation per TestFlight (ohne Mac)

Die iOS-App wird in der Expo-Cloud (EAS Build) gebaut und mit EAS Submit zu App Store Connect hochgeladen. Danach installierst du sie auf dem iPad über die TestFlight-App. Es wird nichts im App Store veröffentlicht.

### Einmalig vorbereiten

1. **Apple Developer Program** beitreten (99 €/Jahr, nötig für TestFlight): <https://developer.apple.com/programs/>
2. Kostenloses **Expo-Konto** anlegen: <https://expo.dev/signup>
3. Auf dem PC im Projektordner:

   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest init        # legt das EAS-Projekt an und trägt die projectId in app.json ein
   ```

4. Optional: In `app.json` den `ios.bundleIdentifier` (`com.firechris15.ygotrainer`) auf eine eigene, eindeutige ID ändern.

### Build bauen und zu TestFlight hochladen

```bash
npm run build:prod      # = eas build --profile production --platform ios
```

Beim ersten Build fragt EAS nach deinem Apple-Login und erstellt Zertifikat und Provisioning-Profil automatisch. Einfach die Standardvorschläge bestätigen. Der Build dauert etwa 15–30 Minuten.

```bash
npm run submit:ios      # = eas submit --platform ios --profile production --latest
```

`eas submit` lädt den letzten Build zu App Store Connect hoch und legt die App dort beim ersten Mal an. Ist der Name „YGO Trainer“ schon vergeben, einfach einen anderen wählen, z. B. „YGO Trainer Privat“. Beide Schritte in einem geht mit `npx eas-cli build -p ios --profile production --auto-submit`.

Die Exportkontroll-Frage ist bereits beantwortet (`ITSAppUsesNonExemptEncryption: false` in `app.json`).

### Auf dem iPad installieren

1. In [App Store Connect](https://appstoreconnect.apple.com) → *Apps* → YGO Trainer → **TestFlight** → unter *Interne Tests* eine Gruppe anlegen und dich selbst hinzufügen. Für interne Tests ist keine Beta-Prüfung durch Apple nötig.
2. Die App **TestFlight** aus dem App Store auf dem iPad installieren und mit derselben Apple-ID anmelden.
3. „YGO Trainer“ erscheint in TestFlight → **Installieren**.
4. Beim ersten Start im WLAN auf **„Herunterladen“** tippen (Kartendatenbank, einmalig ca. 30–60 MB). Danach funktioniert alles offline.

Hinweise:

- TestFlight-Builds laufen nach **90 Tagen** ab. Dann einfach neu bauen und hochladen (die Build-Nummer zählt EAS automatisch hoch). Deine Daten bleiben beim Update erhalten.
- Jede neue Phase bzw. Code-Änderung braucht einen neuen Build (`npm run build:prod` + `npm run submit:ios`).
- Deine Daten (Decks, Kartendatenbank, Bilder) liegen nur in der App auf dem iPad. Wird die App gelöscht, sind sie weg. Decks lassen sich vorher als `.ydk` exportieren.

### Schnell ausprobieren mit Expo Go am PC (ohne Apple-Entwicklerkonto)

Zum Anschauen reicht die kostenlose App **Expo Go** aus dem App Store. Alle Module von Phase 1 sind darin enthalten. PC und iPad müssen im selben WLAN sein:

```bash
npm install
npm run start:go     # = expo start --go, zeigt einen QR-Code
```

Den QR-Code mit der iPad-Kamera scannen, dann öffnet sich die App in Expo Go. Das funktioniert nur, solange der PC läuft, und Expo Go unterstützt immer nur das aktuelle SDK (hier 58). Für die dauerhafte Offline-Nutzung ist TestFlight der richtige Weg.

### Optional: Development Build zum Entwickeln

Für Live-Reload während der Entwicklung (dafür muss ein PC im selben WLAN laufen):

```bash
npx eas-cli device:create        # iPad registrieren (Profil über Link/QR-Code auf dem iPad installieren)
npm run build:dev                # Development Build (internal distribution)
npm start                        # Metro auf dem PC starten, dann die App auf dem iPad öffnen
```

Das Profil `preview` erzeugt einen normalen, eigenständigen Build für registrierte Geräte (Ad-hoc) als Alternative zu TestFlight.

## Kartendaten und YGOPRODeck-Richtlinien

- Die komplette Kartendatenbank wird **nur auf Knopfdruck** geladen und lokal gespeichert, nicht bei jedem App-Start.
- `checkDBVer.php` verhindert unnötige Downloads. Ist die Version unverändert, werden nur die Banlists (`banlist=tcg/ocg`) abgeglichen.
- Alle Anfragen laufen über einen gemeinsamen Rate-Limiter (8/s, Limit der API: 20/s).
- Kartenbilder werden **nicht dauerhaft gehotlinkt**: Jedes Bild wird einmal heruntergeladen und in `Documents/card-images/` gespeichert (iOS löscht diesen Ordner nicht von selbst). Im Browser landen die Bilder im Cache Storage.

## Browser-Version (Expo Web)

`npm run web` startet die App im Browser. SQLite läuft dort als WebAssembly (OPFS). Die App nutzt nur die asynchrone SQLite-API und braucht deshalb keine besonderen Server-Header. Der Dev-Server setzt `Cross-Origin-Embedder-Policy`/`-Opener-Policy` trotzdem (`metro.config.js`), damit auch synchrone Aufrufe möglich wären.
Statisch gebaut wird mit `npm run export:web` (→ `dist/`). Online steht die Web-Version automatisch über GitHub Pages bereit (siehe oben).

## Roadmap

| Phase | Inhalt |
| --- | --- |
| 1 ✅ | Deck-Verwaltung, Kartendaten, Bild-Cache, Karten-Detailansicht |
| 2 ✅ | Opening-/Hand-Trainer: Starthände, Karten-Tags (Starter, Extender, Handtrap, Brick, Board-Breaker), hypergeometrische Statistik + Simulation, Übungsmodus |
| 3 ✅ | Combo-Trainer: Combo-Routen erfassen, Quiz (Multiple Choice / freie Auswahl), Spaced Repetition |
| 4 | Puzzles: Spielfeld mit allen Zonen, Drag & Drop/Pencil, Puzzle-Editor, Lösungsvergleich, Rating, Tagespuzzle |
| 5 | Regel-Engine (ocgcore + Lua-Skripte, nativ oder WebAssembly, AGPL beachten) in eigenem Thread, eigene KI in TypeScript (regelbasiert + Monte Carlo), Replays |
| 6 | Match-Analyse: Replay-Viewer, Statistiken, KI-Kommentar über die Claude API (API-Key im iOS-Schlüsselbund) |
