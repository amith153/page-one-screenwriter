import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tauri expects a fixed port and wants to see Rust errors in the terminal.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 5173, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  // Pre-bundle everything up front, so the dev server never re-bundles (and reloads) mid-session.
  optimizeDeps: { include: ['@tauri-apps/api/core', '@tauri-apps/api/window', '@tauri-apps/plugin-dialog', 'pdf-lib', '@pdf-lib/fontkit', 'fflate', 'regenerator-runtime/runtime'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
})
