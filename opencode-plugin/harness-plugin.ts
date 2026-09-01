import type { Plugin } from "@opencode-ai/plugin";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { clearActivePreset, getActivePreset, setActivePreset } from "./harness-store.ts";
import { defaultPresetForModel, describePreset, editHarness, resolvePreset, listPresets } from "./harness-cli.ts";
import { applyEnforcedParams } from "./harness-params.ts";
import { Schema } from "effect";
import {
  HarnessStatePayload,
  type HarnessReadState,
} from "./harness-state-schema.ts";

const TDD_INSTRUCTION =
  "TDD MODE: Before writing any implementation code, write tests that cover the expected behavior including edge cases (empty input, boundary values, error cases). Implement the code only after the tests are written and define the expected failing state.";

const TEST_FILE_PATTERNS = [
  /_test\.py$/,
  /^test_.*\.py$/,
  /\.test\.(ts|js|tsx|jsx)$/,
  /\.spec\.(ts|js|tsx|jsx)$/,
  /_test\.go$/,
  /^test_.*\.go$/,
  /_spec\.rb$/,
];

const TEST_RUNNER_PATTERNS = [
  /\bpytest\b/,
  /\bnpm\s+test\b/,
  /\bgo\s+test\b/,
  /\bbundle\s+exec\s+rake\b/,
  /\btox\b/,
  /\buv\s+run\s+pytest\b/,
];

function isTestFilePath(filePath: string): boolean {
  return TEST_FILE_PATTERNS.some((p) => p.test(filePath));
}

function isTestRunnerCommand(command: string): boolean {
  return TEST_RUNNER_PATTERNS.some((p) => p.test(command));
}

function isWriteEditTool(toolName: string): boolean {
  return ["write", "edit", "str_replace_editor"].includes(toolName);
}

/**
 * Ersetzt den Prompt-Inhalt eines Commands durch eine feste Ergebnis-Nachricht.
 * Mutiert das Array in-place (nicht `output.parts = [...]`), weil OpenCode
 * intern noch die urspruengliche Array-Referenz verwendet.
 */
function replacePartsWithMessage(
  parts: { type: string; text?: string }[],
  message: string,
): void {
  parts.length = 0;
  parts.push({ type: "text", text: message });
}

function harnessSetResult(
  presetName: string,
  presets: string[] | null,
): { message: string; activate: boolean } {
  if (!presetName) {
    const message =
      presets && presets.length
        ? `Available Harness presets: ${presets.join(", ")}. Use /harness-set <presetName> to activate one.`
        : "No Harness presets are configured.";
    return { message, activate: false };
  }
  if (presets && !presets.includes(presetName)) {
    const message = presets.length
      ? `Unknown Harness preset '${presetName}'. Available presets: ${presets.join(", ")}.`
      : `Unknown Harness preset '${presetName}'. No presets are configured.`;
    return { message, activate: false };
  }
  return {
    message: `Harness preset '${presetName}' is now active for this session.`,
    activate: true,
  };
}

const TDD_STATE_DIR = join(homedir(), ".config", "opencode-harness");
const TDD_STATE_FILE_KEY = "HARNESS_SESSION_STATE_FILE";

function tddStateFilePath(): string {
  return (
    process.env[TDD_STATE_FILE_KEY] || join(TDD_STATE_DIR, "tdd-tracked.json")
  );
}

