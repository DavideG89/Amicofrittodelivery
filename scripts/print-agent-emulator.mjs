#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'

const BASE_URL = (process.env.PRINT_BASE_URL || 'https://v0-amicofritto.vercel.app').replace(/\/+$/, '')
const PRINTER_AGENT_KEY = process.env.PRINTER_AGENT_KEY || ''
const PRINTER_ID = process.env.PRINTER_ID || 'escpos-emulator'
const POLL_MS = Number.parseInt(process.env.PRINTER_POLL_MS || '2000', 10)
const SAVE_DIR = process.env.PRINTER_SAVE_DIR || ''

if (!PRINTER_AGENT_KEY) {
  console.error('Errore: manca PRINTER_AGENT_KEY')
  console.error('Esempio: PRINTER_AGENT_KEY=open_print-01 node scripts/print-agent-emulator.mjs')
  process.exit(1)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function sanitizeFileName(input) {
  return String(input || '')
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .slice(0, 80)
}

function buildReceiptPreview(job) {
  const order = job?.order || {}
  const store = job?.storeInfo || {}
  const items = Array.isArray(order.items) ? order.items : []
  const lines = [
    '==============================',
    String(store.name || 'AMICO FRITTO'),
    String(store.address || ''),
    String(store.phone ? `Tel: ${store.phone}` : ''),
    '------------------------------',
    `COMANDA: #${order.order_number || job.orderNumber || 'N/A'}`,
    `Tipo: ${order.order_type || 'N/A'}`,
    `Cliente: ${order.customer_name || 'N/A'}`,
    `Pagamento: ${order.payment_method || 'N/A'}`,
    '------------------------------',
  ]

  for (const item of items) {
    const qty = Number(item?.quantity || 0)
    const name = String(item?.name || 'Prodotto')
    const price = Number(item?.price || 0)
    lines.push(`${qty}x ${name}  EUR ${price.toFixed(2)}`)
  }

  lines.push('------------------------------')
  if (Number(order.discount_amount || 0) > 0) {
    const discountCode = String(order.discount_code || '').trim()
    if (discountCode) lines.push(`Sconto applicato: ${discountCode}`)
    lines.push(`Sconto: -EUR ${Number(order.discount_amount || 0).toFixed(2)}`)
  }
  lines.push(`TOTALE: EUR ${Number(order.total || 0).toFixed(2)}`)
  if (order.notes) lines.push(`Note: ${String(order.notes)}`)
  lines.push('==============================')

  return lines.filter(Boolean).join('\n')
}

async function apiPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PRINTER_AGENT_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body || {}),
  })

  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }

  if (!res.ok) {
    const msg = json?.error || json?.raw || `HTTP ${res.status}`
    throw new Error(msg)
  }

  return json
}

async function claimJob() {
  const data = await apiPost(`${BASE_URL}/api/print-agent/jobs/claim`, { printerId: PRINTER_ID })
  return data?.job || null
}

async function completeJob(jobId) {
  await apiPost(`${BASE_URL}/api/print-agent/jobs/${jobId}/complete`, {})
}

async function failJob(jobId, errorMessage) {
  await apiPost(`${BASE_URL}/api/print-agent/jobs/${jobId}/fail`, {
    error: String(errorMessage || 'Errore emulatore'),
    retryInSeconds: 20,
  })
}

async function savePreview(job, preview) {
  if (!SAVE_DIR) return
  await fs.mkdir(SAVE_DIR, { recursive: true })
  const orderNumber = sanitizeFileName(job?.orderNumber || job?.order?.order_number || 'order')
  const filePath = path.join(SAVE_DIR, `${Date.now()}-${orderNumber}.txt`)
  await fs.writeFile(filePath, `${preview}\n`, 'utf8')
  console.log(`[EMULATOR] Salvato: ${filePath}`)
}

async function start() {
  console.log(`[EMULATOR] Avvio su ${BASE_URL}`)
  console.log(`[EMULATOR] Printer ID: ${PRINTER_ID}`)
  console.log('[EMULATOR] In ascolto coda print_jobs...')

  while (true) {
    try {
      const job = await claimJob()
      if (!job) {
        await sleep(POLL_MS)
        continue
      }

      const preview = buildReceiptPreview(job)
      console.log('\n[EMULATOR] Nuova comanda')
      console.log(preview)
      await savePreview(job, preview)

      await completeJob(job.id)
      console.log(`[EMULATOR] Job ${job.id} -> printed`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[EMULATOR] Errore: ${message}`)
      await sleep(POLL_MS)
    }
  }
}

start().catch(error => {
  console.error(error)
  process.exit(1)
})
