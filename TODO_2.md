# OpenCode Harness – Aktive offene Aufgaben

## Zweck und Verbindlichkeit

Diese Datei ist die einzige aktive Aufgabenliste. Sie enthält ausschließlich
Punkte, die noch nicht vollständig implementiert oder für die noch kein
belastbarer Nachweis gegen die geforderte OpenCode-/Provider-Laufzeit vorliegt.

Die Reihenfolge folgt der ursprünglichen Prioritätsstruktur P0 → P4:
P0 → P1 → P2 → P3 → P4. Automatisierte Unit-, Integrations- oder Mock-Tests
ersetzen keinen echten Runtime-Nachweis, wenn die Aufgabe ausdrücklich den
laufenden OpenCode-/Provider-/Agent-Flow betrifft.

Frühere parallele TODO-Dokumente sind aufgelöst und nicht Teil dieser aktiven
Liste. Die Implementierungs- und Testnachweise stehen in
[`STATUS.md`](./STATUS.md).

---

## Session-Nachweis 2026-09-01 (WSL-DEV-Umgebung)

Umgebungsgrenze dieser Session: In dieser WSL-Instanz sind **kein `bun` und kein
`go`** installiert und es gibt **keinen interaktiven Windows-TUI**. Damit sind
alle Nachweise, die einen gebauten/laufenden OpenCode-DEV-Prozess, die
Plugin-/TUI-/App-Suites oder einen interaktiven Ctrl+P-Flow erfordern, in
**dieser** Session nicht reproduzierbar (→ unten als „BLOCKIERT (Umgebung)"
markiert). Ein Live-OpenAI-kompatibler Provider (`omniroute`,
`127.0.0.1:20128`) ist erreichbar.

In dieser Session real verifiziert:

- [x] **Python-Suite grün:** `259 passed` (`.venv/bin/python -m pytest harness/ -q`).
- [x] **Phase 3 Kompositions-Backend (CLI-Runtime):** `edit-preset
  --add-harness/--remove-harness` auf einer echten Kopie von `harness_configs`:
  Remove und Add persistieren atomar, kein Duplikat bei Re-Add, unbekannter
  Harness wird mit Exit≠0 abgelehnt, Preset bleibt danach über `list-presets`
  (Switch-harness-Quelle) auswählbar. Backend + `harness-cli.ts`-Bridge
  (`editPresetComposition`) vorhanden; **native Go-TUI-Verdrahtung + Ctrl+P-Smoke
  offen** → BLOCKIERT (Umgebung).
- [x] **Bugfix:** `harness-cli.ts` `editPresetComposition` protokollierte im
  Fehlerfall einen kaputten, leeren Log ohne Fehlermeldung → jetzt
  `presetName` + `message`.
- [ ] **Provider-Reachability (nicht = Final Authority):** `omniroute` liefert
  HTTP 200 und akzeptiert `temperature=1.0`/`top_p=0.95`. Das ist **kein**
  Non-Override-Nachweis; der End-to-End-Beweis (OpenCode setzt 0.3 → enforced
  1.0 im finalen Request) braucht den laufenden OpenCode-Prozess → BLOCKIERT
  (Umgebung).

Alle übrigen P0–P4-Runtime-/Smoke-Punkte bleiben **offen**; ihr geforderter
echter Laufzeit-Nachweis ist in dieser Umgebung nicht erbringbar und wird nicht
als erledigt markiert.

---

## P0 – Final Authority

### Finalen Provider-/API-Request nachweisen — [x] VERIFIZIERT (2026-09-02, PASS)

Runtime-Nachweis erbracht (siehe `STATUS.md`, Eintrag 2026-09-02): echter
Headless-`opencode run` (bun 1.3.14), Provider = Capture-Proxy. Ohne Harness
enthält der finale HTTP-Body `temperature=0.3` (OpenCode-Agent-Vorwert), mit
aktivem „Qwen Deep Coding" `temperature=1.0` + `top_p=0.95` (enforced) — gleiches
Modell/Agent/Provider, einziger Unterschied das Harness. Statisch bestätigt:
`chat.params` ist die letzte Temperatur-Transformation vor `streamText`.