function readTddState(): Record<string, { tested?: boolean }> {
  try {
    const parsed = JSON.parse(readFileSync(tddStateFilePath(), "utf-8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      return parsed;
  } catch {
    // missing or corrupted => empty state
  }
  return {};
}

function writeTddState(state: Record<string, { tested?: boolean }>): void {
  mkdirSync(dirname(tddStateFilePath()), { recursive: true });
  const tmp = `${tddStateFilePath()}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(state, null, 2), { encoding: "utf-8" });
  renameSync(tmp, tddStateFilePath());
}

function getSessionTested(sessionID: string): boolean {
  return readTddState()[sessionID]?.tested === true;
}

function markSessionTested(sessionID: string): void {
  const state = readTddState();
  state[sessionID] = { tested: true, trackedAt: Date.now() };
  writeTddState(state);
}

function clearSessionTested(sessionID: string): void {
  const state = readTddState();
  if (!state[sessionID]?.tested) return;
  state[sessionID] = { tested: false, trackedAt: Date.now() };
  writeTddState(state);
}

const HARNESS_NAMESPACE = "harness";

// Automatic model defaults are tracked separately from the persisted active
// preset. A persisted preset without this marker is treated as a manual user
// choice, so a restart cannot silently replace it.
const automaticPresetBySession = new Map<string, { presetName: string; modelID: string }>();
const manualPresetSessions = new Set<string>();

function modelIDs(model: any): string[] {
  return [model?.id, model?.modelID, model?.api?.id].filter(
    (value, index, values): value is string => typeof value === "string" && value.length > 0 && values.indexOf(value) === index,
  );
}

function activePresetForModel(sessionID: string, model: any): string | undefined {
  const ids = modelIDs(model);
  const currentModelID = ids[0];
  const stored = getActivePreset(sessionID);
  const automatic = automaticPresetBySession.get(sessionID);

  if (manualPresetSessions.has(sessionID) || (stored && !automatic)) return stored;
  if (automatic && stored && automatic.modelID === currentModelID) return stored;

  const defaultName = ids.map((id) => defaultPresetForModel(id)).find((name): name is string => !!name);
  if (!defaultName) {
    if (automatic) clearActivePreset(sessionID);
    automaticPresetBySession.delete(sessionID);
    return undefined;
  }
  setActivePreset(sessionID, defaultName);
  automaticPresetBySession.set(sessionID, { presetName: defaultName, modelID: currentModelID ?? ids[0] ?? "" });
  return defaultName;
}

export const HarnessPlugin: Plugin = async (input) => {
  return {
    event: async ({ event }) => {
      // placeholder
    },
    "chat.params": async (chatInput, output) => {
      const activePreset = activePresetForModel(chatInput.sessionID, chatInput.model);
      if (!activePreset) return;
      const params = resolvePreset(activePreset);
      if (!params) return;
      applyEnforcedParams(params, output);
    },
    "experimental.session.compaction.threshold": async (compactionInput, output) => {
      const activePreset = activePresetForModel(compactionInput.sessionID, compactionInput.model);
      if (!activePreset) return;
      const params = resolvePreset(activePreset);
      const threshold = params?.compaction_threshold;
      if (!threshold || typeof threshold !== "object") return;
      if (typeof threshold.value !== "number" || !Number.isFinite(threshold.value)) return;
      if (threshold.value < 0 || threshold.value > 1) return;
      output.threshold = threshold.value;
    },
    "experimental.session.before_finish": async (finishInput, output) => {
      const activePreset = activePresetForModel(finishInput.sessionID, finishInput.model);
      if (!activePreset) return;
      const params = resolvePreset(activePreset);
      const strategy = params?.test_strategy;
      if (!strategy || typeof strategy !== "object") return;
      if (strategy.value !== "generate_tdd" && strategy.value !== "run_existing") return;
      const configured = params?.test_execution_before_finishing;
      if (configured && typeof configured === "object" && configured.value === false) return;
      if (getSessionTested(finishInput.sessionID)) return;
      output.allow = false;
      output.reason = "A passing test run is required before finishing this Harness task.";
    },
    "command.execute.before": async (cmdInput, output) => {
      if (cmdInput.command === "harness-edit") {
        const activePreset = getActivePreset(cmdInput.sessionID);
        let message = "No active Harness preset is available to edit.";
        try {
          const request = JSON.parse(cmdInput.arguments) as {
            harness?: unknown;
            parameter?: unknown;
            value?: unknown;
            enforced?: unknown;
          };
          const detail = activePreset ? describePreset(activePreset) : null;
          if (
            detail &&
            typeof request.harness === "string" &&
            detail.harnesses.includes(request.harness) &&
            typeof request.parameter === "string" &&
            typeof request.value === "string" &&
            typeof request.enforced === "boolean"
          ) {
            const saved = editHarness(request.harness, request.parameter, request.value, request.enforced);
            message = saved
              ? `Harness '${request.harness}' was saved. Re-open Switch harness to reload '${activePreset}'.`
              : `Failed to save Harness '${request.harness}'. The existing file was left unchanged.`;
          } else {
            message = "Invalid edit request. Choose a harness from the active preset and provide a Python literal value.";
          }
        } catch {
          message = "Invalid edit request. Use JSON with harness, parameter, value and enforced fields.";
        }
        if (output?.parts) replacePartsWithMessage(output.parts, message);
        output.noReply = true;
        return;
      }
      if (cmdInput.command !== "harness-set") return;
      const presetName = cmdInput.arguments.trim();
      const presets = listPresets();
      const { message, activate } = harnessSetResult(presetName, presets);
      if (activate) {
        setActivePreset(cmdInput.sessionID, presetName);
        manualPresetSessions.add(cmdInput.sessionID);
        automaticPresetBySession.delete(cmdInput.sessionID);
      }
      if (output?.parts) replacePartsWithMessage(output.parts, message);
      // The command is a state operation. Its confirmation must be persisted
      // as a user message without starting an agent loop.
      output.noReply = true;
    },
    "session.state.read": async (stateInput, output) => {
      if (stateInput.namespace !== HARNESS_NAMESPACE) return;
      const presets = listPresets() ?? [];
      const activePreset = getActivePreset(stateInput.sessionID);
      // The generic response payload is opaque JSON, so undefined keys must
      // not be emitted (Schema.Unknown rejects them as non-JSON values).
      output.payload = {
        ...(activePreset !== undefined ? { activePreset } : {}),
        presets,
      } satisfies HarnessReadState;
    },
    "plugin.state.read": async (stateInput, output) => {
      if (stateInput.namespace !== HARNESS_NAMESPACE) return;
      const presets = listPresets();
      if (presets === null) throw new Error("Unable to read Harness presets.");
      const details = Object.fromEntries(
        presets.flatMap((preset) => {
          const detail = describePreset(preset);
          return detail ? [[preset, detail]] : [];
        }),
      );
      output.payload = { presets, details } satisfies Pick<HarnessReadState, "presets" | "details">;
    },
    "session.state.write": async (stateInput) => {
      if (stateInput.namespace !== HARNESS_NAMESPACE) return;
      // Throwing here is the reject path: Core has no Harness-specific error
      // channel for this generic hook, so any thrown error becomes a clean
      // 400 at the HTTP boundary (see SessionHttpApi.stateWrite).
      const decoded = Schema.decodeUnknownSync(HarnessStatePayload)(
        stateInput.payload,
      );
      if (decoded.activePreset === undefined) return;
      const presets = listPresets();
      if (presets && !presets.includes(decoded.activePreset)) {
        throw new Error(
          `Unknown Harness preset '${decoded.activePreset}'. Available presets: ${presets.join(", ")}.`,
        );
      }
      // testStrategy/compactionThreshold are validated above but have no
      // dedicated store yet — harness-store.ts remains the sole source of
      // truth for activePreset, and no new storage is introduced for them.
      setActivePreset(stateInput.sessionID, decoded.activePreset);
      manualPresetSessions.add(stateInput.sessionID);
      automaticPresetBySession.delete(stateInput.sessionID);
    },
    "experimental.chat.system.transform": async (sysInput, output) => {
      const activePreset = sysInput.sessionID
        ? activePresetForModel(sysInput.sessionID, sysInput.model)
        : undefined;
      if (!activePreset) return;
      const params = resolvePreset(activePreset);
      if (!params) return;
      const strategy = params.test_strategy;
      if (
        strategy &&
        typeof strategy === "object" &&
        strategy.value === "generate_tdd"
      ) {
        output.system.push(TDD_INSTRUCTION);
      }
    },
    "tool.execute.before": async (toolInput, output) => {
      const activePreset = getActivePreset(toolInput.sessionID);
      if (!activePreset) return;
      const params = resolvePreset(activePreset);
      if (!params) return;
      const strategy = params.test_strategy;
      if (
        !strategy ||
        typeof strategy !== "object" ||
        strategy.value !== "generate_tdd"
      )
        return;
      if (!isWriteEditTool(toolInput.tool)) return;
      const args = (toolInput.args as Record<string, any>) || {};
      const filePath = args.path ?? args.file ?? args.filePath;
      if (!filePath || typeof filePath !== "string") return;
      if (isTestFilePath(filePath)) return;
      if (getSessionTested(toolInput.sessionID)) {
        clearSessionTested(toolInput.sessionID);
        return;
      }
      console.error(
        `[harness] WARNING: Writing to non-test file '${filePath}' in session '${toolInput.sessionID}` +
          ` with test_strategy=generate_tdd, but no test run has been executed yet.` +
          ` Follow TDD: write tests first, then implementation.`,
      );
      throw new Error(
        `TDD order violation: run the generated tests before writing implementation file '${filePath}'.`,
      );
    },
    "tool.execute.after": async (toolInput, output) => {
      const activePreset = getActivePreset(toolInput.sessionID);
      if (!activePreset) return;
      const params = resolvePreset(activePreset);
      if (!params) return;
      const strategy = params.test_strategy;
      if (
        !strategy ||
        typeof strategy !== "object" ||
        strategy.value !== "generate_tdd"
      )
        return;
      if (toolInput.tool !== "shell") return;
      const args = (toolInput.args as Record<string, any>) || {};
      const command = args.command ?? args.cmd ?? args._;
      if (typeof command !== "string") return;
      if (isTestRunnerCommand(command)) {
        const metadata = output.metadata;
        const exitCode =
          metadata && typeof metadata === "object" && "exit" in metadata
            ? (metadata as { exit?: unknown }).exit
            : undefined;
        if (typeof exitCode === "number" && exitCode !== 0) {
          clearSessionTested(toolInput.sessionID);
          return;
        }
        markSessionTested(toolInput.sessionID);
      }
    },
  };
};
export default HarnessPlugin;
