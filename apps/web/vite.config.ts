import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'
import pkg from './package.json' with { type: 'json' }

/**
 * `vite build --mode native` makes the bundle the iOS and Android shells ship (D23). It
 * runs on capacitor://localhost, so it must be told where the API is; fail the build
 * rather than ship an app that calls itself.
 */
function requireApiOrigin(): Plugin {
  return {
    name: 'require-api-origin',
    config(_config, { mode }) {
      if (mode !== 'native') return
      const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), 'VITE_')
      if (!/^https:\/\//.test(env.VITE_API_ORIGIN ?? '')) {
        throw new Error(
          'VITE_API_ORIGIN must be the https origin of the API for a native build. Copy apps/web/.env.example to apps/web/.env.native and set it.',
        )
      }
    },
  }
}

export default defineConfig({
  plugins: [
    requireApiOrigin(),
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-32.png', 'favicon-16.png', 'apple-touch-icon-180.png'],
      manifest: {
        name: 'Minori',
        short_name: 'Minori',
        description: 'Phone-first nutrition tracker with AI food logging.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0c0f14',
        theme_color: '#0c0f14',
        // Every size a launcher, a store or a splash screen asks for; generated from docs/brand/minori-logo.png.
        icons: [
          ...[48, 72, 96, 128, 144, 152, 192, 256, 384, 512].map((size) => ({
            src: `/icons/icon-${size}.png`,
            sizes: `${size}x${size}`,
            type: 'image/png',
          })),
          {
            src: '/icons/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        categories: ['health', 'food', 'lifestyle'],
      },
      workbox: {
        // App shell only. API responses are never cached by the service worker.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  define: { __APP_VERSION__: JSON.stringify(`v${pkg.version}`) },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: false } },
  },
  build: { target: 'es2022' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
