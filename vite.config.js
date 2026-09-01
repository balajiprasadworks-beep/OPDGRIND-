import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative asset URLs, so a build drops straight onto GitHub Pages, a
  // hospital intranet subpath, or any static host without reconfiguring.
  base: './',
  build: { outDir: 'dist', assetsInlineLimit: 0 },
  server: { host: true }
})
