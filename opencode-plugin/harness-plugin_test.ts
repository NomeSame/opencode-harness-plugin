import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("./harness-plugin.ts")
const { HarnessPlugin } = mod
const plugin = mod.default

test("default export is a plugin function", () => {
  assert.equal(typeof plugin, "function")
})

test("named export is identical to default export", () => {
  assert.equal(HarnessPlugin, plugin)
})

test("plugin returns hooks object with event handler", async () => {
  const hooks = await plugin({})
  assert.equal(typeof hooks, "object")
  assert.equal(typeof hooks.event, "function")
})

test("event handler accepts arbitrary event payloads", async () => {
  const hooks = await plugin({})
  await hooks.event({ event: { type: "session.idle", properties: { sessionID: "ses_1" } } })
  await hooks.event({ event: { type: "unknown.event" } })
  await hooks.event({})
  await hooks.event({ event: undefined })
})

test("event handler resolves to void and stays stateless", async () => {
  const first = await plugin({})
  const second = await plugin({})
  assert.notEqual(first, second)
  assert.equal(typeof first.event, "function")
  assert.equal(typeof second.event, "function")
  await first.event({ event: { type: "x" } })
  await second.event({ event: { type: "y" } })
})
