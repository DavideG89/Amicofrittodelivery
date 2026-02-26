'use client'

import { Capacitor } from '@capacitor/core'
import {
  PushNotifications,
  type PushNotificationSchema,
  type ActionPerformed,
  type Token,
} from '@capacitor/push-notifications'

type NativePushResult =
  | { ok: true; token: string }
  | {
      ok: false
      reason: 'unsupported' | 'denied' | 'error' | 'no_token'
      message?: string
    }

type NativePushHandlers = {
  onForegroundNotification?: (notification: PushNotificationSchema) => void
  onNotificationAction?: (action: ActionPerformed) => void
}

declare global {
  // eslint-disable-next-line no-var
  var __adminNativePushListenersBound: boolean | undefined
}

export function isNativeAndroidPushSupported() {
  return typeof window !== 'undefined' && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export async function ensureNativePushChannel() {
  if (!isNativeAndroidPushSupported()) return
  try {
    await PushNotifications.createChannel({
      id: 'orders_high',
      name: 'Ordini Ristorante',
      description: 'Notifiche nuovi ordini',
      importance: 5,
      visibility: 1,
      sound: 'default',
    })
  } catch {
    // ignore channel creation errors
  }
}

export async function bindNativePushListeners(handlers: NativePushHandlers) {
  if (!isNativeAndroidPushSupported()) return
  if (globalThis.__adminNativePushListenersBound) return

  await PushNotifications.addListener('pushNotificationReceived', (notification) => {
    handlers.onForegroundNotification?.(notification)
  })

  await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    handlers.onNotificationAction?.(action)
  })

  globalThis.__adminNativePushListenersBound = true
}

export async function registerNativePushToken(timeoutMs = 15000): Promise<NativePushResult> {
  if (!isNativeAndroidPushSupported()) {
    return { ok: false, reason: 'unsupported', message: 'Push nativa supportata solo su Android wrapper.' }
  }

  const current = await PushNotifications.checkPermissions()
  let permission = current.receive
  if (permission === 'prompt') {
    const requested = await PushNotifications.requestPermissions()
    permission = requested.receive
  }

  if (permission !== 'granted') {
    return { ok: false, reason: 'denied', message: 'Permesso notifiche negato.' }
  }

  await ensureNativePushChannel()

  return await new Promise<NativePushResult>(async (resolve) => {
    let completed = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const finish = (result: NativePushResult) => {
      if (completed) return
      completed = true
      if (timeoutId) clearTimeout(timeoutId)
      void regListener.remove()
      void errListener.remove()
      resolve(result)
    }

    const regListener = await PushNotifications.addListener('registration', (token: Token) => {
      const value = String(token.value || '')
      if (!value) {
        finish({ ok: false, reason: 'no_token', message: 'Token FCM nativo vuoto.' })
        return
      }
      finish({ ok: true, token: value })
    })

    const errListener = await PushNotifications.addListener('registrationError', (error) => {
      finish({
        ok: false,
        reason: 'error',
        message: typeof error?.error === 'string' ? error.error : 'Errore registrazione push nativa.',
      })
    })

    timeoutId = setTimeout(() => {
      finish({ ok: false, reason: 'error', message: 'Timeout registrazione token push nativo.' })
    }, timeoutMs)

    try {
      await PushNotifications.register()
    } catch (error) {
      finish({
        ok: false,
        reason: 'error',
        message: error instanceof Error ? error.message : 'Errore registrazione push nativo.',
      })
    }
  })
}

export async function unregisterNativePush() {
  if (!isNativeAndroidPushSupported()) return { ok: false as const }
  try {
    await PushNotifications.unregister()
  } catch {
    // ignore errors
  }
  return { ok: true as const }
}
