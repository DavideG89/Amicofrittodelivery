import { Capacitor, registerPlugin } from '@capacitor/core'
import type { Order } from './supabase'
import { buildReceiptLines, type StoreInfo } from './print-receipt'

export type NativePrinterDevice = {
  name: string
  address: string
}

type EscPosPrinterPlugin = {
  ensurePermissions(): Promise<{
    bluetoothConnect: string
  }>
  listPairedPrinters(): Promise<{
    printers: NativePrinterDevice[]
  }>
  printReceipt(options: {
    address: string
    lines: string[]
    copies?: number
  }): Promise<{
    ok: boolean
  }>
  openBluetoothSettings(): Promise<void>
}

type StoredPrinterConfig = NativePrinterDevice & {
  savedAt: string
}

const STORAGE_KEY = 'af:native-printer:v1'

const EscPosPrinter = registerPlugin<EscPosPrinterPlugin>('EscPosPrinter')

export function isNativeBluetoothPrintingAvailable() {
  return typeof window !== 'undefined' && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export function getSavedNativePrinterConfig(): StoredPrinterConfig | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredPrinterConfig>
    if (!parsed || typeof parsed.address !== 'string' || typeof parsed.name !== 'string') {
      return null
    }

    return {
      address: parsed.address,
      name: parsed.name,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function hasSavedNativePrinterConfig() {
  return getSavedNativePrinterConfig() !== null
}

export function saveNativePrinterConfig(device: NativePrinterDevice) {
  if (typeof window === 'undefined') return

  const nextValue: StoredPrinterConfig = {
    ...device,
    savedAt: new Date().toISOString(),
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextValue))
}

export function clearSavedNativePrinterConfig() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}

export async function ensureNativePrinterPermissions() {
  if (!isNativeBluetoothPrintingAvailable()) {
    throw new Error('Stampa Bluetooth nativa disponibile solo su Android')
  }

  return EscPosPrinter.ensurePermissions()
}

export async function listNativePairedPrinters() {
  if (!isNativeBluetoothPrintingAvailable()) {
    throw new Error('Stampa Bluetooth nativa disponibile solo su Android')
  }

  await ensureNativePrinterPermissions()
  const result = await EscPosPrinter.listPairedPrinters()
  return Array.isArray(result.printers) ? result.printers : []
}

export async function openNativeBluetoothSettings() {
  if (!isNativeBluetoothPrintingAvailable()) {
    throw new Error('Stampa Bluetooth nativa disponibile solo su Android')
  }

  await EscPosPrinter.openBluetoothSettings()
}

export async function printLinesOnNativePrinter(
  lines: string[],
  options?: {
    address?: string | null
    copies?: number
  }
) {
  if (!isNativeBluetoothPrintingAvailable()) {
    throw new Error('Stampa Bluetooth nativa disponibile solo su Android')
  }

  const savedPrinter = getSavedNativePrinterConfig()
  const address = options?.address?.trim() || savedPrinter?.address || ''
  if (!address) {
    throw new Error('Nessuna stampante Bluetooth configurata')
  }

  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('Comanda vuota')
  }

  await ensureNativePrinterPermissions()
  return EscPosPrinter.printReceipt({
    address,
    lines,
    copies: options?.copies && options.copies > 1 ? Math.min(Math.round(options.copies), 3) : 1,
  })
}

export async function printOrderOnNativePrinter(order: Order, storeInfo?: StoreInfo) {
  const lines = buildReceiptLines(order, storeInfo)
  return printLinesOnNativePrinter(lines)
}

export function buildNativePrinterTestLines(deviceName?: string | null) {
  const timestamp = new Date().toLocaleString('it-IT')

  return [
    'AMICO FRITTO',
    '--------------------------------',
    'TEST STAMPANTE BLUETOOTH',
    deviceName ? `Dispositivo: ${deviceName}` : 'Dispositivo: configurato',
    `Stampato: ${timestamp}`,
    '--------------------------------',
    'Se leggi bene questo testo,',
    'la stampante e configurata.',
    '',
    '1x Fritto misto       EUR 8.50',
    '2x Crocche            EUR 6.00',
    '--------------------------------',
    'TOTALE               EUR 14.50',
  ]
}
