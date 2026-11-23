// Ports for the browser tests only (not the ones `npm run dev` and uvicorn use by default).
export const PORTS = { backend: 8100, online: 5181, offline: 5182 }
export const BACKEND = `http://localhost:${PORTS.backend}`
export const ONLINE = `http://localhost:${PORTS.online}` // app with the server
export const OFFLINE = `http://localhost:${PORTS.offline}` // app without the server
