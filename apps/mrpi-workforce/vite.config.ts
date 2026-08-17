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
      includeAssets: ['mrpi-mark.svg'],
      manifest: {
        name: 'MRPI Workforce',
        short_name: 'MRPI Workforce',
        description: 'Kehadiran, upah dan pendahuluan pekerja MRPI Resources.',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '/',
        lang: 'ms',
        icons: [{ src: '/mrpi-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
    }),
  ],
  test: { environment: 'jsdom', setupFiles: './src/test/setup.ts', css: true },
})
