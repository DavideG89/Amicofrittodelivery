'use client'

import { normalizeOrderNumber } from './order-number'

/**
 * Utility per gestire lo storage locale degli ordini
 * Memorizza solo i numeri ordine (non i dati sensibili)
 */

const STORAGE_KEY = 'amico-fritto-orders'
const MAX_ORDERS = 5
const ORDER_RETENTION_DAYS = 7

export interface StoredOrder {
  orderNumber: string
  createdAt: string
  type: 'delivery' | 'takeaway'
}

/**
 * Salva un ordine nel localStorage
 */
export function saveOrderToDevice(orderNumber: string, orderType: 'delivery' | 'takeaway') {
  if (typeof window === 'undefined') return

  try {
    const normalizedOrderNumber = normalizeOrderNumber(orderNumber)
    if (!normalizedOrderNumber) return

    const orders = getStoredOrders()
    
    const newOrder: StoredOrder = {
      orderNumber: normalizedOrderNumber,
      createdAt: new Date().toISOString(),
      type: orderType
    }

    // Aggiungi il nuovo ordine all'inizio
    const updatedOrders = [newOrder, ...orders.filter(o => o.orderNumber !== normalizedOrderNumber)]
    
    // Mantieni solo gli ultimi MAX_ORDERS ordini
    const limitedOrders = updatedOrders.slice(0, MAX_ORDERS)
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(limitedOrders))
    
  } catch (error) {
    console.error('[v0] Error saving order to device:', error)
  }
}

/**
 * Recupera tutti gli ordini dal localStorage
 */
export function getStoredOrders(): StoredOrder[] {
  if (typeof window === 'undefined') return []

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    
    const rawOrders = JSON.parse(stored) as Array<{
      orderNumber?: unknown
      createdAt?: unknown
      type?: unknown
    }>

    if (!Array.isArray(rawOrders)) return []

    const orders: StoredOrder[] = rawOrders
      .map((order) => {
        const orderNumber = normalizeOrderNumber(order.orderNumber)
        const createdAt = typeof order.createdAt === 'string' ? order.createdAt : ''
        const typeRaw = typeof order.type === 'string' ? order.type : ''
        const type: StoredOrder['type'] =
          typeRaw === 'delivery' ? 'delivery' : typeRaw === 'pickup' ? 'takeaway' : 'takeaway'
        if (!orderNumber || !createdAt) return null
        return { orderNumber, createdAt, type }
      })
      .filter((order): order is StoredOrder => Boolean(order))
    
    // Filtra ordini più vecchi della retention configurata
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - ORDER_RETENTION_DAYS)
    
    return orders.filter(order => new Date(order.createdAt) > cutoffDate)
  } catch (error) {
    console.error('[v0] Error reading orders from device:', error)
    return []
  }
}

/**
 * Rimuove un ordine dal localStorage
 */
export function removeOrderFromDevice(orderNumber: string) {
  if (typeof window === 'undefined') return

  try {
    const orders = getStoredOrders()
    const updatedOrders = orders.filter(o => o.orderNumber !== orderNumber)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedOrders))
    
  } catch (error) {
    console.error('[v0] Error removing order from device:', error)
  }
}

/**
 * Cancella tutti gli ordini dal localStorage
 */
export function clearAllOrders() {
  if (typeof window === 'undefined') return

  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.error('[v0] Error clearing orders:', error)
  }
}
