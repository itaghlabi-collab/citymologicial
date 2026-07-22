/**
 * CITYMO Service Worker — assets statiques + affichage Web Push.
 *
 * Cache autorisé : JS build, CSS, fonts, images, logo, manifest.
 * Tout le reste (API, auth, Supabase, Railway, Drive, uploads, etc.) = NetworkOnly.
 *
 * Ne pas appeler skipWaiting() automatiquement.
 * skipWaiting() uniquement si le client envoie { type: 'SKIP_WAITING' } (bouton "Mettre à jour").
 * clients.claim() au activate : prend le contrôle après skipWaiting (pas de takeover silencieux).
 *
 * Push : affichage système uniquement (pas de logique métier / pas d'API / pas de Supabase).
 */
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute, setDefaultHandler } from 'workbox-routing'
import { CacheFirst, NetworkOnly } from 'workbox-strategies'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'
import { parsePushPayload, resolvePushOpenUrl } from './pwa/swPushPayload.js'

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

/** Activation manuelle uniquement (jamais automatique). */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

/** Réception Push → notification système (aucune logique métier). */
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let raw = null
    try {
      raw = event.data ? await event.data.text() : null
    } catch {
      try {
        raw = event.data ? event.data.json() : null
      } catch {
        raw = null
      }
    }

    const payload = parsePushPayload(raw)
    await self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      badge: payload.badge,
      tag: payload.tag,
      renotify: Boolean(payload.tag),
      data: payload.data,
    })
  })())
})

/** Clic notification → focus client CITYMO ou openWindow. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const data = event.notification?.data && typeof event.notification.data === 'object'
    ? event.notification.data
    : {}
  const targetUrl = resolvePushOpenUrl(
    data.url || data.action_url || data.actionUrl || '/',
    self.location.origin,
  )

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    })

    for (const client of allClients) {
      try {
        const clientUrl = new URL(client.url)
        if (clientUrl.origin === self.location.origin && 'focus' in client) {
          await client.focus()
          try {
            client.postMessage({
              type: 'CITYMO_PUSH_NAVIGATE',
              url: targetUrl,
              data,
            })
          } catch {
            /* ignore */
          }
          return
        }
      } catch {
        /* ignore bad client url */
      }
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl)
    }
  })())
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
