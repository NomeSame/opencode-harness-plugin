/**
 * Session-ID → aktives Preset-Namen Mapping, persistiert als JSON-Datei.
 *
 * Pfad (zur AUFRUFSIZEIT lesbar, damit Tests ihn steuern können):
 *   $HARNESS_PRESET_FILE
 *   oder ~/.config/opencode-harness/active-presets.json
 * Format: { "<sessionID>": "<presetName>" }
 *
 * YAGNI: keine DB, keine neue Dependency — das ist eine Konfigurationsdatei.
 * Alle Lesezugriffe sind fehlertolerant: fehlende/kaputte Datei => leer.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

type ActivePresetMap = Record<string, string>

export function presetFilePath(): string {
  return (
    process.env.HARNESS_PRESET_FILE ||
    join(homedir(), ".config", "opencode-harness", "active-presets.json")
  )
}

function readMap(file: string): ActivePresetMap {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf-8"))
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as ActivePresetMap
    }
  } catch {
    // fehlende oder kaputte Datei => leeres Mapping
  }
  return {}
}

export function getActivePreset(sessionID: string): string | undefined {
  const entry = readMap(presetFilePath())[sessionID]
  return typeof entry === "string" ? entry : undefined
}

export function setActivePreset(sessionID: string, presetName: string): void {
  const file = presetFilePath()
  mkdirSync(dirname(file), { recursive: true })
  const map = readMap(file)
  map[sessionID] = presetName
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify(map, null, 2), { encoding: "utf-8" })
  renameSync(tmp, file)
}

export function clearActivePreset(sessionID: string): void {
  const file = presetFilePath()
  const map = readMap(file)
  if (!(sessionID in map)) return
  delete map[sessionID]
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify(map, null, 2), { encoding: "utf-8" })
  renameSync(tmp, file)
}
