import assert from 'node:assert/strict'
import test from 'node:test'
import { createApi } from '../src/api.js'
import { emptySession, readSession } from '../src/session.js'
import { forestTales } from '../src/forestTales.js'
import { FACES, friendFace, localReply, namedTalk, saidLine, startServerTalk, takeTurn, talkReply, usableTalk } from '../src/storyTalk.js'

const date = '2026-11-22'
const talk = forestTales.joy.talk

function fakeServer(answer) {
  const sent = []
  const api = createApi('http://server', { timeout: 20, send: async (url, options) => {
    sent.push({ url, body: JSON.parse(options.body) })
    // Like fetch, a request that is aborted at the time limit rejects.
    const aborted = new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))))
    const body = await Promise.race([answer(url), aborted])
    return { ok: true, json: async () => body }
  } })
  return { api, sent }
}

test('without a server the talk stays on the built-in script', async () => {
  const turns = new Map()
  const offline = createApi('')
  assert.equal(await startServerTalk(offline, 'w1', turns), null)
  assert.equal(usableTalk({ phase: 'question', talkId: 'c1' }, 'question', false, turns), null)
  const state = { phase: 'reply', ...localReply(0, false) }
  assert.equal(talkReply(state, false, talk.replies), talk.replies[0])
})

test('after a timeout the remaining talk continues on the built-in script', async () => {
  const turns = new Map()
  const { api, sent } = fakeServer((url) => url.endsWith('/talk')
    ? { conversation_id: 'c1', ask: talk.ask, choices: talk.choices }
    : new Promise(() => {}))
  const talkId = await startServerTalk(api, 'w1', turns)
  const question = { phase: 'question', talkId }
  assert.equal(usableTalk(question, 'question', true, turns), 'c1')
  const answer = await takeTurn(api, { talkId, phase: 'question', choice: 1 }, { turns })
  assert.deepEqual(answer.patch, { phase: 'reply', choice: 1, serverReply: null, replyFace: null, talkId: null })
  const reply = { ...question, ...answer.patch }
  assert.equal(talkReply(reply, false, talk.replies), talk.replies[1])
  assert.equal(usableTalk({ ...reply, phase: 'extra' }, 'extra', true, turns), null)
  assert.equal(sent.length, 2)
})

test('a reply that arrives after the scene moved on is ignored', async () => {
  let current = true
  const { api } = fakeServer(async () => {
    current = false
    return { reply: '좋아!', finished: false, fallback_to_picture: false }
  })
  const turns = new Map([['c1', 0]])
  assert.equal(await takeTurn(api, { talkId: 'c1', phase: 'question', choice: 0 }, { isCurrent: () => current, turns }), null)
  assert.equal(turns.get('c1'), 0)
})

test('fallbackToPicture keeps the choices and the conversation', async () => {
  const turns = new Map([['c1', 0]])
  const { api, sent } = fakeServer(async () => ({ reply: '그림으로 골라 볼까요?', finished: false, fallback_to_picture: true }))
  const answer = await takeTurn(api, { talkId: 'c1', phase: 'question', text: '배고파', inputMode: 'voice' }, { turns })
  assert.deepEqual(answer, { patch: null, answered: false })
  assert.deepEqual(sent[0].body, { choice_index: null, text: '배고파', input_mode: 'voice' })
  assert.equal(usableTalk({ phase: 'question', talkId: 'c1' }, 'question', true, turns), 'c1')
})

test('a server reply is kept after a reload and a reopened question starts a new talk', async () => {
  const turns = new Map([['c1', 0]])
  const { api, sent } = fakeServer(async () => ({ reply: '같이 바람을 타자.', finished: false, fallback_to_picture: false }))
  const answer = await takeTurn(api, { talkId: 'c1', phase: 'question', choice: 0 }, { turns })
  assert.deepEqual(sent[0].body, { choice_index: 0, text: null, input_mode: 'picture' })
  const activity = { step: 2, topic: 'joy', phase: 'question', branch: 0, talkId: 'c1', ...answer.patch }
  const saved = { ...emptySession(date), page: 'lesson', step: 2, walkId: 'w1', activity }
  const restored = readSession(JSON.stringify(saved), date).activity
  assert.equal(talkReply(restored, false, talk.replies), '같이 바람을 타자.')
  assert.equal(usableTalk(restored, 'extra', true, new Map()), 'c1')
  assert.equal(usableTalk({ ...restored, phase: 'question' }, 'question', true, turns), null)
})

