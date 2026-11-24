// Scene backgrounds for each tale, three per tale. Put a picture in public/art/tale/ under the name below
// and it is used; until then (the file is missing) the tale's original art/tale-{id}.webp is shown.
// Prompts for making them: prompts/tale-backgrounds.md
//   story:    동화 1·2·3장, 상황, 행동 고르기 (and 다른 방법 해 보기, back at 행동 고르기)
//   outcomes: 행동별 결과와 그 뒤 대화(질문·친구 답·조금 더·마무리), by the chosen action
export const TALE_BACKGROUNDS = {
  joy: { story: 'joy-yard', outcomes: ['joy-hill', 'joy-post'] },
  sad: { story: 'sad-shore', outcomes: ['sad-rest', 'sad-light'] },
  surprise: { story: 'surprise-garden', outcomes: ['surprise-wall', 'surprise-flower'] },
  anger: { story: 'anger-playground', outcomes: ['anger-turn', 'anger-leaves'] },
}

const AFTER_CHOICE = ['consequence', 'question', 'reply', 'extra', 'ending']

// activity: the lesson's saved state in lesson 3 (phase, branch), or null.
// Returns the scene's picture (src) and the original to use while it does not exist (fallback).
export function taleBackground(topicId, activity) {
  const fallback = 'art/tale-' + topicId + '.webp'
  const set = TALE_BACKGROUNDS[topicId]
  if (!set) return { src: fallback, fallback }
  const branch = activity?.branch
  const chosen = AFTER_CHOICE.includes(activity?.phase) && (branch === 0 || branch === 1)
  return { src: 'art/tale/' + (chosen ? set.outcomes[branch] : set.story) + '.webp', fallback }
}
