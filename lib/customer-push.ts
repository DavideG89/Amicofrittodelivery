'use client'

import { initializeApp, getApps } from 'firebase/app'
import { getMessaging, getToken, isSupported, deleteToken } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY

function hasFirebaseConfig() {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.messagingSenderId &&
      firebaseConfig.appId &&
      vapidKey
  )
}

function getFirebaseApp() {
  return getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
}

async function ensureServiceWorker(config: typeof firebaseConfig) {
  let registration = await navigator.serviceWorker.getRegistration()
  if (!registration) {
    registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' })
  }

  const ready = await navigator.serviceWorker.ready
  ready.active?.postMessage({ type: 'INIT_FIREBASE', config })
  return ready
}

export async function enableCustomerPush(orderNumber: string) {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return { ok: false, reason: 'unsupported' as const }
  }

  const supported = await isSupported().catch(() => false)
  if (!supported) return { ok: false, reason: 'unsupported' as const }
  if (!hasFirebaseConfig()) return { ok: false, reason: 'missing_config' as const }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, reason: 'denied' as const }

  const app = getFirebaseApp()
  const registration = await ensureServiceWorker(firebaseConfig)
  if (!registration || !registration.pushManager) {
    return { ok: false, reason: 'unsupported' as const }
  }

  const messaging = getMessaging(app)
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  })

  if (!token) return { ok: false, reason: 'no_token' as const }

  try {
    localStorage.setItem(`customer-push:${orderNumber}`, token)
    localStorage.setItem('customer-push:active', 'true')
  } catch {
    // ignore storage errors
  }

  const res = await fetch('/api/push/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderNumber, token }),
  })

  if (!res.ok) return { ok: false, reason: 'error' as const }
  return { ok: true as const, token }
}

export async function disableCustomerPush(orderNumber: string) {
  if (typeof window === 'undefined') return { ok: false, reason: 'unsupported' as const }

  let token = ''
  try {
    token = localStorage.getItem(`customer-push:${orderNumber}`) || ''
  } catch {
    token = ''
  }

  try {
    const supported = await isSupported().catch(() => false)
    if (supported) {
      const app = getFirebaseApp()
      const messaging = getMessaging(app)
      await deleteToken(messaging).catch(() => {})
    }
  } catch {
    // ignore
  }

  if (token) {
    await fetch('/api/push/unregister', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderNumber, token }),
    }).catch(() => {})
  }

  try {
    localStorage.removeItem(`customer-push:${orderNumber}`)
    localStorage.removeItem('customer-push:active')
  } catch {
    // ignore
  }

  return { ok: true as const }
}
