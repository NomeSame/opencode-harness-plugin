/**
 * Reine, framework-freie Logik für die Harness-Detailanzeige (TODO-031).
 * Enthält bewusst keine JSX/Solid-Importe, damit sie mit node:test/bun:test
 * ohne JSX-Toolchain getestet werden kann (siehe REVIEW.md Teil 4).
 */

export interface HarnessParameter {
  name: string
  value: unknown
  enforced: boolean
  description?: string
}

export function splitHarnessParameters(parameters: HarnessParameter[]): {
  enforced: HarnessParameter[]
  normal: HarnessParameter[]
} {
  const sortByName = (list: HarnessParameter[]) =>
    list.slice().sort((a, b) => a.name.localeCompare(b.name))
  return {
    enforced: sortByName(parameters.filter((p) => p.enforced)),
    normal: sortByName(parameters.filter((p) => !p.enforced)),
  }
}
