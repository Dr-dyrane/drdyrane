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
    ''

  if (resolvedAnthropicKey.trim()) {
    process.env.ANTHROPIC_API_KEY = resolvedAnthropicKey.trim()
  }

  const resolvedOpenAiKey =
    process.env.OPENAI_API_KEY ||
    env.OPENAI_API_KEY ||
    ''

  if (resolvedOpenAiKey.trim()) {
    process.env.OPENAI_API_KEY = resolvedOpenAiKey.trim()
  }

  const resolvedAnthropicModel =
    process.env.ANTHROPIC_MODEL ||
    env.ANTHROPIC_MODEL ||
    env.CLAUDE_MODEL ||
    ''
  if (resolvedAnthropicModel.trim()) {
    process.env.ANTHROPIC_MODEL = resolvedAnthropicModel.trim()
  }

  const resolvedOpenAiModel =
    process.env.OPENAI_MODEL ||
    env.OPENAI_MODEL ||
    ''
  if (resolvedOpenAiModel.trim()) {
    process.env.OPENAI_MODEL = resolvedOpenAiModel.trim()
  }

  return {
    plugins: [
      react(),
      {
        name: 'dr-dyrane-llm-proxy',
        configureServer(server) {
          attachAnthropicProxy(server.middlewares)
        },
        configurePreviewServer(server) {
          attachAnthropicProxy(server.middlewares)
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['logo.png', 'logo_light.png', 'robots.txt', 'sitemap.xml'],
        manifest: {
          id: '/',
          name: 'Dr. Dyrane',
          short_name: 'DrDyrane',
          description: 'The Digital Consultant - High-fidelity clinical induction registrar.',
          lang: 'en-US',
          dir: 'ltr',
          start_url: '/',
          scope: '/',
          theme_color: '#000000',
          background_color: '#000000',
          display: 'standalone',
          display_override: ['window-controls-overlay', 'standalone'],
          orientation: 'portrait',
          categories: ['medical', 'health', 'productivity'],
          prefer_related_applications: false,
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
