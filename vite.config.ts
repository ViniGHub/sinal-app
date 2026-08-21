/// <reference types="node" />
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// GitHub Pages serves project sites from /<repo>/, so the base path has to
// match. The deploy workflow sets VITE_BASE; local dev and user/org pages
// keep the default '/'.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  resolve: {
    alias: {
      // Cross-feature imports read as '@/features/session/useMesh' instead of
      // a chain of '../../'. Mirrors "paths" in tsconfig.app.json.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
