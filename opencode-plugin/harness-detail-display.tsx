/**
 * Harness Detailanzeige UI (TODO-031).
 *
 * Zeigt die aktiven Harness-Regeln an (enforced/normal getrennt),
 * analog zum bestehenden Datenmodell aus TODO-019.
 *
 * Datenquelle: `harness/cli.py resolve` (TODO-025) liefert bereits
 * das fertige JSON mit `enforced`-Flag pro Parameter.
 *
 * Enforced Parameter werden optisch hervorgehoben (z.B. Badge/Farbe).
 */

import { Show, For, createMemo } from "solid-js"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { KeybindV2 } from "@opencode-ai/ui/v2/keybind-v2"
import type { Language } from "@/context/language"
import { splitHarnessParameters, type HarnessParameter } from "./harness-detail-display-logic"

export type { HarnessParameter }

/**
 * Harness-Detailanzeige.
 * Zeigt die aktiven Harness-Regeln an (enforced/normal getrennt).
 */
export function HarnessDetailDisplay(props: {
  parameters: HarnessParameter[]
  language: Language
  onCyclePreset?: () => void
}) {
  const split = createMemo(() => splitHarnessParameters(props.parameters))
  const enforced = createMemo(() => split().enforced)
  const normal = createMemo(() => split().normal)

  return (
    <div class="flex flex-col gap-3 p-3 rounded-lg border border-border-weak bg-background-base">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Icon name="shield" class="size-4 text-text-weak" />
          <span class="text-sm font-medium text-text-base">Harness Active</span>
          <Show when={props.onCyclePreset}>
            <TooltipV2
              placement="top"
              gutter={4}
              value={
                <>
                  {props.language.t("ui.harness.cyclePreset")}
                  <KeybindV2 keys={["Shift", "Mod", "H"]} variant="neutral" />
                </>
              }
            >
              <ButtonV2
                variant="ghost-muted"
                size="small"
                class="!h-6 !px-2"
                onClick={props.onCyclePreset}
              >
                <Icon name="chevron-down" class="size-3" />
              </ButtonV2>
            </TooltipV2>
          </Show>
        </div>
        <span class="text-xs text-text-weak">
          {enforced().length + normal().length} {enforced().length + normal().length === 1 ? "parameter" : "parameters"}
        </span>
      </div>

      {/* Enforced Parameters */}
      <Show when={enforced().length > 0}>
        <div class="flex flex-col gap-2">
          <span class="text-xs font-medium text-text-weak uppercase tracking-wider">
            {props.language.t("ui.harness.enforced")}
          </span>
          <For each={enforced()}>
            {(param) => (
              <HarnessParameterRow
                param={param}
                language={props.language}
                variant="enforced"
              />
            )}
          </For>
        </div>
      </Show>

      {/* Normal Parameters */}
      <Show when={normal().length > 0}>
        <div class="flex flex-col gap-2">
          <span class="text-xs font-medium text-text-weak uppercase tracking-wider">
            {props.language.t("ui.harness.normal")}
          </span>
          <For each={normal()}>
            {(param) => (
              <HarnessParameterRow
                param={param}
                language={props.language}
                variant="normal"
              />
            )}
          </For>
        </div>
      </Show>

      {/* Empty State */}
      <Show when={enforced().length === 0 && normal().length === 0}>
        <div class="flex flex-col items-center justify-center py-4 text-text-weak">
          <Icon name="shield" class="size-6 mb-2 opacity-40" />
          <span class="text-sm">No harness rules active</span>
        </div>
      </Show>
    </div>
  )
}

/**
 * Einzelner Parameter-Row.
 * Enforced Parameter werden optisch hervorgehoben (Badge/Farbe).
 */
function HarnessParameterRow(props: {
  param: HarnessParameter
  language: Language
  variant: "enforced" | "normal"
}) {
  const { param, language, variant } = props

  return (
    <div
      classList={{
        "flex items-center justify-between px-2 py-1 rounded": true,
        "bg-background-stronger": variant === "enforced",
        "bg-background-base": variant === "normal",
      }}
    >
      <div class="flex items-center gap-2 min-w-0">
        <Show when={variant === "enforced"}>
          <span class="flex shrink-0">
            <Icon name="lock" class="size-3 text-text-warning" />
          </span>
        </Show>
        <span class="text-xs font-medium text-text-base truncate">{param.name}</span>
        <Show when={param.description}>
          <TooltipV2
            placement="top"
            gutter={4}
            value={param.description ?? ""}
          >
            <Icon name="info" class="size-3 text-text-weak shrink-0" />
          </TooltipV2>
        </Show>
      </div>
      <span
        classList={{
          "text-xs font-mono text-text-weak truncate": true,
          "text-text-warning": variant === "enforced",
        }}
      >
        {JSON.stringify(param.value)}
      </span>
    </div>
  )
}
