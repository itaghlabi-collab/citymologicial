/**
 * CITYMO Service Worker — assets statiques uniquement.
 *
 * Cache autorisé : JS build, CSS, fonts, images, logo, manifest.
 * Tout le reste (API, auth, Supabase, Railway, Drive, uploads, etc.) = NetworkOnly.
 *
 * Ne pas appeler skipWaiting() ni clientsClaim() automatiquement.
 * skipWaiting() uniquement si le client envoie { type: 'SKIP_WAITING' } (bouton "Mettre à jour").
 * Ne pas enregistrer de handlers push / notification.
 */
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute, setDefaultHandler } from 'workbox-routing'
import { CacheFirst, NetworkOnly } from 'workbox-strategies'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

/** Activation manuelle uniquement (jamais automatique). */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

const networkOnly = new NetworkOnly()

/** Défaut : aucune mise en cache (données métier, auth, etc.). */
setDefaultHandler(networkOnly)

function isForbiddenUrl(url) {
  const host = url.hostname.toLowerCase()
  const path = url.pathname.toLowerCase()
  const search = url.search.toLowerCase()

  if (path === '/api' || path.startsWith('/api/')) return true

  if (host === 'supabase.co' || host.endsWith('.supabase.co')) return true
  if (host === 'railway.app' || host.endsWith('.railway.app')) return true

  if (
    host.includes('drive.google.com') ||
    host.includes('googleapis.com') ||
    host.includes('googleusercontent.com') ||
    host.includes('docs.google.com')
  ) {
    return true
  }

  if (
    path.includes('/upload') ||
    path.includes('/download') ||
    path.includes('/storage/') ||
    path.includes('/object/') ||
    path.includes('/sauvegarde') ||
    path.includes('/backup')
  ) {
    return true
  }

  if (
    url.searchParams.has('token') ||
    url.searchParams.has('access_token') ||
    url.searchParams.has('X-Amz-Signature') ||
    url.searchParams.has('X-Amz-Credential') ||
    url.searchParams.has('X-Goog-Signature') ||
    url.searchParams.has('Signature') ||
    url.searchParams.has('sig') ||
    search.includes('signed')
  ) {
    return true
  }

  return false
}

function isMutatingMethod(method) {
  const m = (method || 'GET').toUpperCase()
  return m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE'
}

function isSameOriginStaticAsset({ request, url }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false
  if (url.origin !== self.location.origin) return false
  if (isForbiddenUrl(url)) return false

  const dest = request.destination
  if (dest === 'script' || dest === 'style' || dest === 'font' || dest === 'image') {
    return true
  }

  return /\.(?:js|mjs|css|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|ico|webmanifest)$/i.test(
    url.pathname,
  )
}

/** API / Supabase / Railway / Drive / uploads / mutations → NetworkOnly. */
registerRoute(({ request, url }) => isMutatingMethod(request.method) || isForbiddenUrl(url), networkOnly)

/** Assets statiques same-origin uniquement. */
registerRoute(
  isSameOriginStaticAsset,
  new CacheFirst({
    cacheName: 'citymo-static-assets-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({
        maxEntries: 64,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      }),
    ],
  }),
)
