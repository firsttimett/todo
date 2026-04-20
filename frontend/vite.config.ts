import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const apiTarget = env.VITE_API_URL || 'http://localhost:8080';
  const pollingInterval = Number(env.VITE_POLLING_INTERVAL || '100');
  const watch =
    env.VITE_USE_POLLING === 'true'
      ? {
          usePolling: true,
          interval: Number.isNaN(pollingInterval) ? 100 : pollingInterval,
        }
      : undefined;

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'Not Now',
          short_name: 'NNow',
          description: 'A simple todo list application',
          theme_color: '#6366f1',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          icons: [
            {
              src: '/logo.svg',
              sizes: 'any',
              type: 'image/svg+xml',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          // Prevent the SW from intercepting API routes — without this,
          // navigations to /api/auth/callback are served index.html by the SW
          // instead of reaching the server, breaking the OAuth callback.
          navigateFallbackDenylist: [/^\/api\//],
        },
      }),
    ],
    test: {
      include: ['src/**/*.test.{ts,tsx}'],
      exclude: ['tests/e2e/**'],
    },
    server: {
      watch,
      proxy: {
        // Single backend handles /api/auth/* and /api/todo/* — no path rewriting needed.
        // In production, Firebase Hosting rewrites /api/** to the Cloud Run service.
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
