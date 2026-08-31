/**
 * Tests for the generic session.state.read/write hooks (namespace "harness").
 * Uses the same env-var isolation pattern as harness-e2e-test.ts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const pluginMod = await import("./harness-plugin.ts");
const { HarnessPlugin } = pluginMod;
const hooks: any = await HarnessPlugin({} as any);

function mkTempConfig(): string {
  const base = mkdtempSync(join(tmpdir(), "harness-state-hooks-"));
  writeFileSync(
    join(base, "qwen.yaml"),
    `
name: qwen
parameters:
  temperature: {value: 0.7, enforced: true}
`,
    { encoding: "utf-8" },
  );
  writeFileSync(
    join(base, "deep-coding.yaml"),
    `
name: Qwen Deep Coding
harnesses:
  - qwen
model: qwen-3.8-27b
`,
    { encoding: "utf-8" },
  );
  return base;
}

function withEnv(
  partial: Record<string, string | undefined>,
  fn: () => void,
): void {
  const old: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(partial)) {
    old[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(old)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("session.state.read: ignores non-harness namespace", () => {
  const tmpDir = mkTempConfig();
  try {
    withEnv(
      {
        HARNESS_CONFIG_DIR: tmpDir,
        HARNESS_PRESET_FILE: join(tmpDir, "presets.json"),
      },
      () => {
        const output: { payload: unknown } = { payload: "untouched" };
        hooks["session.state.read"](
          { sessionID: "s1", namespace: "other" },
          output,
        );
        assert.strictEqual(
          output.payload,
          "untouched",
          "non-harness namespace must not be touched",
        );
      },
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("session.state.read: returns presets and activePreset for harness namespace", () => {
  const tmpDir = mkTempConfig();
  try {
    withEnv(
      {
        HARNESS_CONFIG_DIR: tmpDir,
        HARNESS_PRESET_FILE: join(tmpDir, "presets.json"),
      },
      () => {
        const output: { payload: unknown } = { payload: null };
        hooks["session.state.read"](
          { sessionID: "s1", namespace: "harness" },
          output,
        );
        assert.deepStrictEqual(output.payload, {
          presets: ["Qwen Deep Coding"],
        });
        assert.strictEqual((output.payload as any).activePreset, undefined);
      },
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("plugin.state.read: returns the global Harness catalog without active session state", () => {
  const tmpDir = mkTempConfig();
  try {
    withEnv(
      {
        HARNESS_CONFIG_DIR: tmpDir,
        HARNESS_PRESET_FILE: join(tmpDir, "presets.json"),
      },
      () => {
        const output: { payload: unknown } = { payload: null };
        hooks["plugin.state.read"]({ namespace: "harness" }, output);
        assert.deepStrictEqual(output.payload, {
          presets: ["Qwen Deep Coding"],
        });
      },
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("plugin.state.read: ignores non-harness namespace", () => {
  const tmpDir = mkTempConfig();
  try {
    withEnv(
      {
        HARNESS_CONFIG_DIR: tmpDir,
        HARNESS_PRESET_FILE: join(tmpDir, "presets.json"),
      },
      () => {
        const output: { payload: unknown } = { payload: "untouched" };
        hooks["plugin.state.read"]({ namespace: "other" }, output);
        assert.strictEqual(
          output.payload,
          "untouched",
          "non-harness namespace must not be touched",
        );
      },
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("session.state.write: ignores non-harness namespace", () => {
  const tmpDir = mkTempConfig();
  try {
    withEnv(
      {
        HARNESS_CONFIG_DIR: tmpDir,
        HARNESS_PRESET_FILE: join(tmpDir, "presets.json"),
      },
      () => {
        assert.doesNotThrow(() =>
          hooks["session.state.write"](
            {
              sessionID: "s1",
              namespace: "other",
              payload: { activePreset: "nonsense" },
            },
            {},
          ),
        );
      },
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("session.state.write: activates a known preset", () => {
  const tmpDir = mkTempConfig();
  try {
    withEnv(
      {
        HARNESS_CONFIG_DIR: tmpDir,
        HARNESS_PRESET_FILE: join(tmpDir, "presets.json"),
      },
      () => {
        hooks["session.state.write"](
          {
            sessionID: "s1",
            namespace: "harness",
            payload: { activePreset: "Qwen Deep Coding" },
          },
          {},
        );
        const output: { payload: unknown } = { payload: null };
        hooks["session.state.read"](
          { sessionID: "s1", namespace: "harness" },
          output,
        );
        assert.deepStrictEqual(output.payload, {
          activePreset: "Qwen Deep Coding",
          presets: ["Qwen Deep Coding"],
        });
      },
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("session.state.write: rejects unknown preset without persisting it", async () => {
  const tmpDir = mkTempConfig();
  try {
    let pending!: Promise<unknown>;
    const output: { payload: unknown } = { payload: null };
    withEnv(
      {
        HARNESS_CONFIG_DIR: tmpDir,
        HARNESS_PRESET_FILE: join(tmpDir, "presets.json"),
      },
      () => {
        pending = hooks["session.state.write"](
          {
            sessionID: "s1",
            namespace: "harness",
            payload: { activePreset: "Nonexistent Preset" },
          },
          {},
        );
        pending.catch(() => {});
      },
    );
    await assert.rejects(pending, /Unknown Harness preset/);
    withEnv(
      {
        HARNESS_CONFIG_DIR: tmpDir,
        HARNESS_PRESET_FILE: join(tmpDir, "presets.json"),
      },
      () => {
        hooks["session.state.read"](
          { sessionID: "s1", namespace: "harness" },
          output,
        );
      },
    );
    assert.strictEqual(
      (output.payload as any).activePreset,
      undefined,
      "rejected preset must not be persisted",
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("session.state.write: rejects malformed payload (schema validation)", async () => {
  const tmpDir = mkTempConfig();
  try {
    let pending!: Promise<unknown>;
    withEnv(
      {
        HARNESS_CONFIG_DIR: tmpDir,
        HARNESS_PRESET_FILE: join(tmpDir, "presets.json"),
      },
      () => {
        pending = hooks["session.state.write"](
          {
            sessionID: "s1",
            namespace: "harness",
            payload: { activePreset: 5 },
          },
          {},
        );
        pending.catch(() => {});
      },
    );
    await assert.rejects(pending);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("session state is isolated per session", () => {
  const tmpDir = mkTempConfig();
  try {
    withEnv(
      {
        HARNESS_CONFIG_DIR: tmpDir,
        HARNESS_PRESET_FILE: join(tmpDir, "presets.json"),
      },
      () => {
        hooks["session.state.write"](
          {
            sessionID: "session-a",
            namespace: "harness",
            payload: { activePreset: "Qwen Deep Coding" },
          },
          {},
        );

        const outputA: { payload: unknown } = { payload: null };
        hooks["session.state.read"](
          { sessionID: "session-a", namespace: "harness" },
          outputA,
        );
        assert.strictEqual(
          (outputA.payload as any).activePreset,
          "Qwen Deep Coding",
        );

        const outputB: { payload: unknown } = { payload: null };
        hooks["session.state.read"](
          { sessionID: "session-b", namespace: "harness" },
          outputB,
        );
        assert.strictEqual(
          (outputB.payload as any).activePreset,
          undefined,
          "session-b must not see session-a's preset",
        );
      },
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
