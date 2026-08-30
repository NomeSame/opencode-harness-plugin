/**
 * SOLL-Tests für TODO-038/039: `/harness-set` als sichtbaren, gut auffindbaren
 * OpenCode-Command mit echter Preset-Auflistung nutzbar machen.
 *
 * SOLL:
 *   harness-cli.ts
 *     - listPresets(configDir?) -> string[] | null (null = CLI/Parse-Fehler,
 *       geloggte Warnung via console.error, NIE throw). Liste kommt aus der
 *       echten Harness-Config (kein hartkodierter Preset-Name im TS-Code).
 *
 *   harness-plugin.ts "command.execute.before" (command === "harness-set")
 *     - Leeres/ganz-Whitespace-Argument -> listet vorhandene Presets auf,
 *       ruft setActivePreset NICHT auf, schreibt eine verstaendliche
 *       Nachricht in output.parts.
 *     - Bekanntes Preset -> setActivePreset wird aufgerufen, output.parts
 *       enthaelt eine Erfolgsmeldung.
 *     - Unbekanntes Preset (Preset-Liste ist bekannt) -> setActivePreset
 *       wird NICHT aufgerufen, ein zuvor aktives Preset bleibt unveraendert,
 *       output.parts enthaelt eine Fehlermeldung mit den verfuegbaren Presets.
 *     - Preset-Liste nicht ermittelbar (CLI-Fehler) -> fail-open, bisheriges
 *       Verhalten (setActivePreset wird dennoch aufgerufen).
 *
 *   .opencode/command/harness-set.md registriert den Command bei OpenCode
 *   (Name, Beschreibung, $ARGUMENTS-Hinweis) ohne Aenderung an Opencode_Dev/.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const store = await import("./harness-store.ts")
const cli = await import("./harness-cli.ts")
const pluginMod = await import("./harness-plugin.ts")
const HarnessPlugin = pluginMod.default

function makeTmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

function withEnv(t: test.TestContext, vars: Record<string, string | undefined>) {
  const saved: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  t.after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })
}

function makeConfigDir(base: string): string {
  const dir = join(base, "configs")
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "qwen.yaml"), "name: qwen\nparameters:\n  temperature: {value: 1.0, enforced: true}\n", { encoding: "utf-8", flag: "wx" })
  writeFileSync(join(dir, "alpha.yaml"), "name: Alpha Preset\nharnesses:\n  - qwen\n", { encoding: "utf-8", flag: "wx" })
  writeFileSync(join(dir, "beta.yaml"), "name: Beta Preset\nharnesses:\n  - qwen\n", { encoding: "utf-8", flag: "wx" })
  return dir
}

function captureConsoleError(t: test.TestContext) {
  const lines: string[] = []
  const original = console.error
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "))
  }
  t.after(() => {
    console.error = original
  })
  return lines
}

// ---------------------------------------------------------------------------
// A: harness-cli.listPresets (Integration, echter Python-Prozess)
// ---------------------------------------------------------------------------

test("A1 listPresets returns sorted preset names from real config dir", async (t) => {
  const tmp = makeTmp("harness-038-list-")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  assert.deepEqual(cli.listPresets(configDir), ["Alpha Preset", "Beta Preset"])
})

test("A2 listPresets returns null when config dir does not exist", async (t) => {
  const tmp = makeTmp("harness-038-list-missing-")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  captureConsoleError(t)
  assert.equal(cli.listPresets(join(tmp, "nope")), null)
})

test("A3 listPresets returns null on invalid CLI JSON output", async (t) => {
  const tmp = makeTmp("harness-038-list-badjson-")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const fakePython = join(tmp, "fake-python.sh")
  writeFileSync(fakePython, "#!/bin/sh\necho 'not json'\nexit 0\n", { encoding: "utf-8" })
  chmodSync(fakePython, 0o755)
  withEnv(t, { HARNESS_PYTHON: fakePython })
  captureConsoleError(t)
  assert.equal(cli.listPresets(), null)
})

test("A4 listPresets returns empty array for config dir without presets", async (t) => {
  const tmp = makeTmp("harness-038-list-empty-")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const dir = join(tmp, "configs")
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "qwen.yaml"), "name: qwen\nparameters: {}\n", { encoding: "utf-8" })
  assert.deepEqual(cli.listPresets(dir), [])
})

// ---------------------------------------------------------------------------
// B: "command.execute.before" mit echter Preset-Liste
// ---------------------------------------------------------------------------

test("B1 empty arguments lists available presets, no setActivePreset", async (t) => {
  const tmp = makeTmp("harness-038-cmd-empty-")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  withEnv(t, {
    HARNESS_PRESET_FILE: makeTmp("harness-038-store-") + "/active-presets.json",
    HARNESS_CONFIG_DIR: configDir,
  })
  const hooks = await HarnessPlugin({})
  const output = { parts: [{ type: "text", text: "$ARGUMENTS" }] }
  await hooks["command.execute.before"]({ sessionID: "ses_038_1", command: "harness-set", arguments: "" }, output)
  assert.equal(store.getActivePreset("ses_038_1"), undefined)
  const text = (output.parts[0] as { text: string }).text
  assert.match(text, /Alpha Preset/)
  assert.match(text, /Beta Preset/)
})

test("B2 valid preset name activates preset and confirms in output.parts", async (t) => {
  const tmp = makeTmp("harness-038-cmd-valid-")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  withEnv(t, {
    HARNESS_PRESET_FILE: makeTmp("harness-038-store-") + "/active-presets.json",
    HARNESS_CONFIG_DIR: configDir,
  })
  const hooks = await HarnessPlugin({})
  const output = { parts: [{ type: "text", text: "$ARGUMENTS" }] }
  await hooks["command.execute.before"]({ sessionID: "ses_038_2", command: "harness-set", arguments: "Alpha Preset" }, output)
  assert.equal(store.getActivePreset("ses_038_2"), "Alpha Preset")
  assert.match((output.parts[0] as { text: string }).text, /Alpha Preset/)
})

test("B3 unknown preset name does not overwrite a previously active preset", async (t) => {
  const tmp = makeTmp("harness-038-cmd-unknown-")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  withEnv(t, {
    HARNESS_PRESET_FILE: makeTmp("harness-038-store-") + "/active-presets.json",
    HARNESS_CONFIG_DIR: configDir,
  })
  store.setActivePreset("ses_038_3", "Alpha Preset")
  const hooks = await HarnessPlugin({})
  const output = { parts: [{ type: "text", text: "$ARGUMENTS" }] }
  await hooks["command.execute.before"]({ sessionID: "ses_038_3", command: "harness-set", arguments: "Nonexistent Preset" }, output)
  assert.equal(store.getActivePreset("ses_038_3"), "Alpha Preset")
  const text = (output.parts[0] as { text: string }).text
  assert.match(text, /Unknown/i)
  assert.match(text, /Alpha Preset/)
})

test("B4 CLI failure (unresolvable preset list) fails open: setActivePreset is still called", async (t) => {
  const tmp = makeTmp("harness-038-cmd-failopen-")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  withEnv(t, {
    HARNESS_PRESET_FILE: makeTmp("harness-038-store-") + "/active-presets.json",
    HARNESS_CONFIG_DIR: join(tmp, "does-not-exist"),
  })
  captureConsoleError(t)
  const hooks = await HarnessPlugin({})
  const output = { parts: [{ type: "text", text: "$ARGUMENTS" }] }
  await hooks["command.execute.before"]({ sessionID: "ses_038_4", command: "harness-set", arguments: "Whatever" }, output)
  assert.equal(store.getActivePreset("ses_038_4"), "Whatever")
})

// ---------------------------------------------------------------------------
// C: Python-Auflösung (Fix #2) + reale Preset-Liste aus harness_configs/
// ---------------------------------------------------------------------------

test("C1 defaultPythonExecutable uses 'python' on win32 (Windows Store python3-Stub vermeiden)", () => {
  assert.equal(cli.defaultPythonExecutable("win32"), "python")
})

test("C2 defaultPythonExecutable uses 'python3' on non-Windows", () => {
  assert.equal(cli.defaultPythonExecutable("linux"), "python3")
  assert.equal(cli.defaultPythonExecutable("darwin"), "python3")
})

test("C3 pythonExecutable prefers HARNESS_PYTHON over platform default", async (t) => {
  withEnv(t, { HARNESS_PYTHON: "my-custom-python" })
  assert.equal(cli.pythonExecutable(), "my-custom-python")
})

test("C4 pythonExecutable falls back to platform default without HARNESS_PYTHON", async (t) => {
  withEnv(t, { HARNESS_PYTHON: undefined })
  assert.equal(cli.pythonExecutable(), cli.defaultPythonExecutable())
})

test("C5 listPresets returns real 'Qwen Deep Coding' from default harness_configs/", async (t) => {
  // Realistisches Setup: kein HARNESS_CONFIG_DIR -> Default <Projektroot>/harness_configs.
  // Voraussetzung: python3 (oder HARNESS_PYTHON) mit PyYAML; das Default-Verzeichnis existiert.
  withEnv(t, { HARNESS_CONFIG_DIR: undefined, HARNESS_PYTHON: undefined })
  captureConsoleError(t)
  const presets = cli.listPresets()
  assert.ok(presets, "listPresets() should resolve the real default config dir")
  assert.ok(presets.includes("Qwen Deep Coding"), `expected Qwen Deep Coding, got ${presets}`)
})
