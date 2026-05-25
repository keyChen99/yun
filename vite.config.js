import { defineConfig, splitVendorChunkPlugin } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react(), splitVendorChunkPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000, // 提高报警阈值到 1MB
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000', // 转发 API 请求到后端
    }
  }
})
