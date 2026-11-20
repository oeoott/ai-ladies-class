import { useEffect, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import './entrance.css'

const walkDuration = 780

export function ForestEntrance({ friend, finished, resuming = false, onEnter, hidden = false }) {
  const [walking, setWalking] = useState(false)
  const [loadedWalkImage, setLoadedWalkImage] = useState(null)
  const timer = useRef(null)
  const locked = useRef(false)

  useEffect(() => {
    if (hidden) {
      locked.current = false
      setWalking(false)
    }
    return () => window.clearTimeout(timer.current)
  }, [hidden])

  function enter() {
    if (locked.current || hidden) return
    locked.current = true
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onEnter()
      return
    }
    setWalking(true)
    // Navigation also works when the browser suppresses CSS animation events.
    timer.current = window.setTimeout(onEnter, walkDuration)
  }

  return (
    <main
      id="main-content"
      className={'forest-entrance' + (walking ? ' is-entering' : '')}
      style={{ '--entrance-walk-duration': walkDuration + 'ms' }}
      aria-labelledby="entrance-title"
    >
      <img
        className="entrance-landscape"
        src={import.meta.env.BASE_URL + 'art/forest-gate.webp'}
        alt=""
        fetchPriority="high"
      />
      <div className="entrance-sign">
        <span className="entrance-sign-pin left" aria-hidden="true" />
        <span className="entrance-sign-pin right" aria-hidden="true" />
        <h1 id="entrance-title">마음숲</h1>
      </div>
      <div className="entrance-clearing">
        <div
          className="entrance-walker"
          data-walk-ready={!!friend.walkImage && loadedWalkImage === friend.walkImage}
        >
          <img
            className="entrance-pose-front"
            src={friend.image}
            alt={`${friend.species} 친구 ${friend.name}`}
            fetchPriority="high"
          />
          {friend.walkImage && (
            <img
              className="entrance-pose-back"
              src={friend.walkImage}
              alt=""
              aria-hidden="true"
              onLoad={() => setLoadedWalkImage(friend.walkImage)}
            />
          )}
        </div>
      </div>
      <button
        type="button"
        className="entrance-button"
        aria-disabled={walking || undefined}
        onClick={enter}
      >
        {resuming ? '산책 이어가기' : finished ? '오늘 학습 다시 하기' : '마음숲 들어가기'}
        <ArrowRight aria-hidden="true" />
      </button>
    </main>
  )
}
