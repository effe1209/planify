import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// /engine inoltra al motore pubblico, come la regola in vercel.json (vedi src/lib/engine.js)
const engineProxy = {
  '/engine': {
    target: 'https://provaplanimetria.onrender.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/engine/, ''),
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: engineProxy },
  preview: { proxy: engineProxy },
})
