import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
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

/** Affiche l’URL mobile au démarrage (localhost ne marche pas sur téléphone). */
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

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), '')
  const trim = (v) => (v == null ? '' : String(v).trim())

  const viteSupabaseUrl = trim(process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL)
  const viteSupabaseAnonKey = trim(process.env.VITE_SUPABASE_ANON_KEY || fileEnv.VITE_SUPABASE_ANON_KEY)

  if (mode === 'production') {
    console.info('[CITYMO build] Supabase inject:', {
      hasUrl: Boolean(viteSupabaseUrl),
      keyLength: viteSupabaseAnonKey.length,
      urlHost: viteSupabaseUrl ? (() => {
        try { return new URL(viteSupabaseUrl).host } catch { return 'invalid' }
      })() : '—',
    })
  }

  return {
    plugins: [react(), basicSsl(), mobileUrlPlugin()],
    envPrefix: 'VITE_',
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(viteSupabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(viteSupabaseAnonKey),
    },
    server: {
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
    preview: {
      https: true,
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
    },
  }
})
