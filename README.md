# YGO Trainer

Private Yu-Gi-Oh!-Trainings-App im Stil von Chess.com: Decks, Hand-Trainer, Combos, Puzzles, KI-Duell und Analyse.
Hauptgerät ist das **iPad** (Querformat). Die App läuft dort **vollständig offline**, ohne PC und ohne Server. Nur der optionale KI-Kommentar zu Replays braucht Internet (Claude API).
Zusätzlich läuft sie auf dem iPhone und im Browser (Expo Web).

> Nur für die private Nutzung. Kartendaten und -bilder stammen von der [YGOPRODeck-API](https://ygoprodeck.com/api-guide/).
> Yu-Gi-Oh! ist eine Marke von Konami, Kartenbilder sind urheberrechtlich geschützt. Die App wird **nicht** im App Store veröffentlicht.
> Die Regel-Engine (ocgcore, Kartenskripte) stammt von [Project Ignis/EDOPro](https://github.com/ProjectIgnis) und steht unter der AGPL-3.0, deshalb auch dieses Projekt (siehe [Lizenz](#lizenz-agpl-30)).

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

## Stand: Phase 4 – Puzzles ✅

Erreichbar über die Kachel **Puzzles**. Die Kachel zeigt an, wenn das Tagespuzzle noch offen ist.

| Bereich | Inhalt |
| --- | --- |
| Spielfeld | Alle Zonen beider Spieler wie auf der Spielmatte: Monster-, Zauber-/Fallen-, Extra-Monster- und Spielfeldzonen, Friedhof, Verbannt, Deck, Extra Deck, Hände und LP. Die Seite des Gegners ist gespiegelt. Verteidigungsposition wird quer gezeigt, verdeckte Karten als Rückseite (eigene halbtransparent), dazu ATK/DEF und Xyz-Material. |
| Bedienung | **Drag & Drop** mit Finger, Maus oder **Apple Pencil**: Die Zielzone leuchtet auf, danach erscheinen die passenden Aktionen (z. B. Monster aus der Hand auf eine Monsterzone → Normal-/Tribut-/Spezialbeschwörung oder Setzen; Monster auf ein gegnerisches Monster → Angriff; auf die Hand des Gegners → direkter Angriff). **Antippen** öffnet das Aktionsmenü, **lange drücken** die große Kartenansicht. Friedhof, Deck usw. antippen zeigt die Karten des Stapels. Materialien, Tribute und Ziele werden in einer Kartenauswahl gewählt. Kampfschaden wird mit ATK/DEF berechnet. |
| Lösen | Wie bei Chess.com: Jeder Zug wird mit den gespeicherten Lösungen verglichen. Falsche Züge werden nicht ausgeführt („Nicht der gesuchte Zug“). Antworten des Gegners (z. B. Ash Blossom) und Effektauflösungen laufen automatisch ab und werden erklärt. Dazu **Tipp** (erst die Karte, dann der ganze Zug), **Lösung zeigen** (Zug für Zug) und am Ende die Erklärung. |
| Mehrere Lösungen | Ein Puzzle kann mehrere Lösungen haben; die App folgt der Lösung, die du spielst. Züge, die als „Frei“ markiert sind (z. B. mehrere Angriffe), dürfen in beliebiger Reihenfolge kommen. |
| Rating | Elo-Wertung wie bei Chess.com-Puzzles: Startwert 1000. Gewertet wird nur der **erste Versuch**; der erste Fehler, Tipp oder „Lösung zeigen“ zählt als verloren. Die Puzzles haben ebenfalls ein Rating, das sich mit den Ergebnissen verschiebt. Fünf Schwierigkeitsstufen (Anfänger 600 … Experte 1800). Eigene Puzzles sind ungewertet (du kennst die Lösung). |
| Tagespuzzle | Jeden Tag ein Puzzle, bevorzugt eines, das du noch nicht gelöst hast. Gelöste Tagespuzzles in Folge ergeben die **Serie**. |
| Editor | Neues Puzzle → **Aufbau**: leere Zone oder Hand antippen und Karten über die Suche hinzufügen, Karten ziehen, antippen für Position, offen/verdeckt, „dem Spieler zeigen“ (Hand/verdeckte Karten des Gegners), ATK/DEF ändern oder Entfernen; dazu Titel, Aufgabe (z. B. „OTK“, „Durch Nibiru spielen“, „Ash Blossom umgehen“), Ausgangslage, Erklärung, Ziel (Gegner auf 0 LP oder komplette Zugfolge), Schwierigkeit und LP. → **Lösungen**: die Lösung auf dem Feld vorspielen. Züge des Gegners werden automatisch als „Auto“ markiert; eigene Folgezüge kann man ebenfalls auf „Auto“ stellen. Weitere Lösungen oder Varianten anlegen, Notizen zu Zügen. Die App prüft, ob das Puzzle lösbar ist. |
| Teilen | Puzzle-Code kopieren (Text, z. B. per Nachricht) und auf einem anderen Gerät über „Code einfügen“ importieren. |
| Beispiele | Fünf Beispiel-Puzzles: Raigeki-OTK, Fusion, Spiegelkraft umgehen, Sinneswandel (zwei Lösungen) und Ash Blossom umgehen. |

Der Lösungsabgleich prüft keine Regeln (z. B. Beschwörungsbedingungen oder Effekte), sondern nur, ob deine Züge zur gespeicherten Lösung passen. Mit **„Mit echten Regeln spielen“** lässt sich dieselbe Ausgangslage seit Phase 5 frei mit der Regel-Engine spielen (siehe unten).

## Stand: Phase 5 – KI-Duell mit Regel-Engine ✅

Erreichbar über die Kachel **KI-Duell**. Jede Aktion prüft die echte Regel-Engine von EDOPro; die KI läuft komplett auf dem Gerät.

| Bereich | Inhalt |
| --- | --- |
| Duell | Dein Deck gegen ein Deck der KI (eigene Decks oder die mitgelieferten Decks „Klassik: Magier“ und „Klassik: Drachen“). Wähle die KI-Stärke und wer beginnt (Zufall, du, KI). Es gelten die aktuellen Master-Regeln (MR5) mit 8000 LP. |
| Bedienung | Dasselbe Spielfeld wie bei den Puzzles. Eine Karte **antippen** zeigt nur die Aktionen, die nach den Regeln gerade erlaubt sind (beschwören, setzen, aktivieren, Position ändern, angreifen). **Ziehen** auf eine Zone wählt Aktion und Zone in einem Schritt, auf ein gegnerisches Monster oder die Hand des Gegners wird angegriffen. Ziele, Kosten, Materialien, Ja/Nein-Fragen, Positionen, Zahlen und Kartennamen fragt die Engine über Dialoge ab. Phasen wechseln über die Knöpfe rechts. |
| Ketten | Wie in EDOPro fragt die App nur, wenn eine Karte auf ein Ereignis reagieren kann (z. B. Ash Blossom auf eine Suche). Mit „bei jeder Gelegenheit fragen“ lassen sich auch schnelle Zauber/Fallen zu beliebigen Zeitpunkten aktivieren. |
| Protokoll | Alle Ereignisse auf Deutsch (Ziehen, Beschwörungen, Ketten, Annullierungen, Angriffe, Schaden). Gezogene und gesetzte Karten des Gegners bleiben verborgen. |
| KI Stufe 1 | Regelbasiert: beschwört die stärksten Monster, aktiviert Effekte, setzt Fallen, greift an, wenn es sich lohnt, und setzt Handtraps auf passende Auslöser ein. |
| KI Stufe 2 | Monte-Carlo-Suche (UCB1): Bei jeder Hauptphasen- und Kampfentscheidung spielt die KI die erlaubten Züge in Kopien des Duells bis zum Zugende durch (Stufe 1 als Spielweise), bewertet LP, Feld und Karten und wählt den besten Zug. Sie denkt dafür bis zu 1,5 Sekunden nach. Findet z. B. tödliche Züge wie Raigeki + Angriff. |
| Replays | Jedes Duell wird mit dem vollständigen Aktionsprotokoll lokal gespeichert (Startwert, Decks und alle Antworten an die Engine, damit lässt es sich exakt nachspielen). Ansehen, Statistik und KI-Kommentar unter **Analyse** (Phase 6). |
| Puzzles mit Regeln | Im Puzzle **„Mit echten Regeln spielen“**: Die Ausgangslage wird als EDOPro-Puzzle-Skript an die Engine übergeben (inkl. Xyz-Material und Extra-Monster-Zonen). Die KI spielt die Karten des Gegners (z. B. Ash Blossom). Gelöst ist das Puzzle, wenn der Gegner in diesem Zug auf 0 LP fällt. |

### Regel-Engine: WebAssembly statt nativem C++

Die Engine ist **ocgcore**, der Regelkern von EDOPro (Project Ignis), dazu die offiziellen **Lua-Kartenskripte**. Eingebunden ist sie als **WebAssembly** über das Paket `ocgcore-wasm`, nicht als natives C++-Modul:

- **Ein Build für alle Plattformen.** Derselbe Bundle (`scripts/build-engine.mjs` → `public/engine/engine.js`, ca. 1,3 MB inkl. WebAssembly) läuft im Browser in einem **Web Worker** und auf dem iPad in einer unsichtbaren **WebView** (`react-native-webview`). Hermes, die JavaScript-Engine von React Native, kann kein WebAssembly, die WebView (WKWebView) schon.
- **Eigener Thread.** Worker bzw. WebView laufen getrennt vom UI-Thread; die App schickt nur JSON-Nachrichten (`src/features/engine/types.ts`). Auch die KI rechnet dort, das Spielfeld bleibt flüssig.
- **Kein eigener C++-Build.** Ein natives Modul müsste ocgcore und Lua mit Xcode für iOS kompilieren (ohne Mac nur über EAS, schwer zu testen) und bräuchte zusätzlich eine Web-Variante. WebAssembly funktioniert ohne native Änderungen, sogar in Expo Go.
- **Nachteil:** etwas langsamer als nativ. Für ein Duell und die Suche der KI reicht es (eine Simulation dauert wenige Millisekunden).

Der Kern ist **deterministisch**: Startwert + Decks + Liste aller Antworten ergeben immer dasselbe Duell. Darauf beruhen Replays und die KI-Suche (die eine Kopie des Duells durch erneutes Abspielen erstellt).

### Lizenz (AGPL-3.0)

ocgcore, die Kartenskripte (CardScripts) und die Regel-Datenbank (BabelCDB) von Project Ignis stehen unter der **GNU AGPL-3.0**. Weil die App die Engine mitliefert und die Skripte ausführt, steht dieses Projekt ebenfalls unter der **AGPL-3.0-or-later** (`LICENSE`). Der Quellcode ist in diesem Repository öffentlich; ein Hinweis steht in der App unter Einstellungen → Regel-Engine. Das Paket `ocgcore-wasm` selbst steht unter MIT. WindBot (die KI von EDOPro) wird nicht verwendet; die KI ist eine eigene Implementierung in TypeScript.

### Daten und Offline-Betrieb

- **Regel-Datenbank** (`cards.cdb` aus BabelCDB, ca. 8 MB) und **Systemtexte** (`strings.conf`) werden beim ersten Duell oder auf Knopfdruck geladen und in SQLite gespeichert.
- **Kartenskripte** lädt die App nur für die Karten der beiden Decks (inkl. Skripte, die diese Skripte nachladen) und speichert sie ebenfalls. Danach funktioniert das Duell **offline**. Nur für neue Karten in einem Deck braucht es einmal Internet.
- Aktualisieren unter **Einstellungen → Regel-Engine** (Datenbank und alle gespeicherten Skripte, z. B. nach neuen Rulings oder Karten).
- Fehlt für eine Karte ein Skript (z. B. ganz neue Karten), zeigt das Duell einen Hinweis; die Karte hat dann keine Effekte.

Grenzen: Die Kartennamen und -texte im Duell kommen aus der YGOPRODeck-Datenbank der App; die Effekttexte in den Aktionsmenüs sind die (englischen) Texte aus EDOPro. Die KI spielt solide, aber nicht auf Turnierniveau: Stufe 2 schaut nur bis zum Ende des eigenen Zugs voraus.

## Stand: Phase 6 – Match-Analyse ✅

Erreichbar über die Kachel **Analyse**.

| Bereich | Inhalt |
| --- | --- |
| Statistik | Über alle Duelle gegen die KI: Anzahl, Siegquote, Bilanz, Ø Züge, Ø Schaden, aktuelle Serie, die letzten 20 Ergebnisse, Siegquote nach eigenem Deck, Deck der KI, KI-Stufe und wer beginnt, und wie die Duelle endeten. Puzzles zählen nicht mit. |
| Replay-Viewer | Die Regel-Engine spielt das gespeicherte Duell (Startwert + alle Antworten) nach. Das Spielfeld zeigt jeden Schritt; **Abspielen**, Schritt vor/zurück, Anfang/Ende und Sprung zu jedem Zug. Das Protokoll läuft mit (neue Einträge hervorgehoben, Antippen springt zur Stelle). **„Karten des Gegners: sichtbar“** deckt Hand und verdeckte Karten der KI auf. Karten antippen zeigt die Kartendetails, Stapel antippen ihren Inhalt. |
| Match-Analyse | Reiter **Analyse** im Replay: LP-Verlauf beider Spieler je Zug (Diagramm, Antippen zeigt die Werte und springt zum Zug, auch als Tabelle), Kennzahlen für dich und den Gegner (Schaden, Angriffe, Beschwörungen, gesetzte Karten, Aktivierungen und Annullierungen, gezogene Karten, LP-Kosten), größter Treffer und deine meistgenutzten Karten. |
| Engine-Analyse | Reiter **Engine-Analyse** (kostenlos, offline, ohne KI): Wie die Partie-Analyse bei Chess.com. Die Regel-Engine spielt bei jeder deiner Entscheidungen jede erlaubte Möglichkeit durch (die gewählte eingeschlossen, Kopien derselben Karte zählen einmal) und lässt danach die KI Stufe 1 beide Seiten bis zum Ende des Zugs spielen. Verglichen werden LP, Feld und Hand. Jede Entscheidung wird als **Bester Zug, Gut, Ungenauigkeit, Fehler** oder **Patzer** bewertet (Patzer: z. B. verpasster Lethal), dazu eine **Genauigkeit** in Prozent. Bei Fehlern steht der bessere Zug mit seinem Zugende daneben; „Im Replay zeigen“ springt zur Stelle. Das Ergebnis wird mit dem Replay gespeichert; Genauigkeit erscheint auch in der Replay-Liste und als Durchschnitt in der Statistik. Grenze: Die Engine schaut nur bis zum Ende des jeweiligen Zugs; längerfristige Pläne erkennt sie nicht. |
| KI-Kommentar | Reiter **KI-Kommentar**: Claude bekommt den Spielverlauf aus deiner Sicht, dein Deck und alle deine Entscheidungen, jeweils mit Spielfeld und allen Optionen, die die Engine erlaubt hat. Zurück kommen Gesamteinschätzung, Wendepunkte (antippen springt zum Zug), bis zu fünf bessere Züge und Tipps. Der Kommentar wird mit dem Replay gespeichert. |
| Prüfung durch die Engine | Claude darf bessere Züge nur als eine der erlaubten Optionen einer Entscheidung vorschlagen. Die App spielt jeden Vorschlag in der Regel-Engine nach: Ist er erlaubt, spielt die KI Stufe 1 beide Seiten bis zum Ende dieses Zugs, und die App vergleicht LP, Feld und Hand mit dem echten Duell („besser“, „ähnlich“, „schlechter“, „gewinnt das Duell“). Vorschläge, die zu keiner erlaubten Option passen, werden aussortiert. **Regelaussagen und Rulings im Text kann die KI falsch haben**; geprüft werden nur die Züge. „Im Replay zeigen“ springt zur Entscheidung. |

### KI-Kommentar einrichten (Claude API)

1. Auf <https://console.anthropic.com> ein Konto anlegen, Guthaben aufladen und unter *API Keys* einen Schlüssel erzeugen.
2. In der App: **Einstellungen → KI-Kommentar (Claude API)** → Schlüssel einfügen → **Prüfen und speichern**. Die App prüft den Schlüssel über die (kostenlose) Modellliste.
3. Optional **Modell wählen**: Die Liste kommt live von der Models API (nur Modelle mit strukturierter Ausgabe und adaptivem Denken). Ohne Auswahl nimmt die App das neueste Opus-Modell.

- **Speicherort des Schlüssels:** auf dem iPad im **iOS-Schlüsselbund** (`expo-secure-store`, nur auf diesem Gerät, nur entsperrt lesbar), nie in der Datenbank. Im Browser gibt es keinen Schlüsselbund; dort liegt er im lokalen Speicher dieses Browsers.
- **Datenfluss:** Die App ruft die Claude API direkt auf, ohne eigenen Server. Gesendet werden nur Spielverlauf, dein Deck, die Namen der Decks und deine Entscheidungen. Verdeckte Karten des Gegners bleiben verdeckt.
- **Kosten:** eine Anfrage pro Analyse über deinen Schlüssel, je nach Modell und Duell-Länge meist ein paar Cent. Verbrauch (Tokens) und Modell stehen unter dem Kommentar.
- **Technik:** offizielles TypeScript-SDK (`@anthropic-ai/sdk`), strukturierte Antwort (JSON-Schema über zod), adaptives Denken mit Aufwand `high`. Lehnt das Modell eine Anfrage aus Richtlinien-Gründen ab, wiederholt die API sie mit ihrem Standard-Ersatzmodell (`fallbacks: "default"`).

Hinweis zur iPad-App (TestFlight): Phase 6 bringt neue native Module (`expo-secure-store` für den Schlüsselbund, `react-native-svg` für das Diagramm). Dafür ist ein **neuer Build** nötig (`npm run build:prod`, dann `npm run submit:ios`). Die Web-Version aktualisiert sich wie bisher von selbst.

## Tech-Stack

- **React Native 0.88 + Expo SDK 58**, TypeScript, Expo Router (dateibasierte Navigation)
- **Expo Development Build** (`expo-dev-client`) statt Expo Go, damit später native Module möglich sind
- **Zustand** für den State, **expo-sqlite** für alle lokalen Daten (auf iOS eine Datei, im Browser OPFS)
- **expo-file-system** für den Bild-Cache, **expo-image** für die Anzeige
- **react-native-gesture-handler 3** und **Reanimated 4** für Gesten (Wischen in der Detailansicht, Drag & Drop auf dem Spielfeld, Trefferprüfung auf dem UI-Thread)
- **@anthropic-ai/sdk** (Claude API, strukturierte Antworten mit **zod**), **expo-secure-store** (iOS-Schlüsselbund), **react-native-svg** (Diagramme)
- **ocgcore** (EDOPro-Regelkern) als **WebAssembly** (`ocgcore-wasm`) im Web Worker bzw. in einer unsichtbaren WebView (`react-native-webview`), gebündelt mit **esbuild**
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
│  ├─ settings.tsx          Kartendaten-Update, Banlist, Sprache, Bild-Cache, Regel-Engine, Lizenzen
│  ├─ decks/                index (Liste) · [id] (Editor) · import
│  ├─ hand/                 index (Deckwahl) · [deckId] (Starthand, Tags, Statistik, Üben)
│  ├─ combos/               index (Liste) · [id] (Editor) · quiz/[id] · review (fällige Combos)
│  ├─ puzzles/              index (Rating, Tagespuzzle, Liste) · [id] (Lösen) · edit/[id] (Editor)
│  ├─ duel/                 index (Duell einrichten) · play (Duell gegen die KI)
│  └─ replays/              index (Analyse: Statistik, Replay-Liste) · [id] (Replay-Viewer mit Analyse und KI-Kommentar)
├─ components/              Wiederverwendbare UI
│  ├─ analysis/             Claude-API-Schlüssel und Modellwahl (Einstellungen)
│  ├─ cards/                CardImage, CardTile, CardListItem, CardDetailModal, CardSearchPanel, CardPickerModal, BanBadge
│  ├─ combos/               ComboQuiz, StepEditor, StepRow, ZoneBoard
│  ├─ duel/                 DuelBoard (Spielfeld, Drag & Drop), Layout/Trefferprüfung, Stapel-/Kartenauswahl, Aktions-Hook
│  ├─ engine/               Status der Regel-Daten, Dialoge für Anfragen der Engine
│  ├─ handtrainer/          Reiter des Hand-Trainers, Hand-Anzeige, Tag-Chips, Diagramme
│  ├─ replays/              LP-Diagramm, Match-Kennzahlen, Gesamtstatistik, Engine-Analyse, KI-Kommentar
│  └─ ui/                   Button, Chip, TextField, Screen, ProgressBar, Dialoge/Toasts
├─ db/                      SQLite-Verbindung und Migrationen
├─ features/                Fachlogik je Bereich
│  ├─ cards/                YGOPRODeck-Client, Sync, Repository/Suche, Bild-Cache, Labels (Deutsch)
│  ├─ decks/                Store, Repository, YDK/ydke-Parser, Import, Export, Validierung, Sortierung
│  ├─ handtrainer/          Tags, Wahrscheinlichkeit (exakt + Simulation), Hand-Bewertung, Übungsverlauf
│  ├─ combos/               Combo-Modell, Aktionen, Spielstand-Tracker, Quiz, SM-2-Wiederholung
│  ├─ duel/                 Duell-Zustand (alle Zonen), Züge, Kampfberechnung, Zug-Builder, Aktionen je Zone
│  ├─ puzzles/              Lösungsabgleich, Elo-Rating, Tagespuzzle/Serie, Beispiele, Puzzle-Codes, Repository/Store
│  ├─ engine/               Regel-Engine: core/ (Duell-Sitzung um ocgcore, Puzzle-Skripte), worker/ (läuft im Worker/WebView; Replays, Engine-Analyse),
│  │                        Host (Web Worker bzw. WebView), Kartendaten/Skripte laden, Duell-Store, Spielfeld-Abbildung, Protokoll
│  ├─ ai/                   KI: Stufe 1 (Regeln) und Stufe 2 (Monte-Carlo-Suche)
│  ├─ replays/              Replays speichern, Replay-Viewer (Store), Match- und Gesamtstatistik
│  ├─ analysis/             KI-Kommentar: Optionen je Entscheidung, Prompt, Claude-API-Aufruf, Schlüssel-Speicher
│  └─ settings/             Einstellungen
├─ lib/                     Rate-Limiter/Queue, Text-Helfer, Base64
├─ theme/                   Farben, Abstände, Kartenrahmen-Farben
└─ __tests__/               Jest-Tests (Parser, Validierung, Mapping, SQL-Suche, Rate-Limiter, Wahrscheinlichkeiten, Übungsauswertung, Combos/SM-2, Duell/Puzzles, Engine-Daten/Spielfeld/Protokoll, Analyse/Statistik, Migrationen)
scripts/                    Engine-Bundle bauen, Engine-Tests ausführen, Engine-Testdaten erzeugen
test/
├─ fixtures/                Beispiel-Antworten der YGOPRODeck-API (inkl. Karten der Beispiel-Puzzles); engine/: kleine Regel-Datenbank und Skripte
├─ engine/                  Tests der echten Engine (Node): Duelle, Puzzles, KI, Replays, Prüfung vorgeschlagener Züge
└─ e2e/                     Web-Smoketest mit Playwright (simulierte APIs inkl. Claude API: KI-Duell, Puzzles mit Regeln, Replay-Viewer, KI-Kommentar)
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
npm run test:engine  # Tests mit der echten Regel-Engine
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
| 4 ✅ | Puzzles: Spielfeld mit allen Zonen, Drag & Drop/Pencil, Puzzle-Editor, Lösungsvergleich, Rating, Tagespuzzle |
| 5 ✅ | Regel-Engine (ocgcore + Lua-Skripte als WebAssembly, AGPL) in eigenem Thread, KI in TypeScript (Stufe 1 regelbasiert, Stufe 2 Monte-Carlo-Suche), Gegner-Decks, Replays, Puzzles mit echten Regeln |
| 6 ✅ | Match-Analyse: Replay-Viewer, Statistiken, Engine-Analyse (ohne KI), KI-Kommentar über die Claude API (API-Key im iOS-Schlüsselbund, vorgeschlagene Züge von der Engine geprüft) |
