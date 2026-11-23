// Guardian sign-in, the chosen child profile, and which child id learning requests use.
// Rules: backend/README.md "프론트 연결 메모".
export const GUARDIAN_KEY = 'maeum-forest.guardian.v1'
export const DEVICE_KEY = 'maeum-forest.child-id.v1'

export function emptyGuardian() {
  return { token: null, email: '', profileId: null, profileName: '', linkedDevice: null }
}

const text = (value) => (typeof value === 'string' && value ? value : null)

export function readGuardian(raw) {
  try {
    const saved = JSON.parse(raw)
    if (!saved || typeof saved !== 'object') return emptyGuardian()
    return {
      token: text(saved.token),
      email: text(saved.email) || '',
      profileId: text(saved.profileId),
      profileName: text(saved.profileName) || '',
      linkedDevice: text(saved.linkedDevice),
    }
  } catch {
    return emptyGuardian()
  }
}

// Learning, walk, talk and placement requests.
// Before this device is linked: no token, device id. After: profile id and token, never the device id again.
// Returns null when the device is linked but the sign-in has expired; those requests are skipped.
export function learnerFor(guardian, deviceId) {
  if (guardian.linkedDevice && guardian.linkedDevice === deviceId) {
    return guardian.token && guardian.profileId ? { childId: guardian.profileId, token: guardian.token } : null
  }
  return { childId: deviceId, token: null }
}

// link-device is called the first time a profile is chosen on this device (and retried until it works).
export function needsLink(guardian, deviceId) {
  return Boolean(guardian.token && guardian.profileId && deviceId && guardian.linkedDevice !== deviceId)
}

// While this device's records move to a profile, learning requests wait here instead of using the device id
// (the server stops accepting it once the link starts). finish() runs after the guardian state is updated, so
// the waiting requests go out with the profile id and token, or with the device id when the link failed.
export function createLinkGate(current) {
  let waiting = null
  let release = null
  return {
    learner: () => waiting ?? current(),
    get linking() {
      return waiting !== null
    },
    start() {
      if (!waiting) waiting = new Promise((resolve) => { release = resolve })
    },
    finish() {
      if (!waiting) return
      const done = release
      waiting = null
      release = null
      done(current())
    },
  }
}

// One account has one child. Its nickname is this device's forest friend name, or the friend's own name when empty.
export function childNickname(nickname, friendName) {
  return (typeof nickname === 'string' ? nickname.trim() : '') || friendName
}

export const signedIn = (guardian, { token, email }) => ({ ...guardian, token, email })
export const choseProfile = (guardian, profile) => ({ ...guardian, profileId: profile.id, profileName: profile.nickname })
export const linkedDevice = (guardian, deviceId) => ({ ...guardian, linkedDevice: deviceId })
export const expired = (guardian) => ({ ...guardian, token: null })

export function newDeviceId(uuid = () => crypto.randomUUID()) {
  return 'device-' + uuid()
}

// --- Browser storage. Everything keeps working in memory when storage is unavailable. ---
let memoryGuardian = emptyGuardian()
let memoryDevice = null

export function loadGuardian() {
  try {
    const raw = localStorage.getItem(GUARDIAN_KEY)
    memoryGuardian = raw ? readGuardian(raw) : memoryGuardian
  } catch {
    // keep the in-memory copy
  }
  return memoryGuardian
}

export function saveGuardian(guardian) {
  memoryGuardian = guardian
  try {
    localStorage.setItem(GUARDIAN_KEY, JSON.stringify(guardian))
  } catch {
    // the in-memory copy is used for this visit
  }
}

export function deviceId() {
  try {
    const saved = localStorage.getItem(DEVICE_KEY)
    if (saved) return saved
    const created = newDeviceId()
    localStorage.setItem(DEVICE_KEY, created)
    return created
  } catch {
    memoryDevice ??= newDeviceId(() => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)))
    return memoryDevice
  }
}

// Sign-out: forget the account and start a fresh device id (a linked id is no longer usable without a token).
export function signOutDevice() {
  memoryDevice = null
  try {
    localStorage.removeItem(DEVICE_KEY)
  } catch {
    // nothing stored
  }
  saveGuardian(emptyGuardian())
  return deviceId()
}

export function currentLearner() {
  return learnerFor(loadGuardian(), deviceId())
}
