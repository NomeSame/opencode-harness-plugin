/**
 * Tests für die Harness-Detailanzeige-Logik (TODO-031).
 *
 * Testet harness-detail-display-logic.ts direkt (framework-frei, kein JSX),
 * statt wie zuvor die Gruppierungslogik separat und falsch (Sortierreihenfolge
 * vertauscht) neu zu implementieren (siehe REVIEW.md Teil 4).
 */

import { describe, it, expect } from "bun:test"
import { splitHarnessParameters } from "./harness-detail-display-logic"

describe("splitHarnessParameters", () => {
  it("separates enforced and normal parameters and sorts each group by name", () => {
    const parameters = [
      { name: "temperature", value: 1.0, enforced: true },
      { name: "top_p", value: 0.95, enforced: false },
      { name: "max_tokens", value: 4096, enforced: true },
    ]

    const { enforced, normal } = splitHarnessParameters(parameters)

    expect(enforced.map((p) => p.name)).toEqual(["max_tokens", "temperature"])
    expect(normal.map((p) => p.name)).toEqual(["top_p"])
  })

  it("returns empty groups for an empty input", () => {
    const { enforced, normal } = splitHarnessParameters([])
    expect(enforced).toEqual([])
    expect(normal).toEqual([])
  })

  it("does not mutate the input array", () => {
    const parameters = [
      { name: "z_param", value: 1, enforced: false },
      { name: "a_param", value: 2, enforced: false },
    ]
    splitHarnessParameters(parameters)
    expect(parameters.map((p) => p.name)).toEqual(["z_param", "a_param"])
  })

  it("keeps description when present", () => {
    const { normal } = splitHarnessParameters([
      { name: "temperature", value: 1.0, enforced: false, description: "Controls randomness" },
    ])
    expect(normal[0].description).toBe("Controls randomness")
  })
})
