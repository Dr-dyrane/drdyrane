import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { attachAnthropicProxy } from './server/anthropicProxy'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const resolvedAnthropicKey =
    process.env.ANTHROPIC_API_KEY ||
    env.ANTHROPIC_API_KEY ||
    env.VITE_ANTHROPIC_API_KEY ||
    ''

  if (resolvedAnthropicKey.trim()) {
    process.env.ANTHROPIC_API_KEY = resolvedAnthropicKey.trim()
  }

  return {
    plugins: [
      react(),
      {
        name: 'dr-dyrane-anthropic-proxy',
        configureServer(server) {
          attachAnthropicProxy(server.middlewares)
        },
        configurePreviewServer(server) {
          attachAnthropicProxy(server.middlewares)
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['logo.png', 'logo_light.png'],
        manifest: {
          name: 'Dr. Dyrane',
          short_name: 'DrDyrane',
          description: 'The Digital Consultant - High-fidelity clinical induction registrar.',
          theme_color: '#000000',
          background_color: '#000000',
          display: 'standalone',
          orientation: 'portrait',
          icons: [
            {
              src: '/logo.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: '/logo.png',
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: '/logo.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        }
      })
    ],
  }
})
