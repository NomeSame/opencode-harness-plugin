/**
 * SOLL-Tests: End-to-End Full-Chain (TODO-029).
 *
 * Testet den kompletten Flow ohne laufenden OpenCode-Prozess:
 *   setActivePreset -> getActivePreset -> resolvePreset -> applyEnforcedParams
 *
 * Verwendet Umgebungsvariablen zur Steuerung von Store/CLI-Pfaden.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

const HERE = import.meta.dirname

// Top-level imports (module scope)
const store = await import("./harness-store.ts")
const cli = await import("./harness-cli.ts")
const pluginMod = await import("./harness-plugin.ts")
const { applyEnforcedParams } = await import("./harness-params.ts")
const { setActivePreset, getActivePreset, presetFilePath } = store
const { resolvePreset } = cli

function mkTempConfig(): string {
  const base = mkdtempSync(join(tmpdir(), "harness-e2e-"))
  writeFileSync(join(base, "qwen.yaml"), `
name: qwen
parameters:
  temperature: {value: 0.7, enforced: true}
  top_p: {value: 0.9, enforced: false}
  thinking: {value: enabled, enforced: true}
`, { encoding: "utf-8" })
  writeFileSync(join(base, "deep-coding.yaml"), `
name: E2E Test Preset
harnesses:
  - qwen
model: qwen-3.8-27b
`, { encoding: "utf-8" })
  return base
}

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

function makeOutput() {
  return {
    temperature: 1.0,
    topP: 1.0,
    topK: 40,
    maxOutputTokens: undefined as number | undefined,
    options: {} as Record<string, unknown>,
  }
}

// --- E2E Tests ---

test("E2E: full chain set->get->resolve->apply", () => {
  const tmpDir = mkTempConfig()
  const presetFile = join(tmpDir, "presets.json")

  try {
    withEnv({ HARNESS_PRESET_FILE: presetFile, HARNESS_CONFIG_DIR: tmpDir, HARNESS_CLI_TIMEOUT_MS: "5000" }, () => {
      const sessionID = "test-e2e-1"
      const presetName = "E2E Test Preset"

      // 1. Preset setzen
      setActivePreset(sessionID, presetName)
      assert.strictEqual(getActivePreset(sessionID), presetName)

      // 2. Preset auflösen
      const params = resolvePreset(presetName)
      assert.ok(params, "resolvePreset should return non-null")
      assert.ok("temperature" in params!)
      assert.deepStrictEqual(params!.temperature, { value: 0.7, enforced: true })

      // 3. Enforced params anwenden
      const output = makeOutput()
      applyEnforcedParams(params, output)

      assert.strictEqual(output.temperature, 0.7, "enforced temperature should override")
      assert.strictEqual(output.topP, 1.0, "non-enforced top_p should be unchanged")
      assert.strictEqual(output.options.thinking, "enabled", "non-top-level param goes to options")
    })
  } finally { rmSync(tmpDir, { recursive: true, force: true }) }
})

test("E2E: no preset set -> output unchanged", () => {
  const tmpDir = mkTempConfig()
  const presetFile = join(tmpDir, "presets.json")

  try {
    withEnv({ HARNESS_PRESET_FILE: presetFile, HARNESS_CONFIG_DIR: tmpDir }, () => {
      const output = makeOutput()
      applyEnforcedParams(null, output)

      assert.strictEqual(output.temperature, 1.0)
      assert.strictEqual(output.topP, 1.0)
      assert.strictEqual(output.topK, 40)
    })
  } finally { rmSync(tmpDir, { recursive: true, force: true }) }
})

test("E2E: resolve nonexistent preset returns null", () => {
  const tmpDir = mkTempConfig()
  const presetFile = join(tmpDir, "presets.json")

  try {
    withEnv({ HARNESS_PRESET_FILE: presetFile, HARNESS_CONFIG_DIR: tmpDir }, () => {
      const result = resolvePreset("Does Not Exist")
      assert.strictEqual(result, null, "should return null for unknown preset")
    })
  } finally { rmSync(tmpDir, { recursive: true, force: true }) }
})

test("E2E: two sessions are independent", () => {
  const tmpDir = mkTempConfig()
  const presetFile = join(tmpDir, "presets.json")

  try {
    withEnv({ HARNESS_PRESET_FILE: presetFile, HARNESS_CONFIG_DIR: tmpDir }, () => {
      // Session A: no preset
      assert.strictEqual(getActivePreset("session-a"), undefined)

      // Session B: preset set
      setActivePreset("session-b", "E2E Test Preset")
      assert.strictEqual(getActivePreset("session-b"), "E2E Test Preset")

      // Output A unchanged
      const outputA = makeOutput()
      applyEnforcedParams(null, outputA)
      assert.strictEqual(outputA.temperature, 1.0)

      // Output B overridden
      const outputB = makeOutput()
      applyEnforcedParams(resolvePreset("E2E Test Preset"), outputB)
      assert.strictEqual(outputB.temperature, 0.7)
    })
  } finally { rmSync(tmpDir, { recursive: true, force: true }) }
})

test("E2E: preset persists to file", () => {
  const tmpDir = mkTempConfig()
  const presetFile = join(tmpDir, "presets.json")

  try {
    withEnv({ HARNESS_PRESET_FILE: presetFile }, () => {
      setActivePreset("persist-test", "E2E Test Preset")

      // File should exist and be valid JSON
      const content = JSON.parse(readFileSync(presetFile, "utf-8"))
      assert.strictEqual(content["persist-test"], "E2E Test Preset")

      // getActivePreset reads from same file
      assert.strictEqual(getActivePreset("persist-test"), "E2E Test Preset")
    })
  } finally { rmSync(tmpDir, { recursive: true, force: true }) }
})

test("E2E: overwrite preset for same session", () => {
  const tmpDir = mkTempConfig()
  const presetFile = join(tmpDir, "presets.json")

  try {
    withEnv({ HARNESS_PRESET_FILE: presetFile }, () => {
      setActivePreset("overwrite", "First Preset")
      assert.strictEqual(getActivePreset("overwrite"), "First Preset")

      setActivePreset("overwrite", "Second Preset")
      assert.strictEqual(getActivePreset("overwrite"), "Second Preset")

      // File should have only the last one
      const content = JSON.parse(readFileSync(presetFile, "utf-8"))
      assert.strictEqual(content["overwrite"], "Second Preset")
      assert.strictEqual(Object.keys(content).length, 1)
    })
  } finally { rmSync(tmpDir, { recursive: true, force: true }) }
})

test("E2E: CLI timeout returns null (graceful degradation)", () => {
  const tmpDir = mkTempConfig()
  const presetFile = join(tmpDir, "presets.json")

  try {
    withEnv({ HARNESS_PRESET_FILE: presetFile, HARNESS_CONFIG_DIR: tmpDir, HARNESS_CLI_TIMEOUT_MS: "1" }, () => {
      const result = resolvePreset("E2E Test Preset")
      assert.strictEqual(result, null, "1ms timeout should cause null return, not throw")
    })
  } finally { rmSync(tmpDir, { recursive: true, force: true }) }
})

test("E2E: non-enforced params stay untouched in output", () => {
  const tmpDir = mkTempConfig()
  const presetFile = join(tmpDir, "presets.json")

  try {
    withEnv({ HARNESS_PRESET_FILE: presetFile, HARNESS_CONFIG_DIR: tmpDir, HARNESS_CLI_TIMEOUT_MS: "5000" }, () => {
      setActivePreset("clean", "E2E Test Preset")
      const params = resolvePreset("E2E Test Preset")

      assert.strictEqual(params!.top_p?.enforced, false, "top_p should NOT be enforced in config")

      const output = {
        temperature: 0.5,
        topP: 0.3,
        topK: 15,
        maxOutputTokens: 2048,
        options: {} as Record<string, unknown>,
      }
      applyEnforcedParams(params, output)

      assert.strictEqual(output.temperature, 0.7) // enforced: overridden
      assert.strictEqual(output.topP, 0.3) // NOT enforced: unchanged
      assert.strictEqual(output.topK, 15) // not in harness: unchanged
      assert.strictEqual(output.maxOutputTokens, 2048) // not in harness: unchanged
    })
  } finally { rmSync(tmpDir, { recursive: true, force: true }) }
})

test("E2E: preset file path env-var is respected", () => {
  const tmpDir = mkTempConfig()
  const presetFile = join(tmpDir, "custom", "path", "presets.json")

  try {
    withEnv({ HARNESS_PRESET_FILE: presetFile }, () => {
      // presetFilePath() should return our custom path
      assert.strictEqual(presetFilePath(), presetFile)

      setActivePreset("path-test", "E2E Test Preset")
      assert.strictEqual(getActivePreset("path-test"), "E2E Test Preset")
    })
  } finally { rmSync(tmpDir, { recursive: true, force: true }) }
})

test("E2E: config dir env-var is respected by resolvePreset", () => {
  const tmpDir = mkTempConfig()

  try {
    withEnv({ HARNESS_CONFIG_DIR: tmpDir }, () => {
      const result = resolvePreset("E2E Test Preset")
      assert.ok(result, "should resolve using HARNESS_CONFIG_DIR")
      assert.ok("temperature" in result!)
    })
  } finally { rmSync(tmpDir, { recursive: true, force: true }) }
})

test("E2E: multiple presets stored independently", () => {
  const tmpDir = mkTempConfig()
  const presetFile = join(tmpDir, "presets.json")

  try {
    withEnv({ HARNESS_PRESET_FILE: presetFile }, () => {
      setActivePreset("sess-1", "E2E Test Preset")
      setActivePreset("sess-2", "Another Preset Name")

      assert.strictEqual(getActivePreset("sess-1"), "E2E Test Preset")
      assert.strictEqual(getActivePreset("sess-2"), "Another Preset Name")

      const content = JSON.parse(readFileSync(presetFile, "utf-8"))
      assert.strictEqual(Object.keys(content).length, 2)
    })
  } finally { rmSync(tmpDir, { recursive: true, force: true }) }
})
