// Browser tests (npm run e2e). Separate from `npm test`, which runs tests/*.test.js with node --test.
// Three servers start for each run on their own ports, so a running `npm run dev` is not used:
// - backend (memory store, so every run starts empty)
// - the app with VITE_API_URL set (server on) and with it empty (server off)
// The iPad sizes run in Chromium. Safari on a real iPad is still checked by hand.
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'
import { BACKEND, OFFLINE, ONLINE, PORTS } from './e2e/ports.js'

// backend/.venv (made with `python -m venv .venv` in backend/). Quoted: the project path can contain spaces.
const venv = process.platform === 'win32' ? '../backend/.venv/Scripts/python.exe' : '../backend/.venv/bin/python'
const python = JSON.stringify(fileURLToPath(new URL(venv, import.meta.url)))
const ipad = {
  hasTouch: true,
  reducedMotion: 'reduce',
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
  // Fake camera: the mirror step can turn the camera on without a real device or a permission prompt.
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
}

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 2,
  reporter: [['list']],
  use: { trace: 'retain-on-failure', ...ipad },
  projects: [
    { name: 'landscape', use: { viewport: { width: 1180, height: 820 } } },
    { name: 'portrait', use: { viewport: { width: 820, height: 1180 } } },
  ],
  webServer: [
    {
      command: `${python} -m uvicorn app.main:app --port ${PORTS.backend}`,
      cwd: '../backend',
      url: BACKEND + '/health',
      reuseExistingServer: false,
      // MAEUM_IGNORE_DOTENV: never use the real Azure keys in backend/.env during browser tests
      env: { STORE: 'memory', JWT_SECRET: 'e2e-local-secret-0123456789abcdef', CORS_ORIGINS: ONLINE, MAEUM_IGNORE_DOTENV: '1' },
    },
    {
      command: `npx vite --port ${PORTS.online} --strictPort`,
      url: ONLINE,
      reuseExistingServer: false,
      env: { VITE_API_URL: BACKEND },
    },
    {
      command: `npx vite --port ${PORTS.offline} --strictPort`,
      url: OFFLINE,
      reuseExistingServer: false,
      env: { VITE_API_URL: '' },
    },
  ],
})
