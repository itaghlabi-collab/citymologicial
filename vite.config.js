import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import os from 'node:os'

function lanIp() {
  try {
    for (const ifaces of Object.values(os.networkInterfaces())) {
      for (const iface of ifaces || []) {
        if (iface.family === 'IPv4' && !iface.internal) return iface.address
      }
    }
  } catch {
    /* ignore — sandbox / permissions */
  }
  return null
}

/** Affiche l’URL mobile au démarrage (dev local uniquement). */
function mobileUrlPlugin() {
  return {
    name: 'citymo-mobile-url',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const ip = lanIp()
        if (ip) {
          const proto = server.config.server.https ? 'https' : 'http'
          console.info('\n  📱 Mobile (même Wi‑Fi) : ' + proto + '://' + ip + ':5173/')
          if (proto === 'https') {
            console.info('  ⚠️  iPhone : accepter le certificat auto-signé (Avancé → Continuer)\n')
          } else {
            console.info('  ⚠️  iPhone : caméra custom impossible en HTTP — utilisez HTTPS\n')
          }
        }
      })
    },
  }
}

async function devPlugins() {
  const plugins = [mobileUrlPlugin()]
  try {
    const { default: basicSsl } = await import('@vitejs/plugin-basic-ssl')
    plugins.unshift(basicSsl())
  } catch {
    console.warn('[CITYMO] @vitejs/plugin-basic-ssl absent — dev sans HTTPS local')
  }
  return plugins
}

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), '')
  const trim = (v) => (v == null ? '' : String(v).trim())

  const viteSupabaseUrl = trim(process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL)
  const viteSupabaseAnonKey = trim(process.env.VITE_SUPABASE_ANON_KEY || fileEnv.VITE_SUPABASE_ANON_KEY)
  const buildId = trim(process.env.VERCEL_GIT_COMMIT_SHA || process.env.VITE_BUILD_ID || fileEnv.VITE_BUILD_ID)
    || new Date().toISOString().slice(0, 19)

  const plugins = [
    react(),
    {
      name: 'citymo-build-meta',
      transformIndexHtml(html) {
        return html.replace(
          '</head>',
          `    <meta name="citymo-build" content="${buildId}" />\n  </head>`,
        );
      },
    },
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'prompt',
      injectRegister: false,
      manifest: false,
      injectManifest: {
        globPatterns: [
          '**/*.{js,mjs,css,woff,woff2,ttf,otf,eot,png,jpg,jpeg,gif,svg,webp,ico,webmanifest}',
        ],
        globIgnores: [
          '**/*.map',
          '**/sw.js',
          '**/sw.mjs',
          '**/sounds/**',
        ],
        // Bundle principal > 2 MiB : autorisé (assets JS générés uniquement)
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Pas de skipWaiting / clientsClaim automatiques
        injectionPoint: 'self.__WB_MANIFEST',
      },
      devOptions: {
        enabled: false,
      },
    }),
  ]
  if (mode !== 'production') {
    plugins.push(...(await devPlugins()))
  }

  return {
    plugins,
    envPrefix: 'VITE_',
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(viteSupabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(viteSupabaseAnonKey),
      'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId),
    },
    server: mode === 'production' ? undefined : {
      https: true,
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
      hmr: {
        clientPort: 5173,
      },
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    preview: mode === 'production' ? undefined : {
      https: true,
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
    },
  }
})
