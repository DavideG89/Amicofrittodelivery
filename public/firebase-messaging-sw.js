/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js')
try {
  importScripts('/firebase-config')
} catch (error) {
  console.error('[fcm-sw] failed to import /firebase-config', error)
}

let initialized = false

self.addEventListener('error', (event) => {
  console.error('[fcm-sw] runtime error', event?.error || event?.message || event)
})

self.addEventListener('unhandledrejection', (event) => {
  console.error('[fcm-sw] unhandled rejection', event?.reason || event)
})

function buildNotificationFromPayload(payload) {
  const notification = payload?.notification || {}
  const data = payload?.data || {}
  const title = notification.title || 'Nuovo ordine'
  const options = {
    body: notification.body || 'E arrivato un nuovo ordine',
    icon: '/icons/icon-star.svg',
    data,
    tag: data.order_number || `${Date.now()}`,
    renotify: true,
  }
  return { title, options }
}

// Ensure a push handler is registered at eval time.
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload = {}
    if (event.data) {
      try {
        payload = event.data.json()
      } catch (jsonError) {
        try {
          payload = JSON.parse(event.data.text())
        } catch (textError) {
          console.error('[fcm-sw] failed to parse push payload', { jsonError, textError })
        }
      }
    }

    const { title, options } = buildNotificationFromPayload(payload)
    console.info('[fcm-sw] push event', { hasData: Boolean(event.data), tag: options.tag })
    await self.registration.showNotification(title, options)
  })().catch((error) => {
    console.error('[fcm-sw] push handler failed', error)
  }))
})

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    console.warn('[fcm-sw] pushsubscriptionchange detected')
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true })
    allClients.forEach((client) => {
      client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' })
    })
  })())
})

function initFirebase(config) {
  if (initialized || !config) return
  firebase.initializeApp(config)
  const messaging = firebase.messaging()
  console.info('[fcm-sw] firebase initialized')

  messaging.onBackgroundMessage((payload) => {
    const { title, options } = buildNotificationFromPayload(payload)
    console.info('[fcm-sw] onBackgroundMessage', { tag: options.tag })
    self.registration.showNotification(title, options).catch((error) => {
      console.error('[fcm-sw] showNotification failed in onBackgroundMessage', error)
    })
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
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await clients.claim()
    if (self.FIREBASE_CONFIG) {
      initFirebase(self.FIREBASE_CONFIG)
    }
  })())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'INIT_FIREBASE') {
    console.info('[fcm-sw] INIT_FIREBASE received')
    initFirebase(event.data.config)
  }
})
