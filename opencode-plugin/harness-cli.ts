/**
 * Subprocess-Brücke zum Python-Harness-Kern (`harness/cli.py`).
 *
 * Aufruf:  $HARNESS_PYTHON (Default plattformabhängig: win32 "python",
 *          sonst "python3") -m harness.cli resolve
 *          --preset <name> --dir <configDir>
 * Erfolg:  JSON auf stdout, Exit 0.
 * Fehler:  Exit != 0 / Timeout / ungültiges stdout => null + geloggte Warnung.
 *
 * Stellschrauben (zur AUFRUFSIZEIT lesbar, damit Tests sie steuern können):
 *   HARNESS_PYTHON        Python-Binary (Default: win32 "python", sonst "python3")
 *   HARNESS_CONFIG_DIR    Config-Verzeichnis (Default <Projektroot>/harness_configs)
 *   HARNESS_CLI_TIMEOUT_MS  Timeout in ms (Default 10000)
 */

import { execFileSync } from "node:child_process"
import { appendFileSync } from "node:fs"
import { dirname, join } from "node:path"

// Diagnose (nur aktiv wenn HARNESS_CLI_DIAG_FILE gesetzt): loggt pro runCli()-Aufruf
// eine JSON-Zeile in die angegebene Datei. Ohne die Variable keinerlei Verhaltensänderung.
// DIAG_FILE wird ZUR LAUFZEIT gelesen (nicht beim Import), damit eine beim Prozessstart
// gesetzte Umgebungsvariable sicher greift.
function diagFile(): string | undefined {
  const f = process.env.HARNESS_CLI_DIAG_FILE
  return f && f.length > 0 ? f : undefined
}

function diagWrite(entry: unknown): void {
  const file = diagFile()
  if (!file) return
  try {
    appendFileSync(file, JSON.stringify(entry) + "\n", "utf-8")
  } catch {
    // Diagnose darf den Aufruf nie brechen.
  }
}

let runSeq = 0

export function runCli(args: string[]): string {
  const runId = `${process.pid}-${Date.now()}-${++runSeq}`
  const started = Date.now()
  const record: Record<string, unknown> = {
    runId,
    ts: new Date().toISOString(),
    pid: process.pid,
    pythonExecutable: pythonExecutable(),
    HARNESS_PYTHON: process.env.HARNESS_PYTHON,
    timeoutMs: timeoutMs(),
    cwd: PROJECT_ROOT,
    pythonPathEntries: (process.env.PATH ?? "").split(";").filter((p) => /python/i.test(p)),
    args,
    started,
  }
  try {
    const out = execFileSync(pythonExecutable(), ["-m", "harness.cli", ...args], {
      encoding: "utf-8",
      cwd: PROJECT_ROOT,
      timeout: timeoutMs(),
      stdio: ["ignore", "pipe", "pipe"],
    })
    const finished = Date.now()
    record.finished = finished
    record.durationMs = finished - started
    record.ok = true
    diagWrite(record)
    return out
  } catch (error) {
    const finished = Date.now()
    record.finished = finished
    record.durationMs = finished - started
    record.ok = false
    const e = error as {
      name?: string
      code?: string
      signal?: string
      status?: number
      stdout?: unknown
      stderr?: unknown
    }
    record.error = {
      name: e.name,
      code: e.code,
      signal: e.signal,
      status: e.status,
      stdout: e.stdout ?? null,
      stderr: e.stderr ?? null,
    }
    diagWrite(record)
    throw error
  }
}
import { fileURLToPath } from "node:url"

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = dirname(PLUGIN_DIR)

export interface HarnessParam {
  value: unknown
  enforced: boolean
}

export type ResolvedParams = Record<string, HarnessParam>

export function defaultPythonExecutable(platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? "python" : "python3"
}

export function pythonExecutable(): string {
  return process.env.HARNESS_PYTHON || defaultPythonExecutable()
}

export function defaultConfigDir(): string {
  return process.env.HARNESS_CONFIG_DIR || join(PROJECT_ROOT, "harness_configs")
}

export function timeoutMs(): number {
  const parsed = Number(process.env.HARNESS_CLI_TIMEOUT_MS)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10_000
}

export function warn(message: string): void {
  console.error(`[harness] ${message}`)
}

export function resolvePreset(presetName: string, configDir?: string): ResolvedParams | null {
  const dir = configDir ?? defaultConfigDir()
  let raw: string
  try {
    raw = runCli(["resolve", "--preset", presetName, "--dir", dir])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    warn(`resolve failed for preset '${presetName}': ${message}`)
    return null
  }
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`expected JSON object, got ${typeof parsed}`)
    }
    return parsed as ResolvedParams
  } catch (error) {
    warn(`resolve returned invalid JSON for preset '${presetName}': ${String(error)}`)
    return null
  }
}

/**
 * Listet alle verfügbaren Preset-Namen aus dem Config-Verzeichnis.
 * null = CLI/Parsing-Fehler (geloggt), NIE throw.
 */
export function listPresets(configDir?: string): string[] | null {
  const dir = configDir ?? defaultConfigDir()
  let raw: string
  try {
    raw = runCli(["list-presets", "--dir", dir])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    warn(`list-presets failed for dir '${dir}': ${message}`)
    return null
  }
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
      throw new Error(`expected JSON array of strings, got ${typeof parsed}`)
    }
    return parsed as string[]
  } catch (error) {
    warn(`list-presets returned invalid JSON for dir '${dir}': ${String(error)}`)
    return null
  }
}
