// Line icons and menu rows shared by the guardian panels.
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

export function MenuRow({ icon, children, onClick, detail, pressed, art }) {
  return (
    <button type="button" className="forest-panel-row" onClick={onClick} aria-pressed={pressed}>
      <span className="forest-panel-row-icon">
        {art || <Icon name={icon} />}
      </span>
      <span className="forest-panel-row-title">{children}</span>
      {detail && <span className="forest-panel-row-detail">{detail}</span>}
      <Icon name={pressed ? "check" : "next"} size={16} />
    </button>
  )
}
