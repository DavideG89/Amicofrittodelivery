#!/usr/bin/env node

import net from 'node:net'

const BASE_URL = (process.env.PRINT_BASE_URL || 'https://v0-amicofritto.vercel.app').replace(/\/+$/, '')
const PRINTER_AGENT_KEY = process.env.PRINTER_AGENT_KEY || ''
const PRINTER_ID = process.env.PRINTER_ID || 'escpos-tcp-agent'
const POLL_MS = Number.parseInt(process.env.PRINTER_POLL_MS || '1500', 10)
const ESC_POS_HOST = process.env.ESC_POS_HOST || '127.0.0.1'
const ESC_POS_PORT = Number.parseInt(process.env.ESC_POS_PORT || '9100', 10)

if (!PRINTER_AGENT_KEY) {
  console.error('Errore: manca PRINTER_AGENT_KEY')
  console.error(
    'Esempio: PRINTER_AGENT_KEY=open_print-01 ESC_POS_HOST=127.0.0.1 ESC_POS_PORT=9100 node scripts/print-agent-escpos-tcp.mjs'
  )
  process.exit(1)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toPrice(value) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n.toFixed(2) : '0.00'
}

function truncate(text, len = 42) {
  const input = String(text || '')
  if (input.length <= len) return input
  return `${input.slice(0, len - 1)}…`
}

function line(text = '') {
  return Buffer.from(`${text}\n`, 'ascii')
}

function hr() {
  return line('--------------------------------')
}

function alignLeft() {
  return Buffer.from([0x1b, 0x61, 0x00])
}

function alignCenter() {
  return Buffer.from([0x1b, 0x61, 0x01])
}

function bold(on) {
  return Buffer.from([0x1b, 0x45, on ? 0x01 : 0x00])
}

function sizeNormal() {
  return Buffer.from([0x1d, 0x21, 0x00])
}

function sizeDouble() {
  return Buffer.from([0x1d, 0x21, 0x11])
}

function init() {
  return Buffer.from([0x1b, 0x40])
}

function cut() {
  return Buffer.from([0x1d, 0x56, 0x00])
}

function feed(linesCount = 3) {
  return Buffer.from([0x1b, 0x64, Math.max(0, Math.min(linesCount, 10))])
}

function buildEscPosBuffer(job) {
  const order = job?.order || {}
  const store = job?.storeInfo || {}
  const items = Array.isArray(order.items) ? order.items : []
  const orderType = order.order_type === 'delivery' ? 'DOMICILIO' : 'ASPORTO'
  const pay = order.payment_method === 'card' ? 'Carta (POS)' : 'Contanti'

  const chunks = []
  chunks.push(init())
  chunks.push(alignCenter())
  chunks.push(sizeDouble())
  chunks.push(bold(true))
  chunks.push(line(truncate(store.name || 'AMICO FRITTO', 24)))
  chunks.push(bold(false))
  chunks.push(sizeNormal())
  if (store.address) chunks.push(line(truncate(store.address, 42)))
  if (store.phone) chunks.push(line(`Tel: ${store.phone}`))
  chunks.push(hr())

  chunks.push(alignLeft())
  chunks.push(line(`COMANDA: #${order.order_number || job.orderNumber || 'N/A'}`))
  chunks.push(line(`Data: ${new Date(order.created_at || Date.now()).toLocaleString('it-IT')}`))
  chunks.push(hr())

  chunks.push(alignCenter())
  chunks.push(bold(true))
  chunks.push(line(orderType))
  chunks.push(bold(false))
  chunks.push(alignLeft())
  chunks.push(hr())
  chunks.push(line(`Cliente: ${truncate(order.customer_name || '', 30)}`))
  chunks.push(line(`Tel: ${order.customer_phone || ''}`))
  if (order.customer_address && order.order_type === 'delivery') {
    chunks.push(line(`Indirizzo: ${truncate(order.customer_address, 28)}`))
  }
  chunks.push(line(`Pagamento: ${pay}`))
  chunks.push(hr())

  for (const item of items) {
    const qty = Number(item?.quantity || 0)
    const name = truncate(item?.name || 'Prodotto', 24)
    const price = toPrice(item?.price || 0)
    chunks.push(line(`${qty}x ${name}  EUR ${price}`))
    if (item?.additions) chunks.push(line(`+ ${truncate(item.additions, 34)}`))
  }

  chunks.push(hr())
  chunks.push(line(`Subtotale: EUR ${toPrice(order.subtotal)}`))
  if (Number(order.delivery_fee || 0) > 0) chunks.push(line(`Consegna: EUR ${toPrice(order.delivery_fee)}`))
  if (Number(order.discount_amount || 0) > 0) {
    const discountCode = String(order.discount_code || '').trim()
    if (discountCode) chunks.push(line(`Sconto applicato: ${truncate(discountCode, 19)}`))
    chunks.push(line(`Sconto: -EUR ${toPrice(order.discount_amount)}`))
  }
  chunks.push(bold(true))
  chunks.push(line(`TOTALE: EUR ${toPrice(order.total)}`))
  chunks.push(bold(false))

  if (order.notes) {
    chunks.push(hr())
    chunks.push(line('Note:'))
    chunks.push(line(truncate(order.notes, 40)))
  }

  chunks.push(hr())
  chunks.push(alignCenter())
  chunks.push(line('Grazie per il tuo ordine!'))
  chunks.push(line(`Stampato: ${new Date().toLocaleString('it-IT')}`))
  chunks.push(feed(3))
  chunks.push(cut())

  return Buffer.concat(chunks)
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
    const message = json?.error || json?.raw || `HTTP ${res.status}`
    throw new Error(message)
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
    error: String(errorMessage || 'Errore stampa ESC/POS'),
    retryInSeconds: 20,
  })
}

function sendToEscPosPrinter(buffer) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: ESC_POS_HOST, port: ESC_POS_PORT })
    let done = false

    const fail = (error) => {
      if (done) return
      done = true
      try {
        socket.destroy()
      } catch {
        // ignore
      }
      reject(error)
    }

    socket.setTimeout(7000)

    socket.on('connect', () => {
      socket.write(buffer, (error) => {
        if (error) {
          fail(error)
          return
        }
        socket.end()
      })
    })

    socket.on('timeout', () => fail(new Error('Timeout invio ESC/POS')))
    socket.on('error', (error) => fail(error))
    socket.on('close', () => {
      if (done) return
      done = true
      resolve()
    })
  })
}

async function start() {
  console.log(`[ESC/POS TCP AGENT] Base URL: ${BASE_URL}`)
  console.log(`[ESC/POS TCP AGENT] Printer: ${ESC_POS_HOST}:${ESC_POS_PORT}`)
  console.log(`[ESC/POS TCP AGENT] Printer ID: ${PRINTER_ID}`)
  console.log('[ESC/POS TCP AGENT] In ascolto coda print_jobs...')

  while (true) {
    try {
      const job = await claimJob()
      if (!job) {
        await sleep(POLL_MS)
        continue
      }

      const escposBuffer = buildEscPosBuffer(job)
      await sendToEscPosPrinter(escposBuffer)
      await completeJob(job.id)
      console.log(`[ESC/POS TCP AGENT] Job ${job.id} -> printed`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[ESC/POS TCP AGENT] Errore: ${message}`)
      await sleep(POLL_MS)
    }
  }
}

start().catch((error) => {
  console.error(error)
  process.exit(1)
})
