/**
 * Reine, framework-freie Logik für die Preset-Auswahl (TODO-030).
 *
 * Enthält bewusst KEINE `@/`-Pfad-Aliase oder Solid-Context-Importe, damit sie
 * unabhängig vom Opencode-App-Build getestet werden kann (siehe REVIEW.md Teil 3).
 *
 * BLOCKED: OpenCodes öffentliche Plugin-`Hooks`-API (packages/plugin/src/index.ts)
 * bietet keinen UI-Hook und keine Möglichkeit für ein Plugin, eine HTTP-Route zu
 * registrieren. Browser-Code (dieses Modul läuft in packages/app) kann daher
 * harness-store.ts/harness-cli.ts (beide nutzen node:fs/node:child_process) nicht
 * erreichen. Preset-Auswahl funktioniert HEUTE real über den
 * `/harness-set <presetName>` Slash-Command (command.execute.before Hook, siehe
 * harness-028_test.ts) plus automatische Enforcement über den chat.params Hook
 * (siehe harness-027_test.ts). Sobald OpenCode einen UI- oder Server-Route-Hook
 * anbietet, ersetzen die Funktionen unten ihre Platzhalter-Rückgabewerte durch
 * echte IPC-Aufrufe.
 */

export async function fetchPresetNames(_sessionID: string): Promise<string[]> {
  return []
}

export async function setActivePresetFn(sessionID: string, presetName: string): Promise<void> {
  console.warn(
    `[harness] setActivePreset(${sessionID}, ${presetName}) not persisted: no browser-to-plugin ` +
      `bridge available yet. Use the '/harness-set ${presetName}' command instead.`,
  )
}

export function sortPresetNames(names: string[]): string[] {
  return names.slice().sort((a, b) => a.localeCompare(b))
}
