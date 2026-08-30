import { batch, createSignal } from "solid-js"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import type { SessionID } from "@opencode-ai/core/session"
import { fetchPresetNames, setActivePresetFn, sortPresetNames } from "./harness-selection-logic"

/**
 * Harness-Preset-Auswahl für eine Session.
 *
 * Analog zu `createPromptModelSelection` in prompt-model-selection.ts.
 * Reine Logik (Datenbeschaffung, Sortierung) liegt in harness-selection-logic.ts
 * und ist dort unabhängig von diesem Solid-Wiring getestet.
 *
 * Integration:
 *   1. Erstelle in session.tsx:
 *        const harness = createHarnessSelection({ sessionID })
 *   2. Übergib an den PromptInput-Controller als `harnessControl`:
 *        createPromptInputController({ ..., harnessControl })
 *   3. Render in prompt-input-v2.tsx:
 *        <HarnessControl harness={controller.harness} />
 *
 * Stand: noch nicht in Opencode_Dev eingehängt (siehe REVIEW.md Teil 3 —
 * Golden Rule 13, kein UI-Hook in der Plugin-API verfügbar).
 */

interface HarnessSelectionInput {
  sessionID: SessionID
}

interface HarnessSelection {
  loading: boolean
  current(): string | undefined
  list(): string[]
  set(presetName: string): void
}

export function createHarnessSelection(input: HarnessSelectionInput): HarnessSelection {
  const { sessionID } = input
  useLanguage()
  useSDK()
  useSync()

  const [presetList, setPresetList] = createSignal<string[]>([])
  const [loaded, setLoaded] = createSignal(false)
  const [storedPreset, setStoredPreset] = createSignal<string | undefined>(undefined)

  const loadPresets = async () => {
    try {
      const names = await fetchPresetNames(sessionID)
      batch(() => {
        setPresetList(sortPresetNames(names))
        setLoaded(true)
      })
    } catch (err) {
      console.error("[harness] Failed to load preset list:", err)
      setLoaded(true)
    }
  }

  loadPresets()

  return {
    get loading() {
      return !loaded()
    },

    current(): string | undefined {
      return storedPreset()
    },

    list(): string[] {
      return presetList()
    },

    async set(presetName: string): Promise<void> {
      if (!presetName || typeof presetName !== "string") return
      setStoredPreset(presetName)
      await setActivePresetFn(sessionID, presetName)
    },
  }
}
