// Lesson 2 mirror: connects the camera to mirrorScore and builds the summary the server may receive.
// end_reason: locked (a result was locked), exit (camera used, finished without a lock),
// cameraDenied (the camera was asked for but never opened), skipped (practised with pictures only).
// One session per visit of the mirror screen (one target feeling). Camera on → calibrate → score → lock.
// Turning the camera off, resting, hiding the tab or leaving clears the score state and its timers
// (calibration, 3 s hold); the next camera start calibrates again. The visit keeps only the best result,
// the number of camera starts and the tracked time, for the record.
import { createMirrorScorer } from './mirrorScore.js'

export const END_REASONS = ['locked', 'skipped', 'cameraDenied', 'exit']

// Scores are shown and recorded only with an APPROVED baseline: measured without issues AND approved by a person
// for this exact version (mirrorBaselineBuild.approveBaseline). AGENTS.md: 유사도와 별 점수는 AI 담당의 기준이
// 확정되기 전까지 산출하지 않는다. 'measured' alone is not enough. `force` (the team's webcam test, ?mirrorScore=1)
// turns it on with any baseline; the record then carries that score_version (e.g. err-v1-prov).
export function baselineApproved(baseline) {
  return baseline?.status === 'measured' && baseline.approval?.approved === true
    && baseline.approval.version === baseline.version
}

export function scoringEnabled(baseline, force = false) {
  return baselineApproved(baseline) || force === true
}

export function createMirrorSession(baseline, feeling, { force = false } = {}) {
  const scorer = createMirrorScorer(baseline)
  const scoring = scoringEnabled(baseline, force)
  const supported = scoring && Boolean(baseline.emotions?.[feeling])
  if (supported) scorer.setTarget(feeling)
  let attempts = 0
  let denied = false
  let cameraOn = false
  let best = null // { score, stars, locked }
  let trackedSec = 0
  let sessionTracked = 0
  let lastFace = null // presence-only tracking (scoring off)

  function keep() {
    const now = scorer.summary()
    trackedSec += now.trackedSec - sessionTracked
    sessionTracked = now.trackedSec
    if (now.score == null) return
    const better = !best || (now.locked && !best.locked) || (now.locked === best.locked && now.score > best.score)
    if (better) best = { score: now.score, stars: now.stars, locked: now.locked }
  }

  return {
    supported,
    scoring,
    get version() { return scorer.version },
    cameraStarted(now) {
      attempts += 1
      cameraOn = true
      sessionTracked = 0
      scorer.startCalibration(now)
    },
    cameraFailed() {
      denied = true
      cameraOn = false
    },
    cameraStopped() {
      if (cameraOn && supported) keep()
      cameraOn = false
      sessionTracked = 0
      lastFace = null
      scorer.reset()
      if (supported) scorer.setTarget(feeling)
    },
    // Returns the scorer view, or null when scoring is off or this feeling has no baseline
    // (then only presence is shown, as before). Time with one face is still counted for tracked_sec.
    frame(frame, now) {
      if (!cameraOn) return null
      if (!supported) {
        const one = (frame?.faces?.length ?? 0) === 1
        if (one && lastFace != null && now - lastFace <= 500) trackedSec += (now - lastFace) / 1000
        lastFace = one ? now : null
        return null
      }
      const view = scorer.update(frame, now)
      keep()
      return view
    },
    // Body for api.recordMirror. No blendshape or video data, only the summary.
    record() {
      if (cameraOn && supported) keep()
      const usedCamera = attempts > 0 // cameraStarted is called only once the camera is really on
      const endReason = best?.locked ? 'locked' : usedCamera ? 'exit' : denied ? 'cameraDenied' : 'skipped'
      return {
        mode: usedCamera ? 'camera' : 'touch',
        score: best ? best.score : null,
        skipped: false,
        scoreVersion: usedCamera && supported ? scorer.version : null,
        stars: best ? best.stars : null,
        trackedSec: usedCamera ? Math.round(trackedSec * 10) / 10 : null,
        attempts,
        endReason,
      }
    },
  }
}

// Child-facing line for the scorer view (UX-WRITING: short 존댓말, one thing to do, no countdown or score).
export function mirrorLine(view, baselineFeedback = {}) {
  if (!view) return null
  if (view.phase === 'calibrating') return '얼굴에 힘을 빼고 잠깐 기다려요.'
  if (view.phase === 'paused') {
    return {
      noFace: '얼굴이 화면에 보이게 해 봐요.',
      multiFace: '한 사람만 화면에 보이게 해 봐요.',
      unstable: '잠깐 가만히 있어 봐요.',
      missingData: '표정을 다시 살펴보고 있어요.',
      analysisUnavailable: '표정 분석을 다시 준비하고 있어요.',
    }[view.reason] ?? null
  }
  if (view.phase === 'locked') return '표정을 잘 따라 했어요!'
  if (view.stars >= 1) return '그 표정으로 잠깐 있어 봐요.'
  return view.hint ?? baselineFeedback.keep ?? '표정을 따라 해 봐요.'
}
