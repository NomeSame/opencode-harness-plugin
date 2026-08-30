/**
 * SOLL-Tests für TODO-033: `experimental.chat.system.transform`-Hook (TDD-Prompt-Injection).
 *
 * SOLL:
 *   HarnessPlugin registriert "experimental.chat.system.transform"-Hook.
 *   Wenn das aktive Preset test_strategy === "generate_tdd" (Value-Gleichheit,
 *   unabhaengig von enforced): wird eine TDD-Instruction an output.system
 *   angehaengt.
 *   Fuer andere test_strategy-Werte: output.system unveraendert.
 *   Kein aktives Preset: output.system unveraendert.
 *   Fehler im Resolve: output.system unveraendert, keine Exception.
 *   Hook loest auf undefined auf (void).
 *
 * TDD-Instruction (SOLL-String, wird angehaengt):
 *   "TDD MODE: Before writing any implementation code, write tests that cover
 *    the expected behavior including edge cases (empty input, boundary values,
 *    error cases). Implement the code only after the tests are written and
 *    define the expected failing state."
 */

import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
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
    join(dir, "qwen.yaml"),
    "name: qwen\nparameters:\n  temperature: {value: 1.0, enforced: true}\n",
    { encoding: "utf-8", flag: "wx" }
  )
  writeFileSync(
    join(dir, "tdd.yaml"),
    "name: tdd\nparameters:\n  test_strategy: {value: generate_tdd, enforced: true}\n",
    { encoding: "utf-8", flag: "wx" }
  )
  writeFileSync(
    join(dir, "testing.yaml"),
    "name: testing\nparameters:\n  test_strategy: {value: run_existing, enforced: false}\n",
    { encoding: "utf-8", flag: "wx" }
  )
  writeFileSync(
    join(dir, "qwen_deep_coding.yaml"),
    "name: Qwen Deep Coding\nharnesses:\n  - qwen\n  - tdd\n",
    { encoding: "utf-8", flag: "wx" }
  )
  writeFileSync(
    join(dir, "run_existing_preset.yaml"),
    "name: Run Existing\nharnesses:\n  - testing\n",
    { encoding: "utf-8", flag: "wx" }
  )
  writeFileSync(
    join(dir, "disabled_test.yaml"),
    "name: disabled_test\nparameters:\n  test_strategy: {value: disabled}\n",
    { encoding: "utf-8", flag: "wx" }
  )
  return dir
}

function makeOutput() {
  return { system: [] as string[] }
}

// ---------------------------------------------------------------------------
// F: "experimental.chat.system.transform" — TDD injection
// ---------------------------------------------------------------------------