Die `enforced`-Semantik und der Request-Vorbereitungspfad sind im Code und in
automatisierten Tests vorhanden. Der reproduzierbare Nachweis im echten finalen
Provider-/API-Request liegt jetzt vor.

Integration:

- OpenCode setzt beispielsweise `temperature = 0.3`.
- Final Authority setzt `temperature = 1.0` mit `enforced: true`.
- Der tatsächlich abgesendete Provider-/API-Request enthält `temperature = 1.0`.

Edge Cases:

- Mehrere Harnesses mit widersprüchlichen Werten behalten den enforced-Wert.
- Ohne aktives Preset bleibt der bisherige OpenCode-Flow unverändert.
- Ein unbekanntes oder ungültiges Preset erzeugt keinen stillen Override.

---

## P1 – Long-Context / Context-Threshold

### Compaction in der echten Runtime nachweisen — [x] VERIFIZIERT (2026-09-05, PASS)

Der echte Runtime-Nachweis wurde mit `opencode/big-pickle` über OpenCode Zen
erbracht. OpenCode lud für das reale Modell ein Context Window von 200000 Tokens
aus seinem aktuellen ModelsDev-Katalog. Ein ausschließlich temporäres Harness
setzte den relativen Test-Threshold auf 7 % (absolute Grenze: 14000 Tokens).
Reale Provider-Usage von 10863 Tokens blieb ohne Compaction; reale Usage von
21157 Tokens löste `SessionCompaction.create/process`, einen echten
Big-Pickle-Summary-Turn und den synthetischen Continue-Turn mit anschließender
echter Modellantwort aus. Es wurden weder Usage noch Modelldefinition oder
Context Window künstlich injiziert. Details und Session-IDs stehen in
`STATUS.md`.

Der optionale echte Modellwechsel ist ebenfalls belegt. Ein temporäres Preset
mit `compaction_threshold = 0.09` wurde in der Session
`ses_f8d5de317ffezxt92iNuZdicQG` verwendet:

- `opencode/big-pickle`: Context Window `200000`, absolute Schwelle `18000`.
- `opencode/ling-3.0-flash-fin-free`: Context Window `262144`, absolute
  Schwelle `23592`.
- Im selben laufenden DEV-Server und derselben Session erfolgte der Wechsel
  Big Pickle → Ling. Lings reale Usage `19796` lag über der alten
  Big-Pickle-Schwelle, aber unter der neu berechneten Ling-Schwelle; korrekt
  entstand keine Compaction.
- Auch der Rückwechsel Ling → Big Pickle wurde ohne Serverneustart belegt.
  Reale Ling-Usage `19855` blieb unter `23592`; nach dem Wechsel wurde Big
  Pickles Schwelle `18000` neu angewendet und löste automatische Compaction,
  einen echten Big-Pickle-Summary-Turn und Continue aus.

Damit sind Context-Neulesung, absolute Neuberechnung und Stale-State-Ausschluss
in beiden Richtungen runtime-verifiziert. Die aus `TODO.md` verbliebenen leeren
FAIL-/INCONCLUSIVE-Kästchen waren nicht eingetretene Ergebnisbedingungen und
keine offenen Implementierungsaufgaben; sie wurden daher nicht als Aufgaben in
diese aktive Liste übernommen.

Integration:

- [x] Unterhalb des für den Runtime-Test erlaubten relativen Thresholds findet
  keine vorzeitige Compaction statt.
- [x] Beim Erreichen/Überschreiten des Thresholds wird die automatische
  Compaction tatsächlich ausgelöst.
- [x] `SessionCompaction.create/process`, Summary und Continue sind im laufenden
  DEV-Prozess und im gespeicherten Session-State sichtbar.
- [x] Echter Modellwechsel in beide Richtungen ohne Serverneustart ausgeführt;
  beide Modelle wurden real über OpenCode Zen verwendet.

Edge Cases:

- Zwei unterschiedliche Context-Window-Größen und die inklusive Grenze sind
  automatisiert abgedeckt; der zusätzliche echte Modellwechsel-Nachweis liegt
  nun ebenfalls vor.
- Ein unbekanntes Modell oder fehlendes Context Window löst laut vorhandener
  automatisierter Abdeckung keinen falschen Override oder unkontrollierten
  Compaction-Fehler aus.

---

## P1 – Testing / TDD

### Testausführung an den echten Agent-Loop binden

