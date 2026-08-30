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
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
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

function makeOutputParts() {
  return { parts: [] as unknown[] }
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
