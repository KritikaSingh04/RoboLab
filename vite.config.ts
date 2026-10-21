/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base path of the deployed site.
// './' (relative) works for GitHub Pages project sites (https://<user>.github.io/<repo>/),
// user sites, custom domains and even opening dist/index.html from a folder, because
// the app uses a HashRouter and never relies on the URL path. Override with
// VITE_BASE=/some/prefix/ if an absolute base is ever required.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? './',
  build: {
    // Heavy libraries (three, recharts, katex) are only imported from lazily
    // loaded experiment pages, so Vite splits them out automatically.
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
