/**
 * SOLL-Tests für TODO-028: `/harness-set <presetName>` Command via `command.execute.before` Hook.
 *
 * SOLL:
 *   HarnessPlugin registriert einen "command.execute.before"-Hook.
 *   Wenn input.command === "harness-set":
 *     - input.arguments wird als presetName interpretiert (whitespace getrimmt).
 *     - setActivePreset(sessionID, presetName) wird aufgerufen.
 *     - output.parts wird durch eine Text-Ergebnis-Nachricht ersetzt
 *       (seit TODO-038/039, siehe harness-038_test.ts fuer Details).
 *     - Hook resolved to undefined (void).
 *   Fuer andere commands: output unveraendert, keine side-effects.
 *   Fuer leeren arguments-string: setActivePreset wird NICHT aufgerufen
 *     (null/leerer presetName ist kein valider preset).
 *   Fehler in setActivePreset werden nicht geworfen (YAGNI — simple JSON-File).
 */

import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const store = await import("./harness-store.ts")
const cli = await import("./harness-cli.ts")
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

function makeOutputParts() {
  return { parts: [] as unknown[] }
}

function makeConfigDir(base: string): string {
  const dir = join(base, "configs")
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "qwen.yaml"), "name: qwen\nparameters:\n  temperature: {value: 1.0, enforced: true}\n", { encoding: "utf-8" })
  writeFileSync(join(dir, "coding.yaml"), "name: coding\nparameters:\n  max_iterations: {value: 30, enforced: false}\n", { encoding: "utf-8" })
  writeFileSync(join(dir, "alpha.yaml"), "name: Alpha Preset\nharnesses:\n  - qwen\n", { encoding: "utf-8" })
  return dir
}

// ---------------------------------------------------------------------------
// E: "command.execute.before" — harness-set
// ---------------------------------------------------------------------------

test("E1 command.execute.before auf 'harness-set' setzt aktives Preset", async (t) => {
  const storeFile = makeTmp("harness-cmd-store/") + "/active-presets.json"
  withEnv(t, { HARNESS_PRESET_FILE: storeFile })
  const hooks = await HarnessPlugin({})
  const output = makeOutputParts()
  const input = { sessionID: "ses_cmd1", command: "harness-set", arguments: "Qwen Deep Coding" }
  await hooks["command.execute.before"](input, output)
  assert.equal(store.getActivePreset("ses_cmd1"), "Qwen Deep Coding")
})

test("E2 command.execute.before trimmed whitespace aus arguments", async (t) => {
  const storeFile = makeTmp("harness-cmd-store2/") + "/active-presets.json"
  withEnv(t, { HARNESS_PRESET_FILE: storeFile })
  const hooks = await HarnessPlugin({})
  const output = makeOutputParts()
  const input = { sessionID: "ses_cmd2", command: "harness-set", arguments: "  Qwen Deep Coding  " }
  await hooks["command.execute.before"](input, output)
  assert.equal(store.getActivePreset("ses_cmd2"), "Qwen Deep Coding")
})

test("E3 command.execute.before: anderer command → kein side-effect", async (t) => {
  withEnv(t, { HARNESS_PRESET_FILE: makeTmp("harness-cmd-noside/") + "/active-presets.json" })
  const hooks = await HarnessPlugin({})
  const output = makeOutputParts()
  const input = { sessionID: "ses_cmd3", command: "help", arguments: "foo" }
  await hooks["command.execute.before"](input, output)
  assert.equal(store.getActivePreset("ses_cmd3"), undefined)
})

test("E4 command.execute.before: leerer arguments-string → kein setActivePreset", async (t) => {
  const storeFile = makeTmp("harness-cmd-empty/") + "/active-presets.json"
  withEnv(t, { HARNESS_PRESET_FILE: storeFile })
  const hooks = await HarnessPlugin({})
  const output = makeOutputParts()
  const input = { sessionID: "ses_cmd4", command: "harness-set", arguments: "" }
  await hooks["command.execute.before"](input, output)
  assert.equal(store.getActivePreset("ses_cmd4"), undefined)
})

test("E5 command.execute.before: arguments nur whitespace → kein setActivePreset", async (t) => {
  const storeFile = makeTmp("harness-cmd-ws/") + "/active-presets.json"
  withEnv(t, { HARNESS_PRESET_FILE: storeFile })
  const hooks = await HarnessPlugin({})
  const output = makeOutputParts()
  const input = { sessionID: "ses_cmd5", command: "harness-set", arguments: "   " }
  await hooks["command.execute.before"](input, output)
  assert.equal(store.getActivePreset("ses_cmd5"), undefined)
})

test("E6 command.execute.before: output.parts wird durch Ergebnis-Nachricht ersetzt (TODO-038/039)", async (t) => {
  withEnv(t, { HARNESS_PRESET_FILE: makeTmp("harness-cmd-parts/") + "/active-presets.json" })
  const hooks = await HarnessPlugin({})
  const output = { parts: [{ type: "text", content: "original" }] }
  const input = { sessionID: "ses_cmd6", command: "harness-set", arguments: "P" }
  await hooks["command.execute.before"](input, output)
  assert.equal(output.parts.length, 1)
  assert.equal((output.parts[0] as { type: string }).type, "text")
})

