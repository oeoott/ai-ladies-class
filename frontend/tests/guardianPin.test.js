import assert from 'node:assert/strict'
import test from 'node:test'
import { checkGuardianPin } from '../src/guardianPin.js'

test('guardian PIN requires setup once and rejects wrong or replacement PINs', async (t) => {
  const store = new Map()
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  } })
  t.after(() => previous ? Object.defineProperty(globalThis, 'localStorage', previous) : delete globalThis.localStorage)
  assert.equal(await checkGuardianPin('0123', false), false)
  assert.equal(await checkGuardianPin('123', true), false)
  assert.equal(await checkGuardianPin('0123', true), true)
  assert.equal(await checkGuardianPin('4321', true), false)
  assert.equal(await checkGuardianPin('0123', false), true)
})
