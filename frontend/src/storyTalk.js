// Story conversation with the server. The built-in script answers whenever the server cannot.

// Turns this tab already sent per conversation, so a scene reopened with the back button starts a new talk.
export const talkTurns = new Map()

export const talkTurn = (phase) => (phase === 'question' ? 0 : 1)

// The server answers only while its conversation is on the same turn as the screen.
export function usableTalk(state, phase, serverTalk, turns = talkTurns) {
  const turn = talkTurn(phase)
  return serverTalk && state.talkId && (turns.get(state.talkId) ?? turn) === turn ? state.talkId : null
}

// The talk questions (ask, again) may name the friend with {친구}, like the tale pages.
// Only the questions: the friend's own lines never contain it, so a server reply and the script agree.
export function namedTalk(talk, name) {
  if (!talk) return talk
  const named = (text) => (typeof text === 'string' ? text.replaceAll('{친구}', name) : text)
  return { ...talk, ask: named(talk.ask), again: named(talk.again) }
}

// character: the forest friend's id (lion, rabbit, bear); the server names the friend from it.
export async function startServerTalk(api, walkId, turns = talkTurns, character = undefined) {
  const talk = await api.startTalk(walkId, character ? { character } : {})
  if (!talk?.conversationId) return null
  turns.set(talk.conversationId, 0)
  return talk.conversationId
}

export function localReply(choice, isExtra) {
  return isExtra
    ? { phase: 'ending', extraChoice: choice, serverEnd: null, endFace: null }
    : { phase: 'reply', choice, serverReply: null, replyFace: null }
}

// Friend faces PaintedFriend can draw. Talk lines and server replies may only use these.
export const FACES = ['joy', 'surprise', 'sad', 'anger', 'neutral']

// Friend's face and pose in the talk scenes (existing faces and gestures only, no new animation):
// - question / extra (the child is choosing or speaking): listen
// - reply: the line's expression and speak; ending (narration of what happened): the line's expression and nod
// A server reply uses the expression the server sent; a script line uses tales.json replyExpressions /
// endExpressions. Without one it stays `fallback` (the chosen action's expression), as before.
export function friendFace(state, phase, talk, fallback) {
  if (phase === 'question' || phase === 'extra') return { expression: fallback, gesture: 'listen' }
  if (phase !== 'reply' && phase !== 'ending') return null
  const ending = phase === 'ending'
  const fromServer = ending ? state.serverEnd : state.serverReply
  const line = fromServer
    ? (ending ? state.endFace : state.replyFace)
    : talk?.[ending ? 'endExpressions' : 'replyExpressions']?.[ending ? state.extraChoice : state.choice]
  return { expression: FACES.includes(line) ? line : fallback, gesture: ending ? 'nod' : 'speak' }
}

export function talkReply(state, isEnding, lines) {
  const server = isEnding ? state.serverEnd : state.serverReply
  return server || lines[isEnding ? state.extraChoice : state.choice]
}

// "내가 한 말" above the friend's reply: the sentence said aloud in this visit (`spoken`, kept in memory
// only), otherwise the choice that was tapped or recognised. null hides the line.
export function saidLine(state, phase, conversation, spoken = null) {
  if (phase !== 'reply' && phase !== 'ending') return null
  if (spoken?.phase === phase) return spoken.text
  const line = phase === 'reply' ? conversation.choices?.[state.choice] : conversation.extra?.[state.extraChoice]
  return line ?? null
}

// Resolves to null when the scene moved on while waiting. Otherwise `patch` updates the lesson
// (null keeps it) and `answered` tells whether the child's words got a reply.
export async function takeTurn(api, { talkId, phase, choice = null, text = null, inputMode = 'picture' },
  { isCurrent = () => true, turns = talkTurns } = {}) {
  const isExtra = phase === 'extra'
  const result = await api.sendTalkTurn(talkId, text ? { text, inputMode } : { choiceIndex: choice, inputMode })
  if (!isCurrent()) return null
  if (result?.reply && !result.fallbackToPicture) {
    turns.set(talkId, talkTurn(phase) + 1)
    const face = FACES.includes(result.expression) ? result.expression : null
    return {
      patch: { ...localReply(choice, isExtra), [isExtra ? 'serverEnd' : 'serverReply']: result.reply, [isExtra ? 'endFace' : 'replyFace']: face },
      answered: true,
    }
  }
  // Without an answer the server may still have taken the turn, so the rest of the talk stays local.
  const talk = { talkId: result ? talkId : null }
  if (text) return { patch: result ? null : talk, answered: false }
  return { patch: { ...localReply(choice, isExtra), ...talk }, answered: true }
}
