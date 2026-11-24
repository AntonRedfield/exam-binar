import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Detect deploy target: Vercel sets VERCEL=1, GitHub Actions sets GITHUB_ACTIONS=true
const isGitHubPages = process.env.GITHUB_ACTIONS === 'true'
const base = isGitHubPages ? '/exam-binar/' : '/'

// Teacher/admin pages and heavy libraries students never need. They are NOT
// downloaded when the app is installed (that download used to be ~2.8 MB and
// competed with the student's login on slow connections); instead they are
// cached the first time a teacher opens them (see runtimeCaching below).
const NOT_PRECACHED = [
  'CreateExam', 'ResultsView', 'Monitor', 'ActiveMonitorHub', 'ExamList', 'TeacherLayout',
  'TeacherDashboard', 'QuestionAnalytics', 'SurveyResponses', 'UnpublishExamModal',
  'QuestionTextEditor', 'ExportPaperExamModal', 'AdminLayout', 'AdminDashboard', 'UserManagement',
  'ExamOversight', 'Analytics', 'ClassManagement', 'LoginLogs',
  'vendor-pdf', 'html2canvas.esm', 'index.es', 'purify.es', 'vision_bundle',
].map(name => `assets/${name}-*.js`)

// https://vite.dev/config/
export default defineConfig({
  define: {
    // Lets the app detect a device clock set in the past (breaks HTTPS → "code 0")
    __BUILD_TIME__: JSON.stringify(Date.now()),
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt': a new version waits until the app decides it is safe to switch
      // (main.jsx never reloads the page during an exam — a reload there would
      // lock the student out as a Returnee).
      registerType: 'prompt',
      // Registered from main.jsx after the page has loaded
      injectRegister: false,
      includeAssets: ['Logo_SNT.webp', 'logo-snt.png'],
      manifest: {
        name: 'Sistem Asesmen Terpadu SNT 10 Kupang',
        short_name: 'SNT 10 Kupang',
        description: 'Sistem Asesmen Terpadu SNT 10 Kupang',
        lang: 'id',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        scope: base,
        start_url: base,
        icons: [
          {
            src: 'logo-snt.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,webp,woff2}'],
        globIgnores: [
          ...NOT_PRECACHED,
          // Original monitoring artwork (replaced by small .webp icons)
          'monitoring-*.svg',
          'binar-logo.png',
          'logo-snt.webp',
          'vite.svg',
        ],
        runtimeCaching: [
          {
            // Page files are content-hashed, so a cached copy never goes stale
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.includes('/assets/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-assets',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/@mediapipe\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mediapipe-wasm-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/storage\.googleapis\.com\/mediapipe-models\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mediapipe-models-cache',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  base,
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React runtime — cached long-term, rarely changes
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Supabase client — separate so auth/data layer is its own chunk
          'vendor-supabase': ['@supabase/supabase-js'],
          // Icons library — large but static, excellent cache candidate
          'vendor-icons': ['lucide-react'],
          // PDF generation — only needed for export, lazy-loaded naturally
          'vendor-pdf': ['jspdf', 'jspdf-autotable'],
        }
      }
    }
  }
})

