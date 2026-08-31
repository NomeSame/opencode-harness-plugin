/**
 * Payload shapes for the "harness" namespace of OpenCode's generic
 * session.state.read/write hooks. Core never imports this file — it only
 * forwards an opaque payload. This is where Harness owns its own typing.
 */
import { Schema } from "effect"

export const HarnessStatePayload = Schema.Struct({
  activePreset: Schema.optional(Schema.String),
  testStrategy: Schema.optional(Schema.String),
  compactionThreshold: Schema.optional(Schema.Number),
})
export type HarnessStatePayload = Schema.Schema.Type<typeof HarnessStatePayload>

export const HarnessReadState = Schema.Struct({
  activePreset: Schema.optional(Schema.String),
  presets: Schema.Array(Schema.String),
})
export type HarnessReadState = Schema.Schema.Type<typeof HarnessReadState>
