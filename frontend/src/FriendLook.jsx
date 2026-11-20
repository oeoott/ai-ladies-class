import './friend-look.css'

// The badge sits on the clasp of the satchel in each original watercolor.
const poses = {
  lion: {
    front: { width: 590, height: 724, x: 373, y: 559, size: 84 },
    walk: { width: 466, height: 701, x: 339, y: 509, size: 69 },
  },
  rabbit: {
    front: { width: 445, height: 724, x: 308, y: 555, size: 80 },
    walk: { width: 370, height: 705, x: 266, y: 528, size: 72 },
  },
  bear: {
    front: { width: 500, height: 667, x: 337, y: 505, size: 80 },
    walk: { width: 423, height: 677, x: 317, y: 487, size: 71 },
  },
}

// The brim sits at the crown, leaving the eyes and the tips of rabbit ears visible.
const headPositions = {
  lion: { front: [247, 127, 256, 156, 443, 202, 124], walk: [265, 96, 211, 129, 357, 178, 100] },
  rabbit: { front: [203, 224, 205, 128, 334, 231, 101], walk: [188, 201, 173, 108, 280, 216, 83] },
  bear: { front: [219, 125, 231, 140, 393, 154, 116], walk: [208, 119, 209, 127, 329, 140, 97] },
}

const hats = {
  'sky-hat': { name: '하늘색 탐험 모자', src: 'sky-hat.webp' },
  'flower-pin': { name: '꽃 머리핀', src: 'flower-pin.webp' },
}

export function headwearName(value) {
  return hats[value]?.name || '그대로'
}

export function headwearImage(value) {
  return hats[value] ? import.meta.env.BASE_URL + 'art/studio/' + hats[value].src : null
}

const designs = {
  leaf: { name: '새싹', fill: '#87af68', edge: '#486b49', stitch: '#dcecc2' },
  star: { name: '별', fill: '#f4c968', edge: '#a06e36', stitch: '#ffedb1' },
  flower: { name: '꽃', fill: '#e7a096', edge: '#a7685f', stitch: '#ffe0ca' },
}

export function CharmShape({ charm }) {
  const design = designs[charm]
  if (!design) return null
  return (
    <g
      fill={design.fill}
      stroke={design.edge}
      strokeWidth="1.8"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {charm === 'leaf' && (
        <>
          <path d="M2 13C-19 15-24-2-20-14-9-15 1-8 3 1 3-10 10-20 23-22 26-7 19 9 6 12L6 19 1 19Z" />
          <path
            d="M3 9C-4 2-9-4-15-8M6 8C10-1 15-9 19-16"
            fill="none"
            stroke={design.stitch}
            strokeWidth="2"
          />
        </>
      )}
      {charm === 'star' && (
        <>
          <path d="M0-23Q2-24 4-20L10-9 23-6Q26-5 23-2L14 8 16 21Q16 24 13 23L0 16-13 22Q-16 23-16 20L-14 8-23-2Q-25-5-22-6L-9-9-3-21Q-2-23 0-23Z" />
          <path
            d="m0-17 7 12 13 2-10 10 1 12-11-6-11 5 2-12-10-9 13-2Z"
            fill="none"
            stroke={design.stitch}
            strokeWidth="1.3"
            strokeDasharray="2 3"
          />
        </>
      )}
      {charm === 'flower' && (
        <>
          <path d="M-7-10C-13-26 7-30 10-14 22-23 33-7 19 0 35 8 22 25 9 16 6 33-13 29-11 14-26 22-33 3-19-2-28-14-13-23-7-10Z" />
          <circle cx="1" cy="1" r="7.5" fill="#f6d77d" stroke="#b78147" />
          <circle cx="0" cy="0" r="4.5" fill="none" stroke="#fff2be" strokeDasharray="1.2 2.3" />
        </>
      )}
    </g>
  )
}

export function charmName(charm) {
  return designs[charm]?.name || '장식 없이'
}

export function FriendCharm({ kind, charm, headwear, walking = false }) {
  const view = walking ? 'walk' : 'front'
  const pose = poses[kind]?.[view]
  if (!pose) return null
  const [hatX, hatBrim, hatWidth, hatHeight, pinX, pinY, pinWidth] = headPositions[kind][view]
  return (
    <>
      {designs[charm] && (
        <g
          aria-hidden="true"
          data-charm={charm}
          transform={`translate(${pose.x} ${pose.y}) rotate(-8) scale(${pose.size / 50})`}
          className="friend-charm"
        >
          <CharmShape charm={charm} />
        </g>
      )}
      {hats[headwear] && (
        <g aria-hidden="true" data-headwear={headwear}>
          {headwear === 'sky-hat' ? (
            <image
              href={headwearImage(headwear)}
              x={hatX - hatWidth / 2}
              y={hatBrim - hatHeight * 0.84}
              width={hatWidth}
              height={hatHeight}
              transform={`rotate(-7 ${hatX} ${hatBrim})`}
              preserveAspectRatio="xMidYMax meet"
            />
          ) : (
            <image
              href={headwearImage(headwear)}
              x={pinX - pinWidth / 2}
              y={pinY - pinWidth / 2}
              width={pinWidth}
              height={pinWidth}
              transform={`rotate(8 ${pinX} ${pinY})`}
            />
          )}
        </g>
      )}
    </>
  )
}

export function FriendLook({
  friend,
  walking = false,
  className,
  alt = '',
  onLoad,
  fetchPriority,
  ...props
}) {
  const pose = poses[friend.id]?.[walking ? 'walk' : 'front']
  if (!pose) return null
  return (
    <svg
      className={['friend-look', className].filter(Boolean).join(' ')}
      viewBox={`0 0 ${pose.width} ${pose.height}`}
      preserveAspectRatio="xMidYMax meet"
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={!alt || undefined}
      focusable="false"
      {...props}
    >
      <image
        href={walking ? friend.walkImage : friend.image}
        width={pose.width}
        height={pose.height}
        fetchPriority={fetchPriority}
        onLoad={onLoad}
      />
      <FriendCharm
        kind={friend.id}
        charm={friend.charm}
        headwear={friend.headwear}
        walking={walking}
      />
    </svg>
  )
}