test("E7 command.execute.before: resolve to void (undefined)", async (t) => {
  withEnv(t, { HARNESS_PRESET_FILE: makeTmp("harness-cmd-void/") + "/active-presets.json" })
  const hooks = await HarnessPlugin({})
  const result = await hooks["command.execute.before"](
    { sessionID: "ses_x", command: "harness-set", arguments: "P" },
    makeOutputParts()
  )
  assert.equal(result, undefined)
})

test("E8 command.execute.before: Hooks-Objekt exposes 'command.execute.before'", async (t) => {
  withEnv(t, { HARNESS_PRESET_FILE: makeTmp("harness-cmd-expose/") + "/active-presets.json" })
  const hooks = await HarnessPlugin({})
  assert.equal(typeof hooks["command.execute.before"], "function")
})

test("E9 harness-set marks the command result as noReply", async (t) => {
  withEnv(t, { HARNESS_PRESET_FILE: makeTmp("harness-cmd-no-reply/") + "/active-presets.json" })
  const hooks = await HarnessPlugin({})
  const output = makeOutputParts() as { parts: unknown[]; noReply?: boolean }

  await hooks["command.execute.before"](
    { sessionID: "ses_cmd_no_reply", command: "harness-set", arguments: "P" },
    output,
  )

  assert.equal(output.noReply, true)
})

test("E10 harness-edit persists a selected preset's existing harness file", async (t) => {
  const tmp = makeTmp("harness-cmd-edit/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  const storeFile = join(tmp, "active-presets.json")
  withEnv(t, { HARNESS_PRESET_FILE: storeFile, HARNESS_CONFIG_DIR: configDir })
  store.setActivePreset("ses_cmd_edit", "Alpha Preset")
  const hooks = await HarnessPlugin({})
  const output = makeOutputParts() as { parts: unknown[]; noReply?: boolean }

  await hooks["command.execute.before"](
    {
      sessionID: "ses_cmd_edit",
      command: "harness-edit",
      arguments: JSON.stringify({ harness: "qwen", parameter: "temperature", value: "0.5", enforced: false }),
    },
    output,
  )

  assert.equal(output.noReply, true)
  const source = readFileSync(join(configDir, "qwen.yaml"), "utf-8")
  assert.match(source, /value: 0\.5/)
  assert.doesNotMatch(source, /enforced: true/)
  assert.equal(cli.resolvePreset("Alpha Preset", configDir)?.temperature?.value, 0.5)
})

test("E11 harness-edit persists composition removal and keeps the preset selectable", async (t) => {
  const tmp = makeTmp("harness-cmd-composition-remove/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  const storeFile = join(tmp, "active-presets.json")
  withEnv(t, { HARNESS_PRESET_FILE: storeFile, HARNESS_CONFIG_DIR: configDir })
  const hooks = await HarnessPlugin({})
  const output = makeOutputParts() as { parts: unknown[]; noReply?: boolean }

  await hooks["command.execute.before"](
    {
      sessionID: "ses_cmd_remove",
      command: "harness-edit",
      arguments: JSON.stringify({ preset: "Alpha Preset", operation: "remove", harness: "qwen" }),
    },
    output,
  )

  assert.equal(output.noReply, true)
  assert.doesNotMatch(readFileSync(join(configDir, "alpha.yaml"), "utf-8"), /- qwen/)
  assert.deepEqual(cli.describePreset("Alpha Preset", configDir)?.harnesses, [])
  assert.deepEqual(cli.listPresets(configDir), ["Alpha Preset"])
})

test("E12 harness-edit persists additions once and rejects an unknown harness without saving it", async (t) => {
  const tmp = makeTmp("harness-cmd-composition-add/")
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const configDir = makeConfigDir(tmp)
  const storeFile = join(tmp, "active-presets.json")
  withEnv(t, { HARNESS_PRESET_FILE: storeFile, HARNESS_CONFIG_DIR: configDir })
  const hooks = await HarnessPlugin({})

  for (const harness of ["coding", "coding", "ghost"]) {
    const output = makeOutputParts() as { parts: unknown[]; noReply?: boolean }
    await hooks["command.execute.before"](
      {
        sessionID: "ses_cmd_add",
        command: "harness-edit",
        arguments: JSON.stringify({ preset: "Alpha Preset", operation: "add", harness }),
      },
      output,
    )
    assert.equal(output.noReply, true)
    if (harness === "ghost") {
      assert.match(JSON.stringify(output.parts), /HARNESS_EDIT_ERROR/)
    }
  }

  assert.deepEqual(cli.describePreset("Alpha Preset", configDir)?.harnesses, ["qwen", "coding"])
  assert.deepEqual(cli.listPresets(configDir), ["Alpha Preset"])
})