Der Test-Runner, die Entscheidungslogik und die Hooks sind vorhanden. Offen ist
der Nachweis im tatsächlichen Agent-Flow.

Integration:

- `After code changes` erkennt relevante Änderungen automatisch, startet die
  relevanten Tests und gibt das reale Ergebnis in den laufenden Agent-Flow
  zurück.
- `Before finishing` erkennt den Abschlussversuch und führt den Testlauf vor
  dem Abschluss automatisch aus.
- Ein roter oder fehlender Testlauf verhindert den erfolgreichen Abschluss im
  echten Agent-Flow.
- Ein fehlgeschlagener Testlauf führt zum vorgesehenen weiteren Agent-Flow und
  beendet ihn nicht fälschlich als erfolgreich.
- Ein echter Chat mit `GENERATE_TDD` enthält die TDD-Anweisung im gesendeten
  System-Prompt.

Edge Cases:

- `Run existing tests` generiert keine Tests.
- `Disabled` führt keinen automatischen Testlauf aus.
- `After every tool operation` bleibt optional.
- Ein Testlauf mit nicht null Exit-Code gilt nicht als bestanden.

### TDD-Reihenfolge technisch erzwingen

Offen bleibt der vollständige echte TDD-Flow:

- Tests werden technisch vor dem Implementierungscode erzeugt bzw. angelegt.
- Erwartete Edge Cases aus Spezifikation/Aufgabe werden im TDD-Flow
  berücksichtigt.
- Der Implementierungsschritt ist an den TDD-Flow angebunden.
- Der Ablauf `Anforderung → Tests → FAIL → Code → PASS` ist im echten
  Agent-Flow nachweisbar.

---

## P2 – Kombinationen

### Vollständige Runtime-Kombination nachweisen

Die Einzel- und Kombinationenlogik ist gegen die echten YAML-Dateien getestet.
Offen ist der vollständige Lauf in der echten OpenCode-/Provider-Runtime:

```text
Qwen + Final Authority + Long Context + Testing/TDD
```

Integration:

- Qwen Deep Coding ist auswählbar und aktiviert die erwartete Kombination.
- Qwen, Final Authority, Long Context und Testing/TDD funktionieren einzeln.
- Die drei generischen Harnesses funktionieren unabhängig voneinander und in
  beliebigen Kombinationen.
- Enforced-Werte bleiben im kombinierten finalen Provider-Request wirksam.
- Die Kombination funktioniert mit dem vorgesehenen Qwen-Zielmodell.

Edge Cases:

- Qwen-spezifische Regeln greifen nicht bei generischen Harnesses ohne Qwen.
- Ein einzelnes generisches Harness setzt kein anderes voraus.
- Ein Modell ohne passende Zuordnung erhält keinen unbeabsichtigten Qwen- oder
  sonstigen Harness-Override.

---

## P2 – Modellabhängige Preset-Zuordnung

### Standard-Preset live an das Modell binden

Die Zuordnungslogik ist implementiert und simuliert getestet. Offen ist der
Nachweis in der laufenden OpenCode-Session.

Integration:

- Modell A mit Standard-Preset und Modell B mit anderem Standard-Preset:
  Ein Modellwechsel aktualisiert das wirksame Preset und die Komposition live.
- Ein manuell gewähltes Preset überschreibt das Modell-Standard-Preset.
- Die Zuordnung bleibt mit dem session-bound `activePreset` und dem
  Welcome-Default konsistent.

Edge Cases:

- Ein Modell ohne Zuordnung aktiviert nicht versehentlich das vorherige
  Modell-Preset.
- Ein unbekanntes Preset verändert den Session-State nicht.
- Der Wechsel erfolgt ohne Neustart.

---

## P3 – UI- und Runtime-Abnahmen

### Inline Harness-Control und Web/Desktop

Die Komponenten, der Katalogfluss und die Tests/Bundles sind vorhanden. Offen
ist der echte Laufzeit-Smoke im vorgesehenen UI-Flow.

Integration:

- Das Harness-Control erscheint inline neben Model und Variant/Thinking.
- Web/Desktop bietet dieselbe Harness-/Preset-Auswahl.
- Globaler Katalog, Welcome-Default und session-bound State bleiben die einzige
  Datenquelle.