test('"내가 한 말" shows the tapped choice, and a spoken sentence only in memory', async () => {
  const reply = { phase: 'reply', ...localReply(1, false) }
  assert.equal(saidLine(reply, 'reply', talk), talk.choices[1]) // 보기를 누르거나 말로 같은 보기를 말함
  const ending = { phase: 'ending', ...localReply(0, true) }
  assert.equal(saidLine(ending, 'ending', talk), talk.extra[0])
  assert.equal(saidLine({ phase: 'question' }, 'question', talk), null)

  // A sentence that got a server reply: the session patch never holds the sentence itself.
  const sentence = '비행기가 멀리 날아갔으면 좋겠어'
  const turns = new Map([['c1', 0]])
  const { api } = fakeServer(async () => ({ reply: '멀리 날아가면 좋겠다.', finished: false, fallback_to_picture: false }))
  const answer = await takeTurn(api, { talkId: 'c1', phase: 'question', text: sentence, inputMode: 'voice' }, { turns })
  assert.equal(JSON.stringify(answer.patch).includes(sentence), false)
  const state = { phase: 'reply', ...answer.patch }
  assert.equal(saidLine(state, 'reply', talk, { phase: 'reply', text: sentence }), sentence) // 이번 방문 메모리
  assert.equal(saidLine(state, 'reply', talk), null) // 새로고침 뒤에는 보이지 않음
  assert.equal(saidLine(state, 'reply', talk, { phase: 'ending', text: sentence }), null) // 다른 장면의 문장은 안 씀
})

test('friend face: listen while choosing, then each line\'s face with speak or nod', async () => {
  const sad = forestTales.sad.talk
  const fallback = 'joy' // the chosen action's expression
  assert.deepEqual(friendFace({}, 'question', sad, fallback), { expression: 'joy', gesture: 'listen' })
  assert.deepEqual(friendFace({}, 'extra', sad, fallback), { expression: 'joy', gesture: 'listen' })
  // script lines (no server): tales.json replyExpressions / endExpressions
  assert.deepEqual(friendFace({ ...localReply(0, false) }, 'reply', sad, fallback), { expression: 'sad', gesture: 'speak' })
  assert.deepEqual(friendFace({ ...localReply(1, true) }, 'ending', sad, fallback), { expression: 'neutral', gesture: 'nod' })
  // a talk without expressions (old data) keeps the action's expression
  assert.equal(friendFace({ ...localReply(0, false) }, 'reply', { replies: ['…'] }, fallback).expression, 'joy')
  assert.equal(friendFace({}, 'consequence', sad, fallback), null)
})

test('friend face: a server reply uses the server expression, unknown or missing falls back', async () => {
  const turns = new Map([['c1', 0]])
  const reply = (expression) => fakeServer(async () => ({ reply: '멀리 날아가면 좋겠다.', finished: false, fallback_to_picture: false, expression }))
  const surprise = await takeTurn(reply('surprise').api, { talkId: 'c1', phase: 'question', text: '비행기', inputMode: 'voice' }, { turns })
  const state = { phase: 'reply', ...surprise.patch }
  assert.deepEqual(friendFace(state, 'reply', talk, 'joy'), { expression: 'surprise', gesture: 'speak' })
  // saved and restored with the session like the reply itself
  const saved = { ...emptySession(date), page: 'lesson', step: 2, walkId: 'w1', activity: { step: 2, topic: 'joy', branch: 0, ...state } }
  assert.equal(friendFace(readSession(JSON.stringify(saved), date).activity, 'reply', talk, 'joy').expression, 'surprise')
  for (const odd of ['excited', null, undefined]) {
    const answer = await takeTurn(reply(odd).api, { talkId: 'c1', phase: 'question', text: '비행기', inputMode: 'voice' }, { turns: new Map([['c1', 0]]) })
    assert.equal(friendFace({ phase: 'reply', ...answer.patch }, 'reply', talk, 'joy').expression, 'joy') // 지금처럼 행동의 표정
  }
})

test('every talk line has one of the drawable faces', () => {
  for (const [id, tale] of Object.entries(forestTales)) {
    assert.equal(tale.talk.replyExpressions.length, tale.talk.replies.length, id)
    assert.equal(tale.talk.endExpressions.length, tale.talk.ends.length, id)
    for (const face of [...tale.talk.replyExpressions, ...tale.talk.endExpressions]) assert.ok(FACES.includes(face), id + ' ' + face)
  }
})

test('{친구} names the friend in the talk questions only, never in what anyone says', () => {
  for (const [id, tale] of Object.entries(forestTales)) {
    for (const line of [...tale.talk.choices, ...tale.talk.replies, ...tale.talk.extra, ...tale.talk.ends]) {
      assert.ok(!line.includes('{친구}'), id + ': ' + line)
    }
    const named = namedTalk(tale.talk, '보리')
    assert.ok(!named.ask.includes('{친구}') && !named.again.includes('{친구}'), id)
    assert.deepEqual(named.replies, tale.talk.replies, id)
  }
  assert.equal(namedTalk({ ask: '{친구}에게 말해요.', again: '또 {친구}와?' }, '라온이').ask, '라온이에게 말해요.')
  assert.equal(namedTalk({ ask: '{친구}에게 말해요.', again: '또 {친구}와?' }, '라온이').again, '또 라온이와?')
})

test('the server talk starts with the forest friend id only', async () => {
  const sent = []
  const api = createApi('http://server', {
    send: async (url, init) => {
      sent.push(JSON.parse(init.body))
      return { ok: true, status: 200, json: async () => ({ conversation_id: 'c9', ask: '', choices: [] }) }
    },
    learner: () => ({ childId: 'kid', token: null }),
  })
  assert.equal(await startServerTalk(api, 'w1', new Map(), 'rabbit'), 'c9')
  assert.equal(await startServerTalk(api, 'w1', new Map()), 'c9')
  assert.deepEqual(sent, [{ character: 'rabbit' }, {}])
})
