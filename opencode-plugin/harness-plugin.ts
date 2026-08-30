import type { Plugin } from "@opencode-ai/plugin"
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { getActivePreset, setActivePreset } from "./harness-store.ts"
import { resolvePreset, listPresets } from "./harness-cli.ts"
import { applyEnforcedParams } from "./harness-params.ts"

const TDD_INSTRUCTION =
  "TDD MODE: Before writing any implementation code, write tests that cover the expected behavior including edge cases (empty input, boundary values, error cases). Implement the code only after the tests are written and define the expected failing state."

const TEST_FILE_PATTERNS = [
  /_test\.py$/,
  /^test_.*\.py$/,
  /\.test\.(ts|js|tsx|jsx)$/,
  /\.spec\.(ts|js|tsx|jsx)$/,
  /_test\.go$/,
  /^test_.*\.go$/,
  /_spec\.rb$/,
]

const TEST_RUNNER_PATTERNS = [
  /\bpytest\b/,
  /\bnpm\s+test\b/,
  /\bgo\s+test\b/,
  /\bbundle\s+exec\s+rake\b/,
  /\btox\b/,
  /\buv\s+run\s+pytest\b/,
]

function isTestFilePath(filePath: string): boolean {
  return TEST_FILE_PATTERNS.some((p) => p.test(filePath))
}

function isTestRunnerCommand(command: string): boolean {
  return TEST_RUNNER_PATTERNS.some((p) => p.test(command))
}

function isWriteEditTool(toolName: string): boolean {
  return ["write", "edit", "str_replace_editor"].includes(toolName)
}

/**
 * Ersetzt den Prompt-Inhalt eines Commands durch eine feste Ergebnis-Nachricht.
 * Mutiert das Array in-place (nicht `output.parts = [...]`), weil OpenCode
 * intern noch die urspruengliche Array-Referenz verwendet.
 */
function replacePartsWithMessage(parts: { type: string; text?: string }[], message: string): void {
  parts.length = 0
  parts.push({ type: "text", text: message })
}

function harnessSetResult(presetName: string, presets: string[] | null): { message: string; activate: boolean } {
  if (!presetName) {
    const message = presets && presets.length
      ? `Available Harness presets: ${presets.join(", ")}. Use /harness-set <presetName> to activate one.`
      : "No Harness presets are configured."
    return { message, activate: false }
  }
  if (presets && !presets.includes(presetName)) {
    const message = presets.length
      ? `Unknown Harness preset '${presetName}'. Available presets: ${presets.join(", ")}.`
      : `Unknown Harness preset '${presetName}'. No presets are configured.`
    return { message, activate: false }
  }
  return { message: `Harness preset '${presetName}' is now active for this session.`, activate: true }
}

const TDD_STATE_DIR = join(homedir(), ".config", "opencode-harness")
const TDD_STATE_FILE_KEY = "HARNESS_SESSION_STATE_FILE"

function tddStateFilePath(): string {
  return process.env[TDD_STATE_FILE_KEY] || join(TDD_STATE_DIR, "tdd-tracked.json")
}

function readTddState(): Record<string, { tested?: boolean }> {
  try {
    const parsed = JSON.parse(readFileSync(tddStateFilePath(), "utf-8"))
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed
  } catch {
    // missing or corrupted => empty state
  }
  return {}
}

function writeTddState(state: Record<string, { tested?: boolean }>): void {
  mkdirSync(dirname(tddStateFilePath()), { recursive: true })
  const tmp = `${tddStateFilePath()}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify(state, null, 2), { encoding: "utf-8" })
  renameSync(tmp, tddStateFilePath())
}

function getSessionTested(sessionID: string): boolean {
  return readTddState()[sessionID]?.tested === true
}

function markSessionTested(sessionID: string): void {
  const state = readTddState()
  state[sessionID] = { tested: true, trackedAt: Date.now() }
  writeTddState(state)
}

export const HarnessPlugin: Plugin = async (input) => {
  return {
    event: async ({ event }) => {
      // placeholder
    },
    "chat.params": async (chatInput, output) => {
      const activePreset = getActivePreset(chatInput.sessionID)
      if (!activePreset) return
      const params = resolvePreset(activePreset)
      if (!params) return
      applyEnforcedParams(params, output)
    },
    "command.execute.before": async (cmdInput, output) => {
      if (cmdInput.command !== "harness-set") return
      const presetName = cmdInput.arguments.trim()
      const presets = listPresets()
      const { message, activate } = harnessSetResult(presetName, presets)
      if (activate) setActivePreset(cmdInput.sessionID, presetName)
      if (output?.parts) replacePartsWithMessage(output.parts, message)
    },
    "experimental.chat.system.transform": async (sysInput, output) => {
      const activePreset = getActivePreset(sysInput.sessionID)
      if (!activePreset) return
      const params = resolvePreset(activePreset)
      if (!params) return
      const strategy = params.test_strategy
      if (strategy && typeof strategy === "object" && strategy.value === "generate_tdd") {
        output.system.push(TDD_INSTRUCTION)
      }
    },
    "tool.execute.before": async (toolInput, output) => {
      const activePreset = getActivePreset(toolInput.sessionID)
      if (!activePreset) return
      const params = resolvePreset(activePreset)
      if (!params) return
      const strategy = params.test_strategy
      if (!strategy || typeof strategy !== "object" || strategy.value !== "generate_tdd") return
      if (!isWriteEditTool(toolInput.tool)) return
      const args = toolInput.args as Record<string, any> || {}
      const filePath = args.path ?? args.file ?? args.filePath
      if (!filePath || typeof filePath !== "string") return
      if (isTestFilePath(filePath)) return
      if (getSessionTested(toolInput.sessionID)) return
      console.error(
        `[harness] WARNING: Writing to non-test file '${filePath}' in session '${toolInput.sessionID}`
          + ` with test_strategy=generate_tdd, but no test run has been executed yet.`
          + ` Follow TDD: write tests first, then implementation.`
      )
    },
    "tool.execute.after": async (toolInput, output) => {
      const activePreset = getActivePreset(toolInput.sessionID)
      if (!activePreset) return
      const params = resolvePreset(activePreset)
      if (!params) return
      const strategy = params.test_strategy
      if (!strategy || typeof strategy !== "object" || strategy.value !== "generate_tdd") return
      if (toolInput.tool !== "shell") return
      const args = toolInput.args as Record<string, any> || {}
      const command = args.command ?? args.cmd ?? args._
      if (typeof command !== "string") return
      if (isTestRunnerCommand(command)) {
        markSessionTested(toolInput.sessionID)
      }
    },
  }
}
export default HarnessPlugin
