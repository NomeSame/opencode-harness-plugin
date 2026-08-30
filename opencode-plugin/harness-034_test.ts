/**
 * SOLL-Tests für TODO-034: tool.execute.before/after für TDD-Reihenfolge.
 *
 * SOLL:
 *   HarnessPlugin registriert "tool.execute.before" und "tool.execute.after" Hooks.
 *   Aktiv NUR wenn test_strategy === "generate_tdd" fuer das aktive Preset.
 *
 *   tool.execute.before:
 *     - Tool ist write/edit (tools.ts: toolName ist "write", "edit", "str_replace_editor", etc.)
 *     - Tool-args enthalten eine Dateipfad-Angabe (args.path, args.file, args.filePath, ...)
 *     - Diese Datei ist KEINE Test-Datei (nicht *_test.py, test_*.py, *.test.ts,
 *       *.spec.ts, test_*.go, *_test.go, *_spec.rb, etc.)
 *     - Fuer diese Session wurde noch KEIN Testlauf ueber TDDRunner (CLI-Bruecke) ausgefuehrt
 *     → console.error Warnung ausgeben (soft warning, kein throw)
 *     - output wird NICHT veraendert (args bleiben unangetastet)
 *
 *   tool.execute.after:
 *     - Tool ist shell
 *     - args.command sieht aus wie ein Test-Runner (pytest, npm test, go test,
 *       bundle exec rake, etc.)
 *     → session als "getestet" markieren (per-session JSON state)
 *
 *   Per-Session-State:
 *     Datei: ~/.config/opencode-harness/tdd-tracked.json
 *     Format: { "<sessionID>": { "tested": boolean, "trackedAt": number } }
 *     YAGNI: keine DB, keine neue Dependency.
 *     Lesezugriffe immer fehlertolerant.
 *
 *   Andere test_strategy: kein Verhalten geaendert.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const store = await import("./harness-store.ts")
const pluginMod = await import("./harness-plugin.ts")
const HarnessPlugin = pluginMod.default

function makeTmp(prefix: string): string {
  const safe = prefix.replace(/\/+$/, "")
  return mkdtempSync(join(tmpdir(), safe))
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
  writeFileSync(
    join(dir, "tdd.yaml"),
    "name: tdd\nparameters:\n  test_strategy: {value: generate_tdd, enforced: true}\n",
    { encoding: "utf-8", flag: "wx" }
  )
  return dir
}

function makeOutputToolBefore() {
  return { args: {} as Record<string, any> }
}

function makeOutputToolAfter() {
  return { title: "", output: "" as string, metadata: null }
}

// Test-Datei-Patterns (SOLL: diese werden NICHT gewarnt)
const TEST_FILE_PATTERNS = [
  "test_example.py",
  "example_test.py",
  "src/utils.test.ts",
  "src/utils.spec.ts",
  "test_example.go",
  "example_test.go",
]

// Nicht-Test-Dateien (SOLL: gewarnt wenn generate_tdd + kein Testlauf)
const NON_TEST_FILES = [
  "src/main.py",
  "src/utils.py",
  "lib/index.ts",
  "app/models.rb",
]

function writeTddStore(t: test.TestContext, file: string) {
  mkdirSync(file.replace(/\/[^/]+$/, ""), { recursive: true })
  writeFileSync(file, "{}", { encoding: "utf-8" })
}

// ---------------------------------------------------------------------------
// G: tool.execute.before/after — TDD order support
// ---------------------------------------------------------------------------

test("G1 tool.execute.before auf write-Tool warnt wenn generate_tdd + kein Testlauf", async (t) => {
  const tmp = makeTmp("harness-tool-before/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  const storeFile = makeTmp("harness-tool-store/") + "/active-presets.json"
  const sessionFile = makeTmp("harness-tool-session/") + "/tdd-tracked.json"
  withEnv(t, { HARNESS_PRESET_FILE: storeFile, HARNESS_CONFIG_DIR: configDir })
  store.setActivePreset("ses_warn", "tdd")
  writeTddStore(t, sessionFile)

  const hooks = await HarnessPlugin({})
  const output = makeOutputToolBefore()
  const input = {
    tool: "write",
    sessionID: "ses_warn",
    callID: "call_1",
    args: { path: "src/main.py", content: "print('hello')" },
  }
  await hooks["tool.execute.before"](input, output)
  assert.equal(input.args.path, "src/main.py")
  assert.deepEqual(output.args, {})
})

test("G2 tool.execute.before warnt auch bei edit-Tool", async (t) => {
  const tmp = makeTmp("harness-tool-edit/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  const storeFile = makeTmp("harness-tool-store2/") + "/active-presets.json"
  const sessionFile = makeTmp("harness-tool-session2/") + "/tdd-tracked.json"
  withEnv(t, { HARNESS_PRESET_FILE: storeFile, HARNESS_CONFIG_DIR: configDir })
  store.setActivePreset("ses_edit", "tdd")
  writeTddStore(t, sessionFile)

  const hooks = await HarnessPlugin({})
  const output = makeOutputToolBefore()
  const input = {
    tool: "edit",
    sessionID: "ses_edit",
    callID: "call_2",
    args: { path: "src/main.py", old_string: "hello", new_string: "world" },
  }
  await hooks["tool.execute.before"](input, output)
})

test("G3 tool.execute.before warnt nicht fuer Test-Dateien", async (t) => {
  for (const filePath of TEST_FILE_PATTERNS) {
    const tmp = makeTmp("harness-tool-testfile/")
    t.after(() => rmSync(tmp, { recursive: true, force: true }))
    const configDir = makeConfigDir(tmp)
    const storeFile = makeTmp("harness-tool-store3/") + "/active-presets.json"
    const sessionFile = makeTmp("harness-tool-session3/") + "/tdd-tracked.json"
    withEnv(t, { HARNESS_PRESET_FILE: storeFile, HARNESS_CONFIG_DIR: configDir })
    store.setActivePreset("ses_tf", "tdd")
    writeTddStore(t, sessionFile)

    const hooks = await HarnessPlugin({})
    const output = makeOutputToolBefore()
    const input = {
      tool: "write",
      sessionID: "ses_tf",
      callID: "call_tf",
      args: { path: filePath, content: "def test_foo(): pass" },
    }
    await hooks["tool.execute.before"](input, output)
  }
})

test("G4 tool.execute.after markiert Shell-Test-Runner-Call als Testlauf", async (t) => {
  const tmp = makeTmp("harness-tool-after/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  const storeFile = makeTmp("harness-tool-store4/") + "/active-presets.json"
  const sessionFile = makeTmp("harness-tool-session4/") + "/tdd-tracked.json"
  withEnv(t, { HARNESS_PRESET_FILE: storeFile, HARNESS_CONFIG_DIR: configDir })
  store.setActivePreset("ses_after", "tdd")
  writeTddStore(t, sessionFile)

  const hooks = await HarnessPlugin({})
  const output = makeOutputToolAfter()
  const input = {
    tool: "shell",
    sessionID: "ses_after",
    callID: "call_after",
    args: { command: "pytest tests/" },
  }
  await hooks["tool.execute.after"](input, output)

  // Nach Test-Runner: write-Tool auf Nicht-Test-Datei sollte NICHT mehr warnen
  const output2 = makeOutputToolBefore()
  const input2 = {
    tool: "write",
    sessionID: "ses_after",
    callID: "call_after2",
    args: { path: "src/main.py", content: "new code" },
  }
  await hooks["tool.execute.before"](input2, output2)
})

test("G5 tool.execute.after ignoriert keine-Test-Runner-Shell-Befehle", async (t) => {
  const tmp = makeTmp("harness-tool-shell/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  const storeFile = makeTmp("harness-tool-store5/") + "/active-presets.json"
  const sessionFile = makeTmp("harness-tool-session5/") + "/tdd-tracked.json"
  withEnv(t, { HARNESS_PRESET_FILE: storeFile, HARNESS_CONFIG_DIR: configDir })
  store.setActivePreset("ses_shell", "tdd")
  writeTddStore(t, sessionFile)

  const hooks = await HarnessPlugin({})
  const output = makeOutputToolAfter()
  const input = {
    tool: "shell",
    sessionID: "ses_shell",
    callID: "call_shell",
    args: { command: "ls -la" },
  }
  await hooks["tool.execute.after"](input, output)
})

test("G6 tool.execute.before/after ohne aktives Preset: kein Verhalten", async (t) => {
  withEnv(t, { HARNESS_PRESET_FILE: makeTmp("harness-tool-no-pres/") + "/active-presets.json" })
  const hooks = await HarnessPlugin({})
  const outputBefore = makeOutputToolBefore()
  const outputAfter = makeOutputToolAfter()

  await hooks["tool.execute.before"](
    { tool: "write", sessionID: "ses_nop", callID: "c1", args: { path: "x.py" } },
    outputBefore
  )
  await hooks["tool.execute.after"](
    { tool: "shell", sessionID: "ses_nop", callID: "c2", args: { command: "pytest" } },
    outputAfter
  )
})

test("G7 tool.execute.before loest auf undefined auf (void)", async (t) => {
  withEnv(t, { HARNESS_PRESET_FILE: makeTmp("harness-tool-void/") + "/active-presets.json" })
  const hooks = await HarnessPlugin({})
  const result = await hooks["tool.execute.before"](
    { tool: "write", sessionID: "ses_v", callID: "c1", args: {} },
    makeOutputToolBefore()
  )
  assert.equal(result, undefined)
})

test("G8 tool.execute.after loest auf undefined auf (void)", async (t) => {
  withEnv(t, { HARNESS_PRESET_FILE: makeTmp("harness-tool-void2/") + "/active-presets.json" })
  const hooks = await HarnessPlugin({})
  const result = await hooks["tool.execute.after"](
    { tool: "shell", sessionID: "ses_v", callID: "c2", args: {} },
    makeOutputToolAfter()
  )
  assert.equal(result, undefined)
})

test("G9 Hooks exposed im Plugin-Objekt", async () => {
  const hooks = await HarnessPlugin({})
  assert.equal(typeof hooks["tool.execute.before"], "function")
  assert.equal(typeof hooks["tool.execute.after"], "function")
})
