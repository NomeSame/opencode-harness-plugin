/**
 * Tests für die Harness-Editor-Logik (TODO-032).
 *
 * Testet harness-editor-logic.ts direkt (framework-frei, kein `@/`-Alias, kein
 * JSX), statt wie zuvor Zustand am echten Modul vorbei zu simulieren (siehe
 * REVIEW.md Teil 4).
 */

import { describe, it, expect } from "bun:test"
import { createHarnessEditor, loadHarnessViaCLI, saveHarnessViaCLI } from "./harness-editor-logic"

describe("harness-editor-logic", () => {
  describe("loadHarnessViaCLI / saveHarnessViaCLI", () => {
    it("loadHarnessViaCLI rejects instead of returning fabricated data", async () => {
      await expect(loadHarnessViaCLI("qwen", "/tmp/harness_configs")).rejects.toThrow(
        /no browser-to-plugin bridge/,
      )
    })

    it("saveHarnessViaCLI rejects instead of silently pretending success", async () => {
      await expect(
        saveHarnessViaCLI("qwen", "/tmp/harness_configs", []),
      ).rejects.toThrow(/no browser-to-plugin bridge/)
    })
  })

  describe("createHarnessEditor", () => {
    it("starts with empty, non-loading, non-saving state", () => {
      const editor = createHarnessEditor({
        harnessName: "qwen",
        configDir: "/tmp/harness_configs",
        sessionID: "session-1",
      })
      expect(editor.state).toEqual({
        loading: false,
        saving: false,
        error: null,
        harness: null,
        parameters: [],
      })
    })

    it("load() surfaces the bridge error via state.error instead of throwing", async () => {
      const editor = createHarnessEditor({
        harnessName: "qwen",
        configDir: "/tmp/harness_configs",
        sessionID: "session-1",
      })

      await editor.load("qwen")

      expect(editor.state.loading).toBe(false)
      expect(editor.state.harness).toBeNull()
      expect(editor.state.error).toMatch(/no browser-to-plugin bridge/)
    })

    it("updateParameter on an unknown name leaves the (empty) parameter list unchanged", () => {
      const editor = createHarnessEditor({
        harnessName: "qwen",
        configDir: "/tmp/harness_configs",
        sessionID: "session-1",
      })

      editor.updateParameter("temperature", 1.5, true)
      expect(editor.state.parameters).toEqual([])
    })

    it("removeParameter is a no-op on an empty parameter list", () => {
      const editor = createHarnessEditor({
        harnessName: "qwen",
        configDir: "/tmp/harness_configs",
        sessionID: "session-1",
      })

      editor.removeParameter("temperature")
      expect(editor.state.parameters).toEqual([])
    })

    it("save() is a no-op when no harness has been loaded", async () => {
      const editor = createHarnessEditor({
        harnessName: "qwen",
        configDir: "/tmp/harness_configs",
        sessionID: "session-1",
      })

      await editor.save()
      expect(editor.state.saving).toBe(false)
      expect(editor.state.error).toBeNull()
    })
  })
})
