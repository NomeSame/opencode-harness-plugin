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
  details: Schema.optional(
    Schema.Record(
      Schema.String,
      Schema.Struct({
        name: Schema.String,
        model: Schema.String,
        harnesses: Schema.Array(Schema.String),
        parameters: Schema.Record(
          Schema.String,
          Schema.Struct({ value: Schema.Unknown, enforced: Schema.Boolean }),
        ),
      }),
    ),
  ),
})
export type HarnessReadState = Schema.Schema.Type<typeof HarnessReadState>
