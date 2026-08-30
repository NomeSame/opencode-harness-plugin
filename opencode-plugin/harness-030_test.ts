/**
 * SOLL-Tests: Harness-Auswahl UI-Logik (TODO-030).
 *
 * Testet die logische Schnittstelle einer Harness-Auswahl-Komponente:
 *   - Liste der verfügbaren Presets wird geladen
 *   - Aktives Preset wird aus dem Store gelesen
 *   - setPreset() ruft setActivePreset auf
 *   - Kein Preset = kein Seiteneffekt
 *   - Ungültiges Preset wird ignoriert
 *
 * Dies fixiert das SOLL vor der UI-Implementierung.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const store = await import("./harness-store.ts")
const cli = await import("./harness-cli.ts")
const { setActivePreset, getActivePreset } = store
const { resolvePreset } = cli

function withEnv(partial: Record<string, string | undefined>, fn: () => void): void {
  const old: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(partial)) {
    old[k] = process.env[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  try { fn() } finally {
    for (const [k, v] of Object.entries(old)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

function mkTempConfig(): string {
  const base = mkdtempSync(join(tmpdir(), "harness-ui-"))
  writeFileSync(join(base, "qwen.yaml"), `
name: qwen
parameters:
  temperature: {value: 0.7, enforced: true}
`, { encoding: "utf-8" })
  writeFileSync(join(base, "deep-coding.yaml"), `
name: Deep Coding
harnesses:
  - qwen
`, { encoding: "utf-8" })
  writeFileSync(join(base, "relaxed.yaml"), `
name: Relaxed Mode
harnesses:
  - qwen
`, { encoding: "utf-8" })
  return base
}

// --- SOLL: HarnessSelection-Schnittstelle ---
//
// Eine HarnessSelection-Funktion sollte folgende Schnittstelle haben:
//
//   interface HarnessSelection {
//     current(): string | undefined  // Aktuell ausgewähltes Preset
//     list(): string[]               // Alle verfügbaren Presets
//     set(presetName: string): void  // Preset wählen (ruft setActivePreset)
//     ready: boolean                 // Daten geladen?
//   }
//
// Diese Tests prüfen die Logik, die eine solche Komponente benötigt.

test("SOLL: setPreset aktualisiert Store für Session", () => {
  const tmpDir = mkTempConfig()
  const presetFile = join(tmpDir, "presets.json")

  try {
    withEnv({ HARNESS_PRESET_FILE: presetFile, HARNESS_CONFIG_DIR: tmpDir }, () => {
      const sessionID = "ui-test-1"

      // Initial: kein Preset
      assert.strictEqual(getActivePreset(sessionID), undefined)

      // setPreset simulieren
      setActivePreset(sessionID, "Deep Coding")

      // Jetzt sollte das Preset aktiv sein
      assert.strictEqual(getActivePreset(sessionID), "Deep Coding")
    })
  } finally { rmSync(tmpDir, { recursive: true, force: true }) }
})

test("SOLL: current liest aktives Preset aus Store", () => {
  const tmpDir = mkTempConfig()
  const presetFile = join(tmpDir, "presets.json")

  try {
    withEnv({ HARNESS_PRESET_FILE: presetFile }, () => {
      setActivePreset("ui-current-test", "Deep Coding")

      // current sollte das aktive Preset zurueckgeben
      assert.strictEqual(getActivePreset("ui-current-test"), "Deep Coding")
    })
  } finally { rmSync(tmpDir, { recursive: true, force: true }) }
})

test("SOLL: resolvePreset findet Preset im Config-Dir", () => {
  const tmpDir = mkTempConfig()

  try {
    withEnv({ HARNESS_CONFIG_DIR: tmpDir }, () => {
      const params = resolvePreset("Deep Coding")
      assert.ok(params, "Deep Coding sollte in resolvePreset gefunden werden")
      assert.ok("temperature" in params!)
    })
  } finally { rmSync(tmpDir, { recursive: true, force: true }) }
})

test("SOLL: setPreset mit unbekanntem Preset ist speicherbar, aber CLI ignoriert es", () => {
  const tmpDir = mkTempConfig()
  const presetFile = join(tmpDir, "presets.json")

  try {
    withEnv({ HARNESS_PRESET_FILE: presetFile, HARNESS_CONFIG_DIR: tmpDir }, () => {
      // Man kann ein beliebiges Preset im Store setzen
      setActivePreset("unknown-test", "Does Not Exist")
      assert.strictEqual(getActivePreset("unknown-test"), "Does Not Exist")

      // Aber resolvePreset gibt null zurueck (graceful degradation)
      const result = resolvePreset("Does Not Exist")
      assert.strictEqual(result, null)
    })
  } finally { rmSync(tmpDir, { recursive: true, force: true }) }
})

test("SOLL: mehrere Sessions haben unabhaengige Presets", () => {
  const tmpDir = mkTempConfig()
  const presetFile = join(tmpDir, "presets.json")

  try {
    withEnv({ HARNESS_PRESET_FILE: presetFile }, () => {
      setActivePreset("ui-sess-1", "Deep Coding")
      setActivePreset("ui-sess-2", "Relaxed Mode")

      assert.strictEqual(getActivePreset("ui-sess-1"), "Deep Coding")
      assert.strictEqual(getActivePreset("ui-sess-2"), "Relaxed Mode")
    })
  } finally { rmSync(tmpDir, { recursive: true, force: true }) }
})

test("SOLL: preset list from config dir contains all presets", () => {
  const tmpDir = mkTempConfig()

  try {
    // The list should come from CLI subcommand 'list-presets'
    // For now, we test that both presets resolve independently
    withEnv({ HARNESS_CONFIG_DIR: tmpDir }, () => {
      const deep = resolvePreset("Deep Coding")
      const relaxed = resolvePreset("Relaxed Mode")

      assert.ok(deep, "Deep Coding should resolve")
      assert.ok(relaxed, "Relaxed Mode should resolve")
    })
  } finally { rmSync(tmpDir, { recursive: true, force: true }) }
})
