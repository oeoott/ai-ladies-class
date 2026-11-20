import { useState } from 'react'
import './journey.css'

const stops = ['감정 그림', '표정 거울', '이야기 나누기']

export function JourneyProgress({ friend, step }) {
  const [walking, setWalking] = useState(false)
  const [loadedPose, setLoadedPose] = useState(null)

  return (
    <div className="journey-progress" style={{ '--journey-step': step }}>
      <ol className="journey-stops" aria-label="오늘의 산책 순서" role="list">
        {stops.map((label, index) => (
          <li
            key={label}
            className={index < step ? 'journey-stop is-complete' : 'journey-stop'}
            aria-current={index === step ? 'step' : undefined}
          >
            <span className="journey-marker" aria-hidden="true">
              {index < step ? '✓' : index + 1}
            </span>
            <span className="journey-stage-name">{label}</span>
            {index < step && <span className="journey-sr"> 완료</span>}
          </li>
        ))}
      </ol>
      <div
        className={'journey-walker' + (walking ? ' is-walking' : '')}
        data-pose-ready={Boolean(friend.walkImage && loadedPose === friend.walkImage)}
        aria-hidden="true"
        onTransitionRun={() => setWalking(true)}
        onTransitionEnd={() => setWalking(false)}
        onTransitionCancel={() => setWalking(false)}
      >
        <img className="journey-standing-pose" src={friend.image} alt="" draggable="false" />
        {friend.walkImage && (
          <img
            className="journey-walking-pose"
            src={friend.walkImage}
            alt=""
            draggable="false"
            onLoad={() => setLoadedPose(friend.walkImage)}
          />
        )}
      </div>
    </div>
  )
}
