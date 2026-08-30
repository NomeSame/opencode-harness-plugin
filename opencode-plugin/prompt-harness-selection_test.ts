/**
 * Tests für die Preset-Auswahl-Logik (TODO-030).
 *
 * Testet harness-selection-logic.ts direkt (framework-frei, kein `@/`-Alias),
 * statt wie zuvor eine handgebaute Mock-Attrappe zu prüfen, die den echten
 * Code nie importierte (siehe REVIEW.md Teil 3).
 */

import { describe, it, expect, spyOn } from "bun:test"
import { fetchPresetNames, setActivePresetFn, sortPresetNames } from "./harness-selection-logic"

describe("harness-selection-logic", () => {
  describe("sortPresetNames", () => {
    it("sorts alphabetically without mutating the input", () => {
      const input = ["Qwen Deep Coding", "Default", "Aardvark"]
      const sorted = sortPresetNames(input)
      expect(sorted).toEqual(["Aardvark", "Default", "Qwen Deep Coding"])
      expect(input).toEqual(["Qwen Deep Coding", "Default", "Aardvark"])
    })

    it("returns an empty array for an empty input", () => {
      expect(sortPresetNames([])).toEqual([])
    })
  })

  describe("fetchPresetNames", () => {
    it("returns an empty list (blocked on browser-to-plugin bridge)", async () => {
      const names = await fetchPresetNames("session-1")
      expect(names).toEqual([])
    })
  })

  describe("setActivePresetFn", () => {
    it("does not throw and logs a warning explaining the current limitation", async () => {
      const warnSpy = spyOn(console, "warn").mockImplementation(() => {})
      await setActivePresetFn("session-1", "Qwen Deep Coding")
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy.mock.calls[0][0]).toContain("/harness-set Qwen Deep Coding")
      warnSpy.mockRestore()
    })
  })
})
