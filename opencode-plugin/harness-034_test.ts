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
 *     → console.error ausgeben und den Implementation-Write abweisen
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
import { dirname, join } from "node:path"

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
  writeFileSync(
    join(dir, "tdd_preset.yaml"),
    "name: tdd\nharnesses:\n  - tdd\n",
    { encoding: "utf-8", flag: "wx" }
  )
  return dir
}

function makeOutputToolBefore() {
  return { args: {} as Record<string, any> }
}

function makeOutputToolAfter() {
  return { title: "", output: "" as string, metadata: { exit: 0 } }
}

// Test-Datei-Patterns (SOLL: diese werden NICHT gewarnt)
const TEST_FILE_PATTERNS = [
  "test_example.py",
  "example_test.py",
  "tests/unit/test_nested.py",
  "src/utils.test.ts",
  "src/utils.spec.ts",
  "test_example.go",
  "example_test.go",
  "internal/service/test_nested.go",
]

// Nicht-Test-Dateien (SOLL: gewarnt wenn generate_tdd + kein Testlauf)
const NON_TEST_FILES = [
  "src/main.py",
  "src/utils.py",
  "lib/index.ts",
  "app/models.rb",
]

function writeTddStore(t: test.TestContext, file: string) {
  mkdirSync(dirname(file), { recursive: true })
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
  withEnv(t, { HARNESS_PRESET_FILE: storeFile, HARNESS_CONFIG_DIR: configDir, HARNESS_SESSION_STATE_FILE: sessionFile })
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
  await assert.rejects(() => hooks["tool.execute.before"](input, output), /TDD order violation/)
  assert.equal(input.args.path, "src/main.py")
  assert.deepEqual(output.args, {})
})

