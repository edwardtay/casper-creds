import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
    },
  },
  server: {
    proxy: {
      '/casper-rpc': {
        target: 'https://node.testnet.casper.network',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/casper-rpc/, '/rpc'),
        secure: true,
      },
    },
  },
  // Handle SPA routing - serve index.html for all routes
  appType: 'spa',
})
