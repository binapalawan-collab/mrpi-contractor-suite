import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['mrpi-workforce-icon-v2.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'MRPI Workforce',
        short_name: 'MRPI Workforce',
        description: 'Kehadiran, upah dan pendahuluan pekerja MRPI Resources.',
        theme_color: '#075985',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '/',
        lang: 'ms',
        icons: [
          { src: '/mrpi-workforce-icon-v2.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  test: { environment: 'jsdom', setupFiles: './src/test/setup.ts', css: true },
})
