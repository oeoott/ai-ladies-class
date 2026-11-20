import React, { useId } from 'react'
import { FriendCharm } from './FriendLook.jsx'

// Coordinates are in pixels of the three original, transparent cover illustrations.
const faces = {
  rabbit: {
    width: 445,
    height: 724,
    eyes: [
      [171, 307],
      [306, 302],
    ],
    eyeR: [16, 19],
    mouth: [241, 346],
    muzzleSample: 40,
    ink: '#794720',
    closeUp: '54 33 163 156',
    paw: 'M-5 330H56L62 349Q92 347 109 393Q120 416 144 430L160 475 155 502 119 519H-5Z',
    wrist: [142, 479],
  },
  lion: {
    width: 590,
    height: 724,
    eyes: [
      [230, 291],
      [373, 284],
    ],
    eyeR: [18, 20],
    mouth: [305, 335],
    muzzleSample: 38,
    ink: '#874d1f',
    closeUp: '32 13 201 193',
    paw: 'M35 349L72 348Q88 321 109 343Q130 325 155 349Q166 357 176 380L205 412 243 488 184 517 52 446Z',
    wrist: [207, 478],
    browMarks: [
      [224, 235],
      [376, 230],
    ],
  },
  bear: {
    width: 500,
    height: 667,
    eyes: [
      [191, 224],
      [347, 222],
    ],
    eyeR: [19, 21],
    mouth: [272, 273],
    muzzleSample: 35,
    ink: '#683c20',
    closeUp: '32 6 202 194',
    paw: 'M-5 254L61 274Q92 267 114 300Q130 338 158 356L173 413 141 444 80 428-5 384Z',
    wrist: [145, 410],
  },
}

// Keep animation coordinates local to the feature. Its clipped window stays attached to the face.
function FacePatch({ imageId, x, y, width, height, scale = 1, className }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <svg
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        overflow="hidden"
      >
        <g className={className + ' edu-painted-patch'}>
          <svg
            width={width}
            height={height}
            viewBox={`${x - width / 2} ${y - height / 2} ${width} ${height}`}
            overflow="hidden"
          >
            <use href={'#' + imageId} />
          </svg>
        </g>
      </svg>
    </g>
  )
}

function Eyes({ face, feeling, imageId, softEdge }) {
  const [rx, ry] = face.eyeR
  const id = useId()
  return (
    <>
      {face.eyes.map(([x, y], index) => {
        const maskId = id + '-eye-' + index
        // The clear fur between the eyes and above the nose has no lash or eyebrow marks.
        return (
          <React.Fragment key={index}>
            <mask
              id={maskId}
              maskUnits="userSpaceOnUse"
              x={x - rx - 8}
              y={y - ry - 8}
              width={2 * rx + 16}
              height={2 * ry + 16}
            >
              <ellipse cx={x} cy={y} rx={rx + 8} ry={ry + 8} fill={softEdge} />
            </mask>
            <g mask={'url(#' + maskId + ')'}>
              <use href={'#' + imageId} x={(index === 0 ? -1 : 1) * (2 * rx + 6)} y={ry + 4} />
            </g>
            <FacePatch
              imageId={imageId}
              x={x}
              y={y}
              width={2 * rx + 6}
              height={2 * ry + 6}
              scale={feeling === 'surprise' ? 1.16 : 1}
              className="edu-character-eyes"
            />
          </React.Fragment>
        )
      })}
    </>
  )
}

function Brows({ face, feeling, imageId, softEdge }) {
  const id = useId()
  if (feeling === 'joy' || feeling === 'neutral') return null
  return (
    <>
      {face.browMarks?.map(([x, y], index) => (
        <React.Fragment key={index}>
          <mask
            id={id + index}
            maskUnits="userSpaceOnUse"
            x={x - 20}
            y={y - 12}
            width="40"
            height="24"
          >
            <ellipse cx={x} cy={y} rx="20" ry="12" fill={softEdge} />
          </mask>
          <g mask={'url(#' + id + index + ')'}>
            <use href={'#' + imageId} y="-18" />
          </g>
        </React.Fragment>
      ))}
      {face.eyes.map(([x, y], index) => (
        <g key={index} transform={`translate(${x} ${y - face.eyeR[1] - 10})`}>
          <g transform={index === 1 ? 'scale(-1 1)' : undefined}>
            <path
              className={feeling === 'anger' ? 'edu-character-brow' : undefined}
              d={
                feeling === 'anger'
                  ? 'M-14 -7 Q-4 -2 13 5'
                  : feeling === 'sad'
                    ? 'M-14 3 Q1 2 12 -8'
                    : 'M-14 -4 Q-3 -13 11 -8'
              }
              fill="none"
              stroke={face.ink}
              strokeWidth="5"
              strokeOpacity=".91"
              strokeLinecap="round"
            />
          </g>
        </g>
      ))}
    </>
  )
}

