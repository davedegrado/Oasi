import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // mode 'artifact': build statica con percorsi relativi, senza service worker
  base: mode === 'artifact' || mode === 'pages' ? './' : '/',
  build: {
    chunkSizeWarningLimit: 800,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      disable: mode === 'artifact' || mode === 'pages',
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/favicon.svg', 'icons/favicon-32.png', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Oasi Metropolitana',
        short_name: 'Oasi',
        description:
          'La webapp di Oasi Metropolitana per la danza aerea: calendario, archivio figure e progressi di cerchio e tessuti aerei.',
        lang: 'it',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FFF7FA',
        theme_color: '#E9A4C0',
        categories: ['sports', 'health', 'lifestyle'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Solo precache dell'app shell: nessuna logica offline complessa in questa fase
        globPatterns: ['**/*.{js,css,html,woff2}', 'icons/icon-*.png', 'icons/favicon*'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
}))
