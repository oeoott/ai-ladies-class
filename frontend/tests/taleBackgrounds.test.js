import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'
import { TALE_BACKGROUNDS, taleBackground } from '../src/taleBackgrounds.js'
import { topics } from '../src/session.js'

const art = (path) => new URL('../public/' + path, import.meta.url)

test('every tale has three scene backgrounds: the story, then one per action', () => {
  for (const { id } of topics) {
    const set = TALE_BACKGROUNDS[id]
    assert.ok(set && set.story && set.outcomes.length === 2, id)
    const names = [set.story, ...set.outcomes]
    assert.equal(new Set(names).size, 3, id)
    for (const name of names) assert.match(name, new RegExp('^' + id + '-[a-z]+$'), name)
  }
})

test('the story picture before choosing, then the chosen outcome; the original is the fallback', () => {
  const { story, outcomes } = TALE_BACKGROUNDS.joy
  for (const phase of ['book', 'situation', 'act', undefined]) {
    assert.deepEqual(taleBackground('joy', { phase, branch: 1 }),
      { src: `art/tale/${story}.webp`, fallback: 'art/tale-joy.webp' }, String(phase))
  }
  assert.equal(taleBackground('joy', null).src, `art/tale/${story}.webp`)
  assert.equal(taleBackground('joy', { phase: 'consequence', branch: null }).src, `art/tale/${story}.webp`)
  for (const phase of ['consequence', 'question', 'reply', 'extra', 'ending']) {
    assert.equal(taleBackground('joy', { phase, branch: 0 }).src, `art/tale/${outcomes[0]}.webp`, phase)
    assert.equal(taleBackground('joy', { phase, branch: 1 }).src, `art/tale/${outcomes[1]}.webp`, phase)
  }
  assert.deepEqual(taleBackground('calm', null), { src: 'art/tale-calm.webp', fallback: 'art/tale-calm.webp' })
})

test('originals exist (used until a scene picture is added) and are backed up', async () => {
  for (const { id } of topics) {
    await access(art('art/tale-' + id + '.webp'))
    await access(art('art/original/tale-' + id + '.webp'))
  }
})

test('the prompt file lists every scene picture with its reference image', async () => {
  const prompts = await readFile(new URL('../../prompts/tale-backgrounds.md', import.meta.url), 'utf8')
  for (const [id, { story, outcomes }] of Object.entries(TALE_BACKGROUNDS)) {
    for (const name of [story, ...outcomes]) assert.ok(prompts.includes(`public/art/tale/${name}.webp`), name)
    assert.ok(prompts.includes(`public/art/original/tale-${id}.webp`), id)
  }
})