test("F1 hook haengt TDD-Instruction an wenn test_strategy=generate_tdd", async (t) => {
  const tmp = makeTmp("harness-transform-apply/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  const storeFile = makeTmp("harness-transform-store/") + "/active-presets.json"
  withEnv(t, { HARNESS_PRESET_FILE: storeFile, HARNESS_CONFIG_DIR: configDir })
  store.setActivePreset("ses_tdd", "Qwen Deep Coding")

  const hooks = await HarnessPlugin({})
  const output = makeOutput()
  await hooks["experimental.chat.system.transform"](
    { sessionID: "ses_tdd" },
    output
  )

  assert.ok(
    output.system.length >= 1,
    "TDD instruction should be appended to output.system"
  )
  assert.ok(
    output.system[0].toLowerCase().includes("tdd"),
    "instruction should contain 'TDD'"
  )
  assert.ok(
    output.system[0].toLowerCase().includes("edge cases"),
    "instruction should mention edge cases"
  )
})

test("F2 hook lässt output.system unveraendert bei test_strategy=run_existing", async (t) => {
  const tmp = makeTmp("harness-transform-existing/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  const storeFile = makeTmp("harness-transform-store2/") + "/active-presets.json"
  withEnv(t, { HARNESS_PRESET_FILE: storeFile, HARNESS_CONFIG_DIR: configDir })
  store.setActivePreset("ses_existing", "Run Existing")

  const hooks = await HarnessPlugin({})
  const output = makeOutput()
  await hooks["experimental.chat.system.transform"](
    { sessionID: "ses_existing" },
    output
  )

  assert.equal(output.system.length, 0)
})

test("F3 hook lässt output.system unveraendert bei test_strategy=disabled", async (t) => {
  const tmp = makeTmp("harness-transform-disabled/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  const storeFile = makeTmp("harness-transform-store3/") + "/active-presets.json"
  withEnv(t, { HARNESS_PRESET_FILE: storeFile, HARNESS_CONFIG_DIR: configDir })
  store.setActivePreset("ses_disabled", "disabled_test")

  const hooks = await HarnessPlugin({})
  const output = makeOutput()
  await hooks["experimental.chat.system.transform"](
    { sessionID: "ses_disabled" },
    output
  )

  assert.equal(output.system.length, 0)
})

test("F4 hook lässt output.system unveraendert wenn kein Preset aktiv", async (t) => {
  withEnv(t, { HARNESS_PRESET_FILE: makeTmp("harness-transform-nopreset/") + "/active-presets.json" })
  const hooks = await HarnessPlugin({})
  const output = makeOutput()
  await hooks["experimental.chat.system.transform"](
    { sessionID: "ses_none" },
    output
  )

  assert.equal(output.system.length, 0)
})

test("F5 hook toleriert unbekanntes Preset ohne Exception", async (t) => {
  const tmp = makeTmp("harness-transform-unknown/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  const storeFile = makeTmp("harness-transform-store4/") + "/active-presets.json"
  withEnv(t, { HARNESS_PRESET_FILE: storeFile, HARNESS_CONFIG_DIR: configDir })
  store.setActivePreset("ses_unknown", "Nicht Existierend")

  const hooks = await HarnessPlugin({})
  const output = makeOutput()
  await assert.doesNotReject(() =>
    hooks["experimental.chat.system.transform"]({ sessionID: "ses_unknown" }, output)
  )
  assert.equal(output.system.length, 0)
})

test("F6 output.system mit Vorbeleg bleibt erhalten (append)", async (t) => {
  const tmp = makeTmp("harness-transform-append/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  const storeFile = makeTmp("harness-transform-store5/") + "/active-presets.json"
  withEnv(t, { HARNESS_PRESET_FILE: storeFile, HARNESS_CONFIG_DIR: configDir })
  store.setActivePreset("ses_append", "Qwen Deep Coding")

  const hooks = await HarnessPlugin({})
  const output = { system: ["bereits existierende system instruction"] }
  await hooks["experimental.chat.system.transform"](
    { sessionID: "ses_append" },
    output
  )

  assert.equal(output.system.length, 2, "should have 2 entries: original + TDD")
  assert.equal(output.system[0], "bereits existierende system instruction")
  assert.ok(output.system[1].toLowerCase().includes("tdd"))
})

test("F7 hook resolves to void (undefined)", async (t) => {
  withEnv(t, { HARNESS_PRESET_FILE: makeTmp("harness-transform-void/") + "/active-presets.json" })
  const hooks = await HarnessPlugin({})
  const result = await hooks["experimental.chat.system.transform"](
    { sessionID: "ses_x" },
    makeOutput()
  )
  assert.equal(result, undefined)
})

test("F8 Hook exposes 'experimental.chat.system.transform'", async () => {
  const hooks = await HarnessPlugin({})
  assert.equal(typeof hooks["experimental.chat.system.transform"], "function")
})

test("F9 TDD-Instruction ist derselbe feste String (Determinismus)", async (t) => {
  const tmp = makeTmp("harness-transform-determ/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  const storeFile = makeTmp("harness-transform-store6/") + "/active-presets.json"
  withEnv(t, { HARNESS_PRESET_FILE: storeFile, HARNESS_CONFIG_DIR: configDir })
  store.setActivePreset("ses_determ", "Qwen Deep Coding")

  const hooks = await HarnessPlugin({})

  const output1 = makeOutput()
  await hooks["experimental.chat.system.transform"]({ sessionID: "ses_d" }, output1)

  const output2 = makeOutput()
  await hooks["experimental.chat.system.transform"]({ sessionID: "ses_d" }, output2)

  assert.equal(output1.system[0], output2.system[0], "TDD instruction must be deterministic")
})
