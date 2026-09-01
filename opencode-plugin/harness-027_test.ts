/**
 * SOLL-Tests für TODO-027: `chat.params`-Hook (Final Authority live).
 *
 * Diese Datei fixiert das SOLL VOR der Implementierung:
 *
 *   harness-store.ts
 *     - getActivePreset(sessionID)  -> string | undefined, wirft NIE
 *     - setActivePreset(sessionID, presetName) -> void, atomar
 *     - Store-Pfad: $HARNESS_PRESET_FILE (lesbar zur AUFRUFSIZEIT) oder
 *       ~/.config/opencode-harness/active-presets.json
 *       (Format: { "<sessionID>": "<presetName>" })
 *
 *   harness-cli.ts
 *     - resolvePreset(presetName, configDir?) -> Params | null (null = Fehlschlag,
 *       geloggte Warnung via console.error, NIE throw)
 *     - Params = Record<string, { value: unknown, enforced: boolean }>
 *     - Python-Binary: $HARNESS_PYTHON (Default "python3")
 *     - Config-Dir: 2. Argument oder $HARNESS_CONFIG_DIR oder <Projektroot>/harness_configs
 *     - Timeout: Default 10 s, abbruchbar -> null
 *
 *   harness-plugin.ts
 *     - applyEnforcedParams(params, output) -> void, rein, wirft NIE
 *       * temperature/top_p/top_k/max_output_tokens: nur wenn enforced === true
 *         UND value ist Zahl -> output.temperature/topP/topK/maxOutputTokens
 *       * alle anderen Parameter: nur wenn enforced === true und value != null
 *         -> output.options[key]
 *       * nicht-enforced / null / undefined / kaputte Eintraege: ueberspringen
 *     - Hook "chat.params": kein aktives Preset -> output unveraendert;
 *       Resolve-Fehler -> output unveraendert, keine Exception.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = dirname(HERE)

const store = await import("./harness-store.ts")
const cli = await import("./harness-cli.ts")
const pluginMod = await import("./harness-plugin.ts")
const { applyEnforcedParams } = await import("./harness-params.ts")
const HarnessPlugin = pluginMod.default

function makeOutput() {
  return {
    temperature: 0.7,
    topP: 0.9,
    topK: 20,
    maxOutputTokens: 4096,
    options: {} as Record<string, unknown>,
  }
}

type Output = ReturnType<typeof makeOutput>

function makeConfigDir(base: string): string {
  const dir = join(base, "configs")
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, "qwen.yaml"),
    "name: qwen\nparameters:\n  temperature: {value: 1.0, enforced: true}\n  top_p: {value: 0.95, enforced: true}\n  thinking: {value: enabled, enforced: true}\n",
    { encoding: "utf-8", flag: "wx" }
  )
  writeFileSync(
    join(dir, "coding.yaml"),
    "name: coding\nparameters:\n  max_iterations: {value: 30}\n",
    { encoding: "utf-8", flag: "wx" }
  )
  writeFileSync(
    join(dir, "long-context.yaml"),
    "name: long-context\nparameters:\n  compaction_threshold: {value: 0.80}\n",
    { encoding: "utf-8", flag: "wx" },
  )
  writeFileSync(
    join(dir, "qwen_deep_coding.yaml"),
    "name: Qwen Deep Coding\nharnesses:\n  - qwen\n  - coding\n  - long-context\nmodel: qwen-3.8-27b\n",
    { encoding: "utf-8", flag: "wx" }
  )
  return dir
}

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

function captureConsoleError(t: test.TestContext, fn: () => Promise<void> | void) {
  const lines: string[] = []
  const original = console.error
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "))
  }
  t.after(() => {
    console.error = original
  })
  return { run: fn, lines }
}

// ---------------------------------------------------------------------------
// A: applyEnforcedParams (rein, unit)
// ---------------------------------------------------------------------------

test("A1 enforced top-level parameter values are applied to output", () => {
  const output = makeOutput()
  applyEnforcedParams(
    {
      temperature: { value: 1.0, enforced: true },
      top_p: { value: 0.95, enforced: true },
      top_k: { value: 40, enforced: true },
      max_output_tokens: { value: 8192, enforced: true },
    },
    output
  )
  assert.equal(output.temperature, 1.0)
  assert.equal(output.topP, 0.95)
  assert.equal(output.topK, 40)
  assert.equal(output.maxOutputTokens, 8192)
  assert.deepEqual(output.options, {})
})

test("A2 non-enforced top-level parameter values are NOT applied", () => {
  const output = makeOutput()
  applyEnforcedParams(
    {
      temperature: { value: 1.0, enforced: false },
      top_p: { value: 0.95, enforced: false },
      top_k: { value: 40, enforced: false },
      max_output_tokens: { value: 8192, enforced: false },
    },
    output
  )
  assert.equal(output.temperature, 0.7)
  assert.equal(output.topP, 0.9)
  assert.equal(output.topK, 20)
  assert.equal(output.maxOutputTokens, 4096)
  assert.deepEqual(output.options, {})
})

test("A3 enforced other parameters land in output.options", () => {
  const output = makeOutput()
  applyEnforcedParams(
    {
      thinking: { value: "enabled", enforced: true },
      max_iterations: { value: 30, enforced: true },
    },
    output
  )
  assert.equal(output.options.thinking, "enabled")
  assert.equal(output.options.max_iterations, 30)
  assert.equal(output.temperature, 0.7)
})

test("A4 non-enforced other parameters do NOT land in options", () => {
  const output = makeOutput()
  applyEnforcedParams(
    {
      thinking: { value: "enabled", enforced: false },
      max_iterations: { value: 30, enforced: false },
      test_strategy: { value: "generate_tdd", enforced: false },
    },
    output
  )
  assert.deepEqual(output.options, {})
})

test("A5 mixed enforced/non-enforced: only enforced applied", () => {
  const output = makeOutput()
  applyEnforcedParams(
    {
      temperature: { value: 1.0, enforced: true },
      top_p: { value: 0.95, enforced: false },
      thinking: { value: "enabled", enforced: true },
      max_iterations: { value: 30, enforced: false },
    },
    output
  )
  assert.equal(output.temperature, 1.0)
  assert.equal(output.topP, 0.9)
  assert.equal(output.options.thinking, "enabled")
  assert.equal(output.options.max_iterations, undefined)
})

test("A6 malformed input never throws and leaves output untouched", () => {
  const badParams: unknown[] = [
    undefined,
    null,
    "temperature",
    42,
    [],
    { temperature: "1.0" },
    { temperature: { enforced: true } },
    { temperature: { value: undefined, enforced: true } },
    { temperature: { value: null, enforced: true } },
    { thinking: { value: null, enforced: true } },
  ]
  for (const params of badParams) {
    const output = makeOutput()
    assert.doesNotThrow(() => applyEnforcedParams(params, output))
    assert.equal(output.temperature, 0.7)
    assert.equal(output.topP, 0.9)
    assert.equal(output.topK, 20)
    assert.equal(output.maxOutputTokens, 4096)
    assert.deepEqual(output.options, {})
  }
})

test("A7 non-numeric value for numeric top-level fields is skipped (no corruption)", () => {
  const output = makeOutput()
  applyEnforcedParams(
    {
      temperature: { value: "1.0", enforced: true },
      top_p: { value: [0.9], enforced: true },
      max_output_tokens: { value: "8192", enforced: true },
    },
    output
  )
  assert.equal(output.temperature, 0.7)
  assert.equal(output.topP, 0.9)
  assert.equal(output.maxOutputTokens, 4096)
})

// ---------------------------------------------------------------------------
// B: harness-store (unit, echte Datei im tmp-Dir)
// ---------------------------------------------------------------------------

test("B1 getActivePreset returns undefined when store file does not exist", async (t) => {
  withEnv(t, { HARNESS_PRESET_FILE: makeTmp("harness-store-nofile/") + "/active-presets.json" })
  assert.equal(store.getActivePreset("ses_missing"), undefined)
})

test("B2 getActivePreset returns undefined for corrupt JSON (never throws)", async (t) => {
  const file = makeTmp("harness-store-corrupt/") + "/active-presets.json"
  writeFileSync(file, "{ not valid json", { encoding: "utf-8" })
  withEnv(t, { HARNESS_PRESET_FILE: file })
  assert.equal(store.getActivePreset("ses_1"), undefined)
})

test("B3 getActivePreset returns undefined for unknown session", async (t) => {
  const file = makeTmp("harness-store-unknown/") + "/active-presets.json"
  writeFileSync(file, JSON.stringify({ other: "Preset" }), { encoding: "utf-8" })
  withEnv(t, { HARNESS_PRESET_FILE: file })
  assert.equal(store.getActivePreset("ses_1"), undefined)
})

test("B4 setActivePreset -> getActivePreset roundtrip", async (t) => {
  const file = makeTmp("harness-store-roundtrip/") + "/active-presets.json"
  withEnv(t, { HARNESS_PRESET_FILE: file })
  store.setActivePreset("ses_1", "Qwen Deep Coding")
  assert.equal(store.getActivePreset("ses_1"), "Qwen Deep Coding")
  const onDisk = JSON.parse(readFileSync(file, "utf-8"))
  assert.equal(onDisk.ses_1, "Qwen Deep Coding")
})

test("B5 setActivePreset creates nested directories that do not exist yet", async (t) => {
  const file = makeTmp("harness-store-deep/") + "/a/b/c/active-presets.json"
  withEnv(t, { HARNESS_PRESET_FILE: file })
  assert.doesNotThrow(() => store.setActivePreset("ses_1", "P"))
  assert.equal(store.getActivePreset("ses_1"), "P")
})

test("B6 entries are per-session and overwritable", async (t) => {
  const file = makeTmp("harness-store-per-session/") + "/active-presets.json"
  withEnv(t, { HARNESS_PRESET_FILE: file })
  store.setActivePreset("ses_1", "Alpha")
  store.setActivePreset("ses_2", "Beta")
  assert.equal(store.getActivePreset("ses_1"), "Alpha")
  assert.equal(store.getActivePreset("ses_2"), "Beta")
  store.setActivePreset("ses_1", "Gamma")
  assert.equal(store.getActivePreset("ses_1"), "Gamma")
  assert.equal(store.getActivePreset("ses_2"), "Beta")
})

// ---------------------------------------------------------------------------
// C: harness-cli.resolvePreset (Integration, echter Python-Prozess)
// ---------------------------------------------------------------------------

test("C1 resolvePreset resolves enforced and non-enforced params via real CLI", async (t) => {
  const tmp = makeTmp("harness-cli-resolve/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  const params = cli.resolvePreset("Qwen Deep Coding", configDir)
  assert.ok(params)
  assert.deepEqual(params.temperature, { value: 1.0, enforced: true })
  assert.deepEqual(params.top_p, { value: 0.95, enforced: true })
  assert.deepEqual(params.thinking, { value: "enabled", enforced: true })
  assert.deepEqual(params.max_iterations, { value: 30, enforced: false })
})

test("C2 resolvePreset returns null for unknown preset and logs a warning", async (t) => {
  const tmp = makeTmp("harness-cli-unknown/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  const captured = captureConsoleError(t, () => {
    const params = cli.resolvePreset("Kein Preset Da", configDir)
    assert.equal(params, null)
  })
  captured.run()
  assert.ok(captured.lines.length >= 1, "expected a warning on console.error")
  assert.ok(
    captured.lines.join("\n").includes("Kein Preset Da"),
    "warning should name the failed preset"
  )
})

test("C3 resolvePreset returns null when config directory does not exist", async (t) => {
  const tmp = makeTmp("harness-cli-missingdir/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const captured = captureConsoleError(t, () => {
    assert.equal(cli.resolvePreset("Qwen Deep Coding", join(tmp, "nope")), null)
  })
  captured.run()
  assert.ok(captured.lines.length >= 1)
})

test("C4 resolvePreset returns null on invalid config file (CLI exit != 0)", async (t) => {
  const tmp = makeTmp("harness-cli-invalid/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = join(tmp, "configs")
  mkdirSync(configDir, { recursive: true })
  writeFileSync(join(configDir, "broken.yaml"), "name: [unclosed", { encoding: "utf-8", flag: "wx" })
  writeFileSync(
    join(configDir, "p.yaml"),
    "name: P\nharnesses:\n  - broken\n",
    { encoding: "utf-8", flag: "wx" }
  )
  const captured = captureConsoleError(t, () => {
    assert.equal(cli.resolvePreset("P", configDir), null)
  })
  captured.run()
  assert.ok(captured.lines.length >= 1)
})

test("C5 resolvePreset returns null when CLI output is not valid JSON", async (t) => {
  const tmp = makeTmp("harness-cli-badjson/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const fakePython = join(tmp, "fake-python.sh")
  writeFileSync(fakePython, "#!/bin/sh\necho 'not json at all'\nexit 0\n", { encoding: "utf-8" })
  chmodSync(fakePython, 0o755)
  withEnv(t, { HARNESS_PYTHON: fakePython })
  const captured = captureConsoleError(t, () => {
    assert.equal(cli.resolvePreset("X"), null)
  })
  captured.run()
  assert.ok(captured.lines.length >= 1)
})

test("C6 resolvePreset returns null on timeout (does not hang)", async (t) => {
  const tmp = makeTmp("harness-cli-timeout/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const fakePython = join(tmp, "fake-python-sleep.sh")
  writeFileSync(fakePython, "#!/bin/sh\nsleep 10\n", { encoding: "utf-8" })
  chmodSync(fakePython, 0o755)
  withEnv(t, { HARNESS_PYTHON: fakePython, HARNESS_CLI_TIMEOUT_MS: "400" })
  const captured = captureConsoleError(t, () => {
    const started = Date.now()
    assert.equal(cli.resolvePreset("X"), null)
    assert.ok(Date.now() - started < 5000, "timeout should trigger well before 5 s")
  })
  captured.run()
  assert.ok(captured.lines.length >= 1)
})

// ---------------------------------------------------------------------------
// D: "chat.params" Hook (Integration: Hook + Store + echte CLI)
// ---------------------------------------------------------------------------

test("D1 hook applies enforced params of the active preset (real CLI)", async (t) => {
  const tmp = makeTmp("harness-hook-apply/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  const storeFile = makeTmp("harness-hook-store/") + "/active-presets.json"
  withEnv(t, { HARNESS_PRESET_FILE: storeFile, HARNESS_CONFIG_DIR: configDir })
  store.setActivePreset("ses_e2e", "Qwen Deep Coding")

  const hooks = await HarnessPlugin({})
  const output = makeOutput()
  await hooks["chat.params"]({ sessionID: "ses_e2e" }, output)

  assert.equal(output.temperature, 1.0)
  assert.equal(output.topP, 0.95)
  assert.equal(output.options.thinking, "enabled")
  assert.equal(output.maxOutputTokens, 4096)
  assert.equal(output.options.max_iterations, undefined)
})

test("D2 hook leaves output untouched when no preset is active", async (t) => {
  withEnv(t, { HARNESS_PRESET_FILE: makeTmp("harness-hook-nopreset/") + "/active-presets.json" })
  const hooks = await HarnessPlugin({})
  const output = makeOutput()
  await hooks["chat.params"]({ sessionID: "ses_none" }, output)
  assert.equal(output.temperature, 0.7)
  assert.equal(output.topP, 0.9)
  assert.deepEqual(output.options, {})
})

test("D3 hook survives unknown preset: no throw, output untouched", async (t) => {
  const tmp = makeTmp("harness-hook-unknown/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  const storeFile = makeTmp("harness-hook-store2/") + "/active-presets.json"
  withEnv(t, { HARNESS_PRESET_FILE: storeFile, HARNESS_CONFIG_DIR: configDir })
  store.setActivePreset("ses_bad", "Preset Das Es Nicht Gibt")

  const hooks = await HarnessPlugin({})
  const output = makeOutput()
  await assert.doesNotReject(() => hooks["chat.params"]({ sessionID: "ses_bad" }, output))
  assert.equal(output.temperature, 0.7)
  assert.deepEqual(output.options, {})
})

test("D4 hook resolves to void (undefined) in all cases", async (t) => {
  withEnv(t, { HARNESS_PRESET_FILE: makeTmp("harness-hook-void/") + "/active-presets.json" })
  const hooks = await HarnessPlugin({})
  const result = await hooks["chat.params"]({ sessionID: "ses_x" }, makeOutput())
  assert.equal(result, undefined)
})

test("D5 hooks object exposes chat.params and event", async () => {
  const hooks = await HarnessPlugin({})
  assert.equal(typeof hooks["chat.params"], "function")
  assert.equal(typeof hooks.event, "function")
})

test("D6 model default is applied automatically through the real CLI", async (t) => {
  const tmp = makeTmp("harness-hook-model-default/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  const storeFile = join(tmp, "active-presets.json")
  withEnv(t, { HARNESS_PRESET_FILE: storeFile, HARNESS_CONFIG_DIR: configDir })
  const hooks = await HarnessPlugin({})
  const output = makeOutput()

  await hooks["chat.params"](
    { sessionID: "ses_model_default", model: { id: "qwen-3.8-27b" } },
    output,
  )

  assert.equal(store.getActivePreset("ses_model_default"), "Qwen Deep Coding")
  assert.equal(output.temperature, 1.0)
  assert.equal(output.options.thinking, "enabled")
})

test("D7 switching an automatic session to an unmapped model clears the automatic preset", async (t) => {
  const tmp = makeTmp("harness-hook-model-switch/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  const storeFile = join(tmp, "active-presets.json")
  withEnv(t, { HARNESS_PRESET_FILE: storeFile, HARNESS_CONFIG_DIR: configDir })
  const hooks = await HarnessPlugin({})

  await hooks["chat.params"](
    { sessionID: "ses_model_switch", model: { id: "qwen-3.8-27b" } },
    makeOutput(),
  )
  const output = makeOutput()
  await hooks["chat.params"](
    { sessionID: "ses_model_switch", model: { id: "unmapped-model" } },
    output,
  )

  assert.equal(store.getActivePreset("ses_model_switch"), undefined)
  assert.equal(output.temperature, 0.7)
  assert.deepEqual(output.options, {})
})

test("D8 compaction threshold hook exposes the active Long Context policy", async (t) => {
  const tmp = makeTmp("harness-hook-compaction/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  withEnv(t, { HARNESS_PRESET_FILE: join(tmp, "active-presets.json"), HARNESS_CONFIG_DIR: configDir })
  const hooks = await HarnessPlugin({})
  const output: { threshold?: number } = {}

  await hooks["experimental.session.compaction.threshold"](
    { sessionID: "ses_compaction", model: { id: "qwen-3.8-27b" } },
    output,
  )

  assert.equal(output.threshold, 0.8)
})

test("D9 an unmapped model does not inherit a compaction threshold", async (t) => {
  const tmp = makeTmp("harness-hook-compaction-none/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  withEnv(t, { HARNESS_PRESET_FILE: join(tmp, "active-presets.json"), HARNESS_CONFIG_DIR: configDir })
  const hooks = await HarnessPlugin({})
  const output: { threshold?: number } = {}

  await hooks["experimental.session.compaction.threshold"](
    { sessionID: "ses_compaction_none", model: { id: "unmapped-model" } },
    output,
  )

  assert.equal(output.threshold, undefined)
})
