/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js')
importScripts('/firebase-config')

let initialized = false

// Required by some browsers/FCM: ensure a push handler is registered at eval time.
self.addEventListener('push', (event) => {
  if (!event.data) return
  try {
    const payload = event.data.json()
    const notification = payload.notification || {}
    const title = notification.title || 'Nuovo ordine'
    const options = {
      body: notification.body || 'È arrivato un nuovo ordine',
      icon: '/icons/icon-star.svg',
      data: payload.data || {},
      tag: payload.data?.order_number || `${Date.now()}`,
      renotify: true,
    }
    event.waitUntil(self.registration.showNotification(title, options))
  } catch {
    // ignore
  }
})

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(self.registration.pushManager.getSubscription())
})

function initFirebase(config) {
  if (initialized || !config) return
  firebase.initializeApp(config)
  const messaging = firebase.messaging()

  messaging.onBackgroundMessage((payload) => {
    const notification = payload.notification || {}
    const title = notification.title || 'Nuovo ordine'
    const options = {
      body: notification.body || 'È arrivato un nuovo ordine',
      icon: '/icons/icon-star.svg',
      data: payload.data || {},
      tag: payload.data?.order_number || `${Date.now()}`,
      renotify: true,
    }
    self.registration.showNotification(title, options)
  })

  initialized = true
}

self.addEventListener('notificationclick', (event) => {
  event.notification?.close()
  const target = event.notification?.data?.click_action || '/'
  event.waitUntil((async () => {
    const targetUrl = new URL(target, self.location.origin)
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of allClients) {
      const clientUrl = new URL(client.url)
      if (clientUrl.origin === targetUrl.origin) {
        if ('focus' in client) await client.focus()
        if ('navigate' in client) {
          await client.navigate(targetUrl.href)
        }
        return
      }
    }
    await clients.openWindow(targetUrl.href)
  })())
})

self.addEventListener('install', () => {
  if (self.FIREBASE_CONFIG) {
    initFirebase(self.FIREBASE_CONFIG)
  }
})

self.addEventListener('activate', () => {
  if (self.FIREBASE_CONFIG) {
    initFirebase(self.FIREBASE_CONFIG)
  }
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'INIT_FIREBASE') {
    initFirebase(event.data.config)
  }
})