function Mouth({ face, feeling, imageId, softEdge }) {
  const id = useId()
  const [x, y] = face.mouth
  return (
    <>
      <mask id={id} maskUnits="userSpaceOnUse" x={x - 60} y={y - 24} width="120" height="55">
        <ellipse cx={x} cy={y + 2} rx="59" ry="26" fill={softEdge} />
      </mask>
      <g mask={'url(#' + id + ')'}>
        <use href={'#' + imageId} y={-face.muzzleSample} />
      </g>
      {feeling === 'joy' ? (
        <FacePatch
          imageId={imageId}
          x={x}
          y={y + 3}
          width={106}
          height={50}
          className="edu-character-mouth"
        />
      ) : (
        <g transform={`translate(${x} ${y})`}>
          <path
            d="M0 -16 Q1 -10 0 -7"
            fill="none"
            stroke={face.ink}
            strokeWidth="4"
            strokeLinecap="round"
          />
          {feeling === 'surprise' ? (
            <g className="edu-character-mouth">
              <ellipse cy="13" rx="12" ry="17" fill={face.ink} />
              <path d="M-7 21q7-7 14-1-5 7-13 4Z" fill="#c17859" />
            </g>
          ) : (
            <path
              className="edu-character-mouth"
              d={
                feeling === 'sad'
                  ? 'M-29 13 Q-6 -9 3 -5 Q14 -7 29 11'
                  : feeling === 'neutral'
                    ? 'M-19 2 Q-8 4 0 -2 Q8 4 19 2'
                    : 'M-24 3 Q-9 0 0 -3 Q10 0 23 1'
              }
              fill="none"
              stroke={face.ink}
              strokeWidth="5"
              strokeLinecap="round"
            />
          )}
        </g>
      )}
    </>
  )
}

function WavingPose({ imageId, face }) {
  const id = useId()
  return (
    <>
      <defs>
        <clipPath id={id + '-paw'}>
          <path d={face.paw} />
        </clipPath>
      </defs>
      <use href={'#' + imageId} />
      <g transform={`translate(${face.wrist[0]} ${face.wrist[1]})`}>
        <g className="edu-character-paw">
          <g
            transform={`translate(${-face.wrist[0]} ${-face.wrist[1]})`}
            clipPath={'url(#' + id + '-paw)'}
          >
            <use href={'#' + imageId} />
          </g>
        </g>
      </g>
    </>
  )
}

export function PaintedFriend({
  kind,
  src,
  label,
  feeling,
  gesture,
  actionKey,
  active,
  closeUp,
  charm,
  headwear,
}) {
  const id = useId()
  const face = faces[kind]
  const imageId = id + '-original'
  const softEdge = 'url(#' + id + '-soft)'
  const insetTop = 5
  const scale = 297 / face.height
  const insetLeft = 133 - (face.width * scale) / 2
  return (
    <svg
      className="edu-portrait"
      viewBox={closeUp ? face.closeUp : '7 0 252 317'}
      role="img"
      aria-labelledby={id}
      data-active={active}
      data-friend={kind}
    >
      <title id={id}>{label}</title>
      <defs>
        <image id={imageId} href={src} width={face.width} height={face.height} />
        <radialGradient id={id + '-soft'}>
          <stop offset=".78" stopColor="white" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>
      {!closeUp && <ellipse cx="138" cy="300" rx="57" ry="6" fill="#454a28" opacity=".18" />}
      <g transform={`translate(${insetLeft} ${insetTop}) scale(${scale})`}>
        <g key={actionKey} data-gesture={gesture} data-feeling={feeling}>
          <g className="edu-character-head">
            {gesture === 'speak' ? (
              <WavingPose imageId={imageId} face={face} />
            ) : (
              <use href={'#' + imageId} />
            )}
            <Eyes {...{ face, feeling, imageId, softEdge }} />
            <Brows {...{ face, feeling, imageId, softEdge }} />
            <Mouth {...{ face, feeling, imageId, softEdge }} />
            <FriendCharm kind={kind} charm={charm} headwear={headwear} />
          </g>
        </g>
      </g>
    </svg>
  )
}
