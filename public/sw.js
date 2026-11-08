// PhotoFlow service worker: shows Sandy's push alerts and opens the Studio when tapped.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Sandy', {
      body: data.body || 'You have something to check.',
      icon: '/app-icon-192.png',
      badge: '/app-icon-192.png',
      tag: data.tag || 'sandy',
      data: { url: data.url || '/studio' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/studio'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.includes('/studio'))
      return open ? open.focus() : self.clients.openWindow(url)
    }),
  )
})
