import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 'pages' (GitHub Pages) vive in una sottocartella: percorsi del manifest relativi
  const rel = mode === 'pages'
  const p = rel ? '' : '/'
  return {
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
      disable: mode === 'artifact',
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/favicon-32.png', 'icons/apple-touch-icon.png', 'images/logo-oasi.webp'],
      manifest: {
        id: rel ? './' : '/',
        name: 'Oasi Metropolitana',
        short_name: 'Oasi',
        description:
          'La webapp di Oasi Metropolitana per la danza aerea: calendario, archivio figure e progressi di cerchio e tessuti aerei.',
        lang: 'it',
        start_url: rel ? './' : '/',
        scope: rel ? './' : '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FFFFFF',
        theme_color: '#E9A4C0',
        categories: ['sports', 'health', 'lifestyle'],
        icons: [
          { src: `${p}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${p}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
          { src: `${p}icons/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Solo precache dell'app shell: nessuna logica offline complessa in questa fase
        globPatterns: ['**/*.{js,css,html,woff2}', 'icons/icon-*.png', 'icons/favicon*', 'images/logo-oasi.webp'],
        navigateFallback: rel ? null : '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
}
})