test("G2 tool.execute.before warnt auch bei edit-Tool", async (t) => {
  const tmp = makeTmp("harness-tool-edit/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  const storeFile = makeTmp("harness-tool-store2/") + "/active-presets.json"
  const sessionFile = makeTmp("harness-tool-session2/") + "/tdd-tracked.json"
  withEnv(t, { HARNESS_PRESET_FILE: storeFile, HARNESS_CONFIG_DIR: configDir, HARNESS_SESSION_STATE_FILE: sessionFile })
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
  await assert.rejects(() => hooks["tool.execute.before"](input, output), /TDD order violation/)
})

test("G3 tool.execute.before warnt nicht fuer Test-Dateien", async (t) => {
  for (const filePath of TEST_FILE_PATTERNS) {
    const tmp = makeTmp("harness-tool-testfile/")
    t.after(() => rmSync(tmp, { recursive: true, force: true }))
    const configDir = makeConfigDir(tmp)
    const storeFile = makeTmp("harness-tool-store3/") + "/active-presets.json"
    const sessionFile = makeTmp("harness-tool-session3/") + "/tdd-tracked.json"
    withEnv(t, { HARNESS_PRESET_FILE: storeFile, HARNESS_CONFIG_DIR: configDir, HARNESS_SESSION_STATE_FILE: sessionFile })
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
  withEnv(t, { HARNESS_PRESET_FILE: storeFile, HARNESS_CONFIG_DIR: configDir, HARNESS_SESSION_STATE_FILE: sessionFile })
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
  await assert.rejects(
    () => hooks["tool.execute.before"](input2, makeOutputToolBefore()),
    /TDD order violation/,
    "a second implementation write requires a fresh test run",
  )
})

test("G5 tool.execute.after ignoriert keine-Test-Runner-Shell-Befehle", async (t) => {
  const tmp = makeTmp("harness-tool-shell/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  const storeFile = makeTmp("harness-tool-store5/") + "/active-presets.json"
  const sessionFile = makeTmp("harness-tool-session5/") + "/tdd-tracked.json"
  withEnv(t, { HARNESS_PRESET_FILE: storeFile, HARNESS_CONFIG_DIR: configDir, HARNESS_SESSION_STATE_FILE: sessionFile })
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

test("G5b failed test unlocks one implementation write but not the finish gate", async (t) => {
  const tmp = makeTmp("harness-tool-failed-test/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  const storeFile = makeTmp("harness-tool-store-failed/") + "/active-presets.json"
  const sessionFile = makeTmp("harness-tool-session-failed/") + "/tdd-tracked.json"
  withEnv(t, { HARNESS_PRESET_FILE: storeFile, HARNESS_CONFIG_DIR: configDir, HARNESS_SESSION_STATE_FILE: sessionFile })
  store.setActivePreset("ses_failed", "tdd")
  writeTddStore(t, sessionFile)

  const hooks = await HarnessPlugin({})
  await hooks["tool.execute.after"](
    {
      tool: "shell",
      sessionID: "ses_failed",
      callID: "call_failed",
      args: { command: "pytest tests/" },
    },
    { title: "pytest tests/", output: "1 failed", metadata: { exit: 1 } },
  )

  const implementationWrite = {
    tool: "write",
    sessionID: "ses_failed",
    callID: "call_after_failed",
    args: { path: "src/main.py", content: "new code" },
  }
  await hooks["tool.execute.before"](
    implementationWrite,
    makeOutputToolBefore(),
  )

  await assert.rejects(
    () => hooks["tool.execute.before"](implementationWrite, makeOutputToolBefore()),
    /TDD order violation/,
    "the failed run permits implementation but never counts as a post-change passing run",
  )

  const blocked = { allow: true }
  await hooks["experimental.session.before_finish"](
    { sessionID: "ses_failed", model: {} },
    blocked,
  )
  assert.equal(blocked.allow, false)
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

test("G10 before_finish blocks generate_tdd until a test runner has completed", async (t) => {
  const tmp = makeTmp("harness-finish-gate/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  const storeFile = join(tmp, "active-presets.json")
  const sessionFile = join(tmp, "tdd-tracked.json")
  withEnv(t, {
    HARNESS_PRESET_FILE: storeFile,
    HARNESS_CONFIG_DIR: configDir,
    HARNESS_SESSION_STATE_FILE: sessionFile,
  })
  store.setActivePreset("ses_finish_gate", "tdd")
  writeTddStore(t, sessionFile)
  const hooks = await HarnessPlugin({})
  const blocked = { allow: true }

  await hooks["experimental.session.before_finish"](
    { sessionID: "ses_finish_gate", model: {} },
    blocked,
  )
  assert.equal(blocked.allow, false)

  await hooks["tool.execute.after"](
    { tool: "shell", sessionID: "ses_finish_gate", callID: "run", args: { command: "pytest" } },
    makeOutputToolAfter(),
  )
  const allowed = { allow: true }
  await hooks["experimental.session.before_finish"](
    { sessionID: "ses_finish_gate", model: {} },
    allowed,
  )
  assert.equal(allowed.allow, true)
})

test("G11 bun test is recognized as a real successful test run", async (t) => {
  const tmp = makeTmp("harness-bun-test/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  const storeFile = join(tmp, "active-presets.json")
  const sessionFile = join(tmp, "tdd-tracked.json")
  withEnv(t, {
    HARNESS_PRESET_FILE: storeFile,
    HARNESS_CONFIG_DIR: configDir,
    HARNESS_SESSION_STATE_FILE: sessionFile,
  })
  store.setActivePreset("ses_bun", "tdd")
  writeTddStore(t, sessionFile)
  const hooks = await HarnessPlugin({})

  await hooks["tool.execute.after"](
    { tool: "shell", sessionID: "ses_bun", callID: "bun", args: { command: "bun test" } },
    { title: "bun test", output: "1 pass", metadata: { exit: 0 } },
  )

  const allowed = { allow: true }
  await hooks["experimental.session.before_finish"](
    { sessionID: "ses_bun", model: {} },
    allowed,
  )
  assert.equal(allowed.allow, true)
})

test("G12 failed bun test does not satisfy the finish gate", async (t) => {
  const tmp = makeTmp("harness-bun-test-failed/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  const storeFile = join(tmp, "active-presets.json")
  const sessionFile = join(tmp, "tdd-tracked.json")
  withEnv(t, {
    HARNESS_PRESET_FILE: storeFile,
    HARNESS_CONFIG_DIR: configDir,
    HARNESS_SESSION_STATE_FILE: sessionFile,
  })
  store.setActivePreset("ses_bun_failed", "tdd")
  writeTddStore(t, sessionFile)
  const hooks = await HarnessPlugin({})

  await hooks["tool.execute.after"](
    { tool: "shell", sessionID: "ses_bun_failed", callID: "bun", args: { command: "bun test" } },
    { title: "bun test", output: "1 fail", metadata: { exit: 1 } },
  )

  const blocked = { allow: true }
  await hooks["experimental.session.before_finish"](
    { sessionID: "ses_bun_failed", model: {} },
    blocked,
  )
  assert.equal(blocked.allow, false)
})

test("G13 real core-shaped before hook reads write args from output.args", async (t) => {
  const tmp = makeTmp("harness-real-before-shape/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  const storeFile = join(tmp, "active-presets.json")
  const sessionFile = join(tmp, "tdd-tracked.json")
  withEnv(t, {
    HARNESS_PRESET_FILE: storeFile,
    HARNESS_CONFIG_DIR: configDir,
    HARNESS_SESSION_STATE_FILE: sessionFile,
  })
  store.setActivePreset("ses_real_before", "tdd")
  writeTddStore(t, sessionFile)
  const hooks = await HarnessPlugin({})

  await assert.rejects(
    () => hooks["tool.execute.before"](
      { tool: "write", sessionID: "ses_real_before", callID: "write" },
      { args: { filePath: "/tmp/project/identifier.py", content: "implementation" } },
    ),
    /TDD order violation/,
  )
})

test("G14 real bash payload with piped pytest failures does not satisfy finish gate", async (t) => {
  const tmp = makeTmp("harness-real-bash-fail/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  const storeFile = join(tmp, "active-presets.json")
  const sessionFile = join(tmp, "tdd-tracked.json")
  withEnv(t, {
    HARNESS_PRESET_FILE: storeFile,
    HARNESS_CONFIG_DIR: configDir,
    HARNESS_SESSION_STATE_FILE: sessionFile,
  })
  store.setActivePreset("ses_real_bash_fail", "tdd")
  writeTddStore(t, sessionFile)
  const hooks = await HarnessPlugin({})

  await hooks["tool.execute.after"](
    {
      tool: "bash",
      sessionID: "ses_real_bash_fail",
      callID: "pytest",
      args: { command: "python -m pytest -q 2>&1 | tail -6" },
    },
    { title: "pytest", output: "50 failed in 2.16s", metadata: { exit: 0 } },
  )
  const blocked = { allow: true }
  await hooks["experimental.session.before_finish"](
    { sessionID: "ses_real_bash_fail", model: {} },
    blocked,
  )
  assert.equal(blocked.allow, false)
})

test("G15 real bash payload with passing pytest satisfies finish gate", async (t) => {
  const tmp = makeTmp("harness-real-bash-pass/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  const storeFile = join(tmp, "active-presets.json")
  const sessionFile = join(tmp, "tdd-tracked.json")
  withEnv(t, {
    HARNESS_PRESET_FILE: storeFile,
    HARNESS_CONFIG_DIR: configDir,
    HARNESS_SESSION_STATE_FILE: sessionFile,
  })
  store.setActivePreset("ses_real_bash_pass", "tdd")
  writeTddStore(t, sessionFile)
  const hooks = await HarnessPlugin({})

  await hooks["tool.execute.after"](
    {
      tool: "bash",
      sessionID: "ses_real_bash_pass",
      callID: "pytest",
      args: { command: "python -m pytest -q" },
    },
    { title: "pytest", output: "50 passed in 0.10s", metadata: { exit: 0 } },
  )
  const allowed = { allow: true }
  await hooks["experimental.session.before_finish"](
    { sessionID: "ses_real_bash_pass", model: {} },
    allowed,
  )
  assert.equal(allowed.allow, true)
})

test("G16 python unittest is recognized as a real successful test run", async (t) => {
  const tmp = makeTmp("harness-real-unittest-pass/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  const storeFile = join(tmp, "active-presets.json")
  const sessionFile = join(tmp, "tdd-tracked.json")
  withEnv(t, {
    HARNESS_PRESET_FILE: storeFile,
    HARNESS_CONFIG_DIR: configDir,
    HARNESS_SESSION_STATE_FILE: sessionFile,
  })
  store.setActivePreset("ses_real_unittest_pass", "tdd")
  writeTddStore(t, sessionFile)
  const hooks = await HarnessPlugin({})

  await hooks["tool.execute.after"](
    {
      tool: "bash",
      sessionID: "ses_real_unittest_pass",
      callID: "unittest",
      args: { command: "python -m unittest test_smoke.py -v" },
    },
    { title: "unittest", output: "Ran 1 test in 0.000s\n\nOK", metadata: { exit: 0 } },
  )
  const allowed = { allow: true }
  await hooks["experimental.session.before_finish"](
    { sessionID: "ses_real_unittest_pass", model: {} },
    allowed,
  )
  assert.equal(allowed.allow, true)
})
