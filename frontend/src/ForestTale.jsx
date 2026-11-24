import './forest-tale.css'

export function TaleActions({ actions, onChoose }) {
  return (
    <div className="edu-choices" role="group" aria-label="이야기 속에서 할 행동">
      {actions.map(({ label }, index) => (
        <button key={label} type="button" className="edu-reply tale-action" onClick={() => onChoose(index)}>
          {label}
        </button>
      ))}
    </div>
  )
}

function PostOffice() {
  return (
    <>
      <span className="tale-postbox" />
      <span className="tale-windmill">
        <i className="tale-pinwheel" />
      </span>
      <span className="tale-plane" />
    </>
  )
}

function Lighthouse() {
  return (
    <>
      <span className="tale-mat" />
      <span className="tale-block block-base" />
      <span className="tale-block block-middle" />
      <span className="tale-block block-cap" />
      <span className="tale-beacon" />
    </>
  )
}

function ButterflyGarden() {
  return (
    <>
      <span className="tale-leaf" />
      <span className="tale-rocks" />
      <span className="tale-flower" />
      <span className="tale-butterfly" />
    </>
  )
}

function CloudPlayground() {
  return (
    <>
      <span className="tale-cloud-stairs" />
      <span className="tale-cloud-friend" />
      <span className="tale-turn first-leaf">1</span>
      <span className="tale-turn next-leaf">2</span>
    </>
  )
}

const scenery = {
  joy: PostOffice,
  sad: Lighthouse,
  surprise: ButterflyGarden,
  anger: CloudPlayground,
}

// The story marks a child's choice with a lasting change to a pictured object.
// The same outcome is described in the story text.
export function TaleScene({ feeling, page, branch, active, children }) {
  // A new emotion without its own props shows the tale picture only (taleBackgrounds.js).
  const Props = scenery[feeling] || (() => null)
  return (
    <figure className="edu-figure tale-figure">
      <div
        className="tale-diorama"
        data-world={feeling}
        data-page={page + 1}
        data-outcome={branch ?? undefined}
        data-paused={!active || undefined}
      >
        <div className="tale-cast">{children}</div>
        <div className="tale-props" aria-hidden="true">
          <Props />
        </div>
      </div>
    </figure>
  )
}