- Keine Harness-Policy-Logik wird doppelt im OpenCode-Core implementiert.

Edge Cases:

- Leerer oder fehlerhafter Katalog wird sichtbar und fail-safe behandelt.
- Ohne aktives Preset erscheint keine irreführende Auswahl oder Detailanzeige.

### Native Editor: Preset-Komposition bearbeiten

Die native Editor-Ansicht kann aktuell Harness-Parameter bearbeiten, aber die
Zusammensetzung eines Presets noch nicht vollständig verändern. Offen ist die
explizite Kompositionsbearbeitung mit anschließender Wiederverwendung über
`Switch harness`.

Integration:

- Ein bestehendes Preset kann in der nativen UI Harnesses hinzufügen und
  entfernen.
- Das Speichern persistiert die geänderte Preset-Datei atomar und zeigt Fehler
  sichtbar an.
- Das gespeicherte Preset ist anschließend über `Switch harness` auswählbar
  und verwendet genau die neue Harness-Komposition.

Edge Cases:

- Ein unbekannter Harness wird nicht gespeichert und verändert den bisherigen
  Preset-State nicht.
- Doppelte Harnesses werden nicht mehrfach hinzugefügt.
- Abbrechen verwirft Änderungen und lässt die bisherige Komposition bestehen.

### `/harness-set` als Plugin-only-Fallback live verifizieren

Command-, State-, `noReply`- und Kataloglogik sind automatisiert vorhanden.
Offen ist der vollständige echte OpenCode-Flow.

Integration:

- `/harness-set` erscheint im echten Slash-Command-Picker.
- Ein Preset wird dort ausgewählt, session-bound aktiviert und vom nächsten
  echten Chat-Request verwendet.
- Der finale Provider-Request enthält die erwarteten enforced-Werte.
- Die Ergebnisnachricht startet keinen unbeabsichtigten Agent-Run.
- Der vollständige reproduzierbare Lauf wird in `STATUS.md` dokumentiert.

Edge Cases:

- Leeres Argument listet die verfügbaren Presets verständlich auf.
- Unbekanntes Preset lässt ein vorhandenes aktives Preset unverändert.
- Ohne aktives Preset bleibt der bisherige OpenCode-Flow kompatibel.
- CLI-/Katalogfehler werden sichtbar und fail-safe behandelt.

### Native interaktive Regression

Automatisierte TUI-, Server- und SDK-Tests ersetzen keinen interaktiven
Windows-DEV-TUI-Smoke.

- Model-Auswahl funktioniert unverändert.
- Thinking-/Variant-Auswahl funktioniert unverändert.
- Harness-Auswahl und Harness-Wechsel funktionieren interaktiv.
- Kein Harness verhält sich wie zuvor.
- Enforced-Parameter erreichen weiterhin den echten Provider.
- OpenCode startet ohne Harness-bezogenen Fehler.
- Ergebnis und eventuelle Umgebungsabweichungen werden in `STATUS.md`
  dokumentiert.

---

## P4 – Vollständiger MVP-E2E und Abschluss

### Kombinierter MVP-Lauf

Der gesamte Ablauf muss in einem reproduzierbaren DEV-Lauf nachgewiesen werden:

```text
OpenCode DEV
→ Harness-Auswahl / Welcome-Screen
→ Session-Übernahme
→ Qwen Deep Coding
→ echter Agent-Loop
→ TDD / Tests
→ Compaction bei 80 %
→ finaler Provider-Request
```

Dabei müssen zusätzlich Preset-Änderung, `Ctrl+P → Switch harness`, Detail-UI,
Editor-/Preset-Komposition, Web/Desktop-Auswahl und der `/harness-set`-Fallback
weiter funktionieren.

### Abschlusskriterien

- Alle offenen P0–P3-Punkte sind durch reproduzierbare Runtime-Nachweise grün.
- Relevante Tests, Typechecks und der Produktionsbuild laufen erfolgreich.
- Windows-DEV-TUI ist interaktiv regressionsgetestet.
- Die produktive WSL-Installation bleibt unverändert.
- Es bleiben keine ungeplanten Core-Hacks oder doppelten Datenquellen übrig.
- Alle Nachweise, Einschränkungen und Umgebungsfehler stehen in `STATUS.md`.
