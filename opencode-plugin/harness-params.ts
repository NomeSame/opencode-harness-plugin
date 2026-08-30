export interface ChatParamsOutput {
  temperature: number
  topP: number
  topK: number
  maxOutputTokens: number | undefined
  options: Record<string, any>
}

const TOP_LEVEL_KEYS: Record<string, "temperature" | "topP" | "topK" | "maxOutputTokens"> = {
  temperature: "temperature",
  top_p: "topP",
  top_k: "topK",
  max_output_tokens: "maxOutputTokens",
}

/**
 * Schreibt enforced Parameter in das chat.params-output-Objekt.
 * Rein, wirft nie: nicht-enforced, null/undefined und kaputte Einträge
 * werden übersprungen. Ein kaputtes Preset darf den Chat nie blockieren.
 */
export function applyEnforcedParams(params: unknown, output: ChatParamsOutput): void {
  if (!params || typeof params !== "object" || Array.isArray(params)) return
  for (const [key, raw] of Object.entries(params as Record<string, unknown>)) {
    const param = raw as { value?: unknown; enforced?: unknown } | null
    if (!param || typeof param !== "object") continue
    if (param.enforced !== true) continue
    const value = param.value
    if (value === undefined || value === null) continue
    const field = TOP_LEVEL_KEYS[key]
    if (field) {
      if (typeof value === "number" && Number.isFinite(value)) output[field] = value
      continue
    }
    if (output.options) output.options[key] = value
  }
}