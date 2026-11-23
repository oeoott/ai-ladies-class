import './feeling-practice.css'

import { emotions } from './content.js'

// Practice scene text per emotion, from the shared emotions.json ('practice').
export const feelingPractice = Object.fromEntries(Object.entries(emotions).map(([id, emotion]) => [id, emotion.practice]))

export function PracticeObject({ feeling, revealed = false, onAct }) {
  const practice = feelingPractice[feeling]
  const picture = (
    <img
      className="practice-object-image"
      src={
        import.meta.env.BASE_URL +
        'art/practice/' +
        feeling +
        (revealed ? '-after' : '-before') +
        '.webp'
      }
      alt={revealed ? practice.afterImage : practice.beforeImage}
      draggable="false"
    />
  )
  if (onAct) {
    return (
      <button
        type="button"
        className="practice-object practice-object-button"
        onClick={onAct}
        aria-label={practice.action}
      >
        {picture}
        <span className="practice-object-label">{practice.action}</span>
      </button>
    )
  }
  return (
    <div className="practice-object is-revealed">
      {picture}
      <span className="practice-object-label">{practice.result}</span>
    </div>
  )
}
