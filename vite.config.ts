import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Em desenvolvimento, "npm run dev:web" usa o Vite e manda /api para o Worker local (npm run dev:api, porta 8787).
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:8787' } }
})
