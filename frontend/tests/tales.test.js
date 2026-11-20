import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import test from 'node:test'
import { forestTales } from '../src/forestTales.js'
import { topics } from '../src/session.js'

test('every daily emotion opens an illustrated tale with two playable outcomes', async () => {
  for (const { id } of topics) {
    const tale = forestTales[id]
    await access(new URL('../public/art/tale-' + id + '.webp', import.meta.url))
    assert.ok(tale.title && tale.pages.length === 3 && tale.pages.every(Boolean), id)
    assert.ok(tale.situation && tale.explanation, id)
    assert.equal(tale.actions.length, 2, id)
    const [first, second] = tale.actions
    assert.notEqual(first.label, second.label, id)
    assert.notEqual(first.event, second.event, id)
    for (const action of tale.actions) {
      assert.ok(action.line && action.event, id)
      assert.ok(
        action.expression === 'neutral' || topics.some((t) => t.id === action.expression),
        id,
      )
    }
    assert.equal(tale.talk.choices.length, tale.talk.replies.length, id)
    assert.equal(tale.talk.extra.length, tale.talk.ends.length, id)
  }
})
