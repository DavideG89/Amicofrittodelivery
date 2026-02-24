'use client'

import { initializeApp, getApps } from 'firebase/app'
import { getMessaging, getToken, isSupported, deleteToken } from 'firebase/messaging'

type PushResult =
  | { ok: true; token: string }
  | {
      ok: false
      reason: 'unsupported' | 'denied' | 'missing_config' | 'no_token' | 'error'
      message?: string
    }

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

export async function enableCustomerPush(orderNumber: string): Promise<PushResult> {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return { ok: false, reason: 'unsupported' }
  }
  if (!window.isSecureContext) {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'Le notifiche richiedono HTTPS (oppure localhost).',
    }
  }

  const supported = await isSupported().catch(() => false)
  if (!supported) return { ok: false, reason: 'unsupported', message: 'Browser/dispositivo non supportato.' }
  if (!hasFirebaseConfig()) return { ok: false, reason: 'missing_config' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, reason: 'denied' }

  const app = getFirebaseApp()
  const registration = await ensureServiceWorker(firebaseConfig)
  if (!registration || !registration.pushManager) {
    return { ok: false, reason: 'unsupported' }
  }

  let token = ''
  try {
    const messaging = getMessaging(app)
    token = (await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    })) || ''
  } catch (error) {
    const message = error instanceof Error ? error.message : 'FCM token error'
    return { ok: false, reason: 'error', message }
  }

  if (!token) return { ok: false, reason: 'no_token' }

  const res = await fetch('/api/push/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderNumber, token }),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const message =
      typeof data?.error === 'string' ? data.error : `Errore registrazione push (${res.status})`
    return { ok: false, reason: 'error', message }
  }

  try {
    localStorage.setItem(`customer-push:${orderNumber}`, token)
    localStorage.setItem('customer-push:active', 'true')
  } catch {
    // ignore storage errors
  }

  return { ok: true, token }
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
