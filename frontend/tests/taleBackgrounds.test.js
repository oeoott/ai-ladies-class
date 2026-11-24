import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'
import { TALE_BACKGROUNDS, taleBackground } from '../src/taleBackgrounds.js'
import { topics } from '../src/session.js'

const art = (path) => new URL('../public/' + path, import.meta.url)

// Width and height from the WebP header (extended VP8X, lossy VP8 or lossless VP8L).
function webpSize(b) {
  const chunk = b.toString('ascii', 12, 16)
  if (chunk === 'VP8X') return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1]
  if (chunk === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff]
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21)
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1]
  }
  return null
}

test('every tale has one 1536×1024 WebP background used in all its scenes', async () => {
  for (const { id } of topics) {
    const name = TALE_BACKGROUNDS[id]
    assert.match(name ?? '', new RegExp('^' + id + '-[a-z]+$'), id)
    assert.equal(taleBackground(id), `art/tale/${name}.webp`)
    const webp = await readFile(art(taleBackground(id)))
    assert.equal(webp.toString('ascii', 0, 4), 'RIFF', id)
    assert.equal(webp.toString('ascii', 8, 12), 'WEBP', id)
    assert.deepEqual(webpSize(webp), [1536, 1024], id)
  }
  assert.equal(taleBackground('calm'), 'art/forest-gate.webp') // a new emotion without a picture yet
})

test('the earlier tale pictures are kept in the one backup folder', async () => {
  for (const { id } of topics) await access(art('art/backup/tale-' + id + '.webp'))
})

test('the prompt file lists the four pictures actually used', async () => {
  const prompts = await readFile(new URL('../../prompts/tale-backgrounds.md', import.meta.url), 'utf8')
  for (const [id, name] of Object.entries(TALE_BACKGROUNDS)) {
    assert.ok(prompts.includes(`public/art/tale/${name}.webp`), name)
    assert.ok(prompts.includes(`public/art/backup/tale-${id}.webp`), id)
  }
  assert.doesNotMatch(prompts, /결과 1|결과 2/)
})
