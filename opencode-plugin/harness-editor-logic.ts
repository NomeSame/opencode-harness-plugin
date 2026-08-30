import { createSignal } from "solid-js"

/**
 * Reine, framework-freie Logik für den Harness-Editor (TODO-032).
 *
 * Enthält bewusst KEINE `@/`-Pfad-Aliase, damit sie unabhängig vom
 * Opencode-App-Build getestet werden kann (siehe REVIEW.md Teil 4).
 * Die Ansicht (JSX) liegt in harness-editor.tsx.
 */

export interface HarnessParameter {
  name: string
  value: unknown
  enforced: boolean
  description?: string
}

export interface Harness {
  name: string
  description?: string
  parameters: Record<string, HarnessParameter>
}

export interface HarnessEditorState {
  loading: boolean
  saving: boolean
  error: string | null
  harness: Harness | null
  parameters: HarnessParameter[]
}

export interface HarnessEditor {
  state: HarnessEditorState
  load(harnessName: string): Promise<void>
  updateParameter(name: string, value: unknown, enforced: boolean): void
  removeParameter(name: string): void
  save(): Promise<void>
}

/**
 * BLOCKED: siehe harness-selection-logic.ts — kein Browser-zu-Plugin-Bridge
 * verfügbar. Wirft bewusst statt Fake-Daten zurückzugeben: ein Editor, der
 * erfundene Werte anzeigt, könnte beim Speichern echte Konfiguration mit
 * diesen Fake-Werten überschreiben.
 */
export async function loadHarnessViaCLI(harnessName: string, _configDir: string): Promise<Harness> {
  throw new Error(
    `Cannot load harness '${harnessName}': no browser-to-plugin bridge available yet. ` +
      `Use 'python -m harness.cli resolve --preset <name> --dir <configDir>' directly for now.`,
  )
}

export async function saveHarnessViaCLI(
  harnessName: string,
  _configDir: string,
  _parameters: HarnessParameter[],
): Promise<void> {
  throw new Error(
    `Cannot save harness '${harnessName}': no browser-to-plugin bridge available yet. ` +
      `Use 'python -m harness.cli edit --name <name> --set-parameter ...' directly for now.`,
  )
}

export function createHarnessEditor(input: {
  harnessName: string
  configDir: string
  sessionID: string
}): HarnessEditor {
  const { configDir } = input

  const [state, setState] = createSignal<HarnessEditorState>({
    loading: false,
    saving: false,
    error: null,
    harness: null,
    parameters: [],
  })

  return {
    get state() {
      return state()
    },

    async load(name: string): Promise<void> {
      setState((s) => ({ ...s, loading: true, error: null }))
      try {
        const harness = await loadHarnessViaCLI(name, configDir)
        const parameters = Object.values(harness.parameters)
        setState((s) => ({ ...s, harness, parameters, loading: false }))
      } catch (err) {
        setState((s) => ({
          ...s,
          error: err instanceof Error ? err.message : "Unknown error",
          loading: false,
        }))
      }
    },

    updateParameter(name: string, value: unknown, enforced: boolean): void {
      setState((s) => ({
        ...s,
        parameters: s.parameters.map((p) => (p.name === name ? { ...p, value, enforced } : p)),
      }))
    },

    removeParameter(name: string): void {
      setState((s) => ({
        ...s,
        parameters: s.parameters.filter((p) => p.name !== name),
      }))
    },

    async save(): Promise<void> {
      const s = state()
      if (!s.harness) return

      setState((prev) => ({ ...prev, saving: true, error: null }))
      try {
        await saveHarnessViaCLI(s.harness.name, configDir, s.parameters)
        setState((prev) => ({ ...prev, saving: false }))
      } catch (err) {
        setState((prev) => ({
          ...prev,
          saving: false,
          error: err instanceof Error ? err.message : "Unknown error",
        }))
      }
    },
  }
}
