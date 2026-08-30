/**
 * Harness Editor UI (TODO-032) — Ansicht.
 *
 * Ermöglicht das Bearbeiten von Harness-Parametern über die UI.
 * Reine Logik (Laden/Speichern/State) liegt in harness-editor-logic.ts.
 *
 * Stand: noch nicht in Opencode_Dev eingehängt (siehe REVIEW.md Teil 4 —
 * Golden Rule 13, kein UI-Hook in der Plugin-API verfügbar).
 */

import { For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import type { HarnessEditor, HarnessParameter } from "./harness-editor-logic"

export { createHarnessEditor } from "./harness-editor-logic"
export type { Harness, HarnessEditor, HarnessEditorState, HarnessParameter } from "./harness-editor-logic"

/**
 * Harness-Editor-Komponente.
 * Zeigt ein Formular zur Bearbeitung von Harness-Parametern.
 */
export function HarnessEditorForm(props: { editor: HarnessEditor }) {
  const { editor } = props
  const language = useLanguage()

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    await editor.save()
  }

  return (
    <form class="flex flex-col gap-4" onSubmit={handleSubmit}>
      {/* Parameter-Liste */}
      <div class="flex flex-col gap-2">
        <For each={editor.state.parameters}>
          {(param) => (
            <HarnessParameterRow
              param={param}
              onUpdate={(name, value, enforced) => editor.updateParameter(name, value, enforced)}
              onRemove={editor.removeParameter}
            />
          )}
        </For>

        {/* Empty State */}
        <Show when={editor.state.parameters.length === 0 && !editor.state.loading}>
          <div class="flex flex-col items-center py-4 text-text-weak">
            <span class="text-sm">No parameters configured</span>
          </div>
        </Show>
      </div>

      {/* Save Button */}
      <div class="flex justify-end gap-2">
        <button
          type="submit"
          disabled={editor.state.saving}
          class="px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-50"
        >
          <Show when={editor.state.saving} fallback={"Save"}>{language.t("ui.harness.saving")}</Show>
        </button>
      </div>

      {/* Error Display */}
      <Show when={editor.state.error}>
        <div class="p-3 rounded-lg bg-background-stronger text-text-danger text-sm">
          {editor.state.error}
        </div>
      </Show>
    </form>
  )
}

/**
 * Einzelner Parameter-Row.
 * Ermöglicht das Bearbeiten von Wert und enforced-Flag.
 */
function HarnessParameterRow(props: {
  param: HarnessParameter
  onUpdate: (name: string, value: unknown, enforced: boolean) => void
  onRemove: (name: string) => void
}) {
  const { param, onUpdate, onRemove } = props

  const handleValueChange = (e: Event & { currentTarget: HTMLInputElement }) => {
    try {
      onUpdate(param.name, JSON.parse(e.currentTarget.value), param.enforced)
    } catch {
      // Invalid JSON while typing — ignore until valid on blur.
    }
  }

  const handleEnforcedChange = (e: Event & { currentTarget: HTMLInputElement }) => {
    onUpdate(param.name, param.value, e.currentTarget.checked)
  }

  return (
    <div class="flex items-center justify-between p-2 rounded-lg bg-background-base border border-border-weak">
      <div class="flex items-center gap-2">
        <Show when={param.enforced}>
          <span class="text-text-warning">
            <svg class="size-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        </Show>
        <span class="text-sm font-medium text-text-base">{param.name}</span>
      </div>
      <div class="flex items-center gap-2">
        <input
          type="text"
          value={JSON.stringify(param.value)}
          onChange={handleValueChange}
          class="w-32 px-2 py-1 rounded border border-border-weak text-sm font-mono"
        />
        <label class="flex items-center gap-1">
          <input type="checkbox" checked={param.enforced} onChange={handleEnforcedChange} />
          <span class="text-xs text-text-weak">enforced</span>
        </label>
        <button
          type="button"
          onClick={() => onRemove(param.name)}
          class="text-text-weak hover:text-text-danger"
        >
          <svg class="size-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}
