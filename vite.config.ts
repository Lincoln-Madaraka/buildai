import { defineConfig } from 'vite'

// Relative base so the build works on any host or sub-path (Vercel, Netlify, GitHub Pages).
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
  },
})
