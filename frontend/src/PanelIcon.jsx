// Line icons and menu tiles shared by the guardian panels.
const paths = {
  close: <path d="m6 6 12 12M18 6 6 18" />,
  next: <path d="m9.5 5.5 6 6.5-6 6.5" />,
  paw: (
    <>
      <path d="M6.3 15.6c1.3-1.7 2-4.3 5.7-4.3s4.4 2.6 5.7 4.3c1.8 2.4-.5 5.3-3.1 4.4-1.7-.6-3.5-.6-5.2 0-2.6.9-4.9-2-3.1-4.4Z" />
      <ellipse cx="4.7" cy="10.2" rx="1.7" ry="2.3" transform="rotate(-24 4.7 10.2)" />
      <ellipse cx="9.2" cy="6.5" rx="1.7" ry="2.3" />
      <ellipse cx="14.8" cy="6.5" rx="1.7" ry="2.3" />
      <ellipse cx="19.3" cy="10.2" rx="1.7" ry="2.3" transform="rotate(24 19.3 10.2)" />
    </>
  ),
  leaf: (
    <>
      <path d="M4 18C1.7 9.4 7 4 20 3c.1 11-3.8 17.6-12.2 15.5M3 21c2.4-4.8 6.5-8.7 11.5-12.2" />
    </>
  ),
  stamp: (
    <>
      <path d="M7 14h10l3 3v2H4v-2l3-3ZM9 14l.9-4a3.4 3.4 0 1 1 4.2 0l.9 4M5.5 21h13" />
    </>
  ),
  book: (
    <>
      <path d="M12 6c-2.2-2.1-6-2.4-9-1.2V18c3-1.2 6.8-.9 9 1.2 2.2-2.1 6-2.4 9-1.2V4.8c-3-1.2-6.8-.9-9 1.2Zm0 0v13" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20v-1a7 7 0 0 1 14 0v1" />
    </>
  ),
  check: <path d="m5 12 4.4 4.4L19 7" />,
  chart: <path d="M4 20h16M7 16v-4M12 16V7M17 16v-6" />,
  // 스티커판: a round sticker with a leaf on it.
  sticker: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M8.4 15.4c-.8-3.8 1.3-6.6 6.9-7 .1 4.6-1.9 7.3-5.4 6.8M8.2 16.8c1.1-2.2 2.9-3.9 5.1-5.3" />
    </>
  ),
  // 학습 리포트: an envelope (the report goes out by mail).
  letter: (
    <>
      <rect x="3.5" y="6" width="17" height="12.5" rx="2" />
      <path d="m4.4 7.4 7.6 6 7.6-6" />
    </>
  ),
  // 표정 카드: a card with a smiling face.
  faceCard: (
    <>
      <rect x="4.5" y="3.5" width="15" height="17" rx="2.6" />
      <path d="M9.4 10h.01M14.6 10h.01M8.9 13.8c1.7 1.9 4.5 1.9 6.2 0" />
    </>
  ),
  // 보호자 계정: a person with a shield.
  guardian: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.4 19.5v-.8a5.6 5.6 0 0 1 8.4-4.9" />
      <path d="M17 11.3l3.6 1.4v2.6c0 2.5-1.5 4.1-3.6 4.9-2.1-.8-3.6-2.4-3.6-4.9v-2.6Z" />
    </>
  ),
}
export function Icon({ name, size = 22 }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}

// A menu tile in the guardian settings: icon on top, the name below, a small detail under it.
// The icon is decoration; the tile is read by its name (and detail).
export function MenuTile({ icon, children, onClick, detail }) {
  return (
    <button type="button" className="forest-panel-tile" onClick={onClick}>
      <span className="forest-panel-row-icon"><Icon name={icon} /></span>
      <span className="forest-panel-tile-title">{children}</span>
      {detail && <span className="forest-panel-row-detail">{detail}</span>}
    </button>
  )
}
