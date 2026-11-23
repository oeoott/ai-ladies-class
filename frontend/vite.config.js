import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  // The emotion and tale data live in ../backend/app/content (shared with the backend).
  server: { fs: { allow: ['..'] } },
})
