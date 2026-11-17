import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxy = { '/api': env.API_PROXY_TARGET || 'http://127.0.0.1:5001' }
  return { plugins: [react(), tailwindcss()], server: { proxy, strictPort: true }, preview: { proxy } }
})
