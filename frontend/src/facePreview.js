import simdLoader from '../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js?url'
import simdBinary from '../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm?url'
import basicLoader from '../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.js?url'
import basicBinary from '../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.wasm?url'

import { fromMediaPipe } from './mirrorScore.js'

// About 10 frames a second for the mirror score (계획서: 100ms 안팎). Two faces so a second person
// pauses the score (multiFace) instead of being scored. Check the frame rate on the iPad (numFaces 2 costs more).
export const sampleInterval = 100
export const NUM_FACES = 2
let pendingSetup = Promise.resolve()

// Keep the actual WebAssembly and model downloads behind the camera action.
// Vite supplies URLs for both runtimes, including in a subdirectory build.
// onPresence(true|false|null): a face is in the picture (null: the detector is unavailable).
// onFrame({ faces: [{ blendshape: score }] }, time): every sampled frame, for mirrorScore. Stays on the device.
export function startFacePreview(video, onPresence, onFrame = null) {
  let stopped = false
  let timer
  let detector
  let previousPresence
  let lastVideoTime = -1

  function stop() {
    stopped = true
    clearTimeout(timer)
    detector?.close()
    detector = undefined
  }

  function unavailable() {
    if (stopped) return
    stop()
    onPresence(null)
  }

  function sample() {
    if (stopped) return
    try {
      if (!document.hidden && video.readyState >= 2 && video.videoWidth && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime
        const now = performance.now()
        const result = detector.detectForVideo(video, now)
        const present = result.faceLandmarks.length > 0
        onFrame?.(fromMediaPipe(result), now)
        if (present !== previousPresence) {
          previousPresence = present
          onPresence(present)
        }
      }
      if (!stopped) timer = setTimeout(sample, sampleInterval)
    } catch {
      unavailable()
    }
  }

  // The library initializes a global WASM loader. Serialize rapid stop/restart
  // requests so a dismissed preview cannot race a newly opened one.
  async function initialize() {
    if (stopped) return
    const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
    const useSimd = await FilesetResolver.isSimdSupported()
    if (stopped) return
    const instance = await FaceLandmarker.createFromOptions({
      wasmLoaderPath: useSimd ? simdLoader : basicLoader,
      wasmBinaryPath: useSimd ? simdBinary : basicBinary,
    }, {
      baseOptions: {
        modelAssetPath: `${import.meta.env.BASE_URL}models/face_landmarker.task`,
        delegate: 'CPU',
      },
      runningMode: 'VIDEO',
      numFaces: NUM_FACES,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: false,
    })
    if (stopped) {
      instance.close()
      return
    }
    detector = instance
    sample()
  }

  pendingSetup = pendingSetup.then(initialize).catch(unavailable)
  return stop
}
