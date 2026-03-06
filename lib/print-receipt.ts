import { Order } from './supabase'

export type StoreInfo = {
  name: string
  phone?: string | null
  address?: string | null
}

type PrintReceiptOptions = {
  preferPopup?: boolean
  suppressAlert?: boolean
  onError?: (message: string) => void
}

const RECEIPT_WIDTH_MM = 80
const CONTENT_WIDTH_MM = 76
const LINE_WIDTH = 32
const SEPARATOR = '-'.repeat(LINE_WIDTH)

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function cleanText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\s+/g, ' ').trim()
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

function formatMoney(value: unknown): string {
  return toNumber(value).toFixed(2)
}

function formatDateTime(value: unknown): string {
  const fallback = new Date()
  if (value === null || value === undefined) {
    return fallback.toLocaleString('it-IT')
  }

  const date = new Date(value as string | number | Date)
  if (!Number.isFinite(date.getTime())) {
    return fallback.toLocaleString('it-IT')
  }

  return date.toLocaleString('it-IT')
}

function wrapText(value: string, width = LINE_WIDTH): string[] {
  const input = String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const sourceLines = input.split('\n')
  const wrapped: string[] = []

  for (const line of sourceLines) {
    const normalized = line.replace(/\s+/g, ' ').trim()
    if (!normalized) {
      wrapped.push('')
      continue
    }

    let current = ''
    for (const word of normalized.split(' ')) {
      if (word.length > width) {
        if (current) {
          wrapped.push(current)
          current = ''
        }

        let rest = word
        while (rest.length > width) {
          wrapped.push(rest.slice(0, width))
          rest = rest.slice(width)
        }
        current = rest
        continue
      }

      const candidate = current ? `${current} ${word}` : word
      if (candidate.length <= width) {
        current = candidate
      } else {
        wrapped.push(current)
        current = word
      }
    }

    wrapped.push(current)
  }

  return wrapped.length > 0 ? wrapped : ['']
}

function centerText(value: string, width = LINE_WIDTH): string {
  const text = cleanText(value)
  if (!text) return ''
  if (text.length >= width) return text
  const leftPad = Math.floor((width - text.length) / 2)
  return `${' '.repeat(leftPad)}${text}`
}

function amountLine(label: string, amount: string, width = LINE_WIDTH): string {
  const safeLabel = cleanText(label)
  const safeAmount = cleanText(amount)
  if (!safeAmount) return safeLabel.slice(0, width)

  if (safeLabel.length + safeAmount.length + 1 <= width) {
    const spacing = width - safeLabel.length - safeAmount.length
    return `${safeLabel}${' '.repeat(spacing)}${safeAmount}`
  }

  const labelWidth = Math.max(0, width - safeAmount.length - 1)
  return `${safeLabel.slice(0, labelWidth)} ${safeAmount}`
}

export function buildReceiptLines(order: Order, storeInfo?: StoreInfo): string[] {
  const lines: string[] = []

  const storeName = cleanText(storeInfo?.name) || 'AMICO FRITTO'
  const storeAddress = cleanText(storeInfo?.address)
  const storePhone = cleanText(storeInfo?.phone)

  for (const line of wrapText(storeName)) {
    lines.push(centerText(line))
  }
  if (storeAddress) {
    for (const line of wrapText(storeAddress)) {
      lines.push(centerText(line))
    }
  }
  if (storePhone) {
    lines.push(centerText(`Tel: ${storePhone}`))
  }

  lines.push(SEPARATOR)
  lines.push(...wrapText(`COMANDA #${cleanText(order.order_number) || 'N/A'}`))
  lines.push(...wrapText(`Data: ${formatDateTime(order.created_at)}`))
  lines.push(`Tipo: ${order.order_type === 'delivery' ? 'DOMICILIO' : 'ASPORTO'}`)

  lines.push(SEPARATOR)
  lines.push(...wrapText(`Cliente: ${cleanText(order.customer_name) || '-'}`))
  lines.push(...wrapText(`Tel: ${cleanText(order.customer_phone) || '-'}`))

  if (order.order_type === 'delivery' && cleanText(order.customer_address)) {
    lines.push(...wrapText(`Indirizzo: ${cleanText(order.customer_address)}`))
  }

  const paymentLabel =
    order.payment_method === 'card' ? 'Carta (POS)' : order.payment_method === 'cash' ? 'Contanti' : ''
  if (paymentLabel) {
    lines.push(`Pagamento: ${paymentLabel}`)
  }

  lines.push(SEPARATOR)
  lines.push('ARTICOLI')
  lines.push(SEPARATOR)

  const items = Array.isArray(order.items) ? order.items : []
  if (items.length === 0) {
    lines.push('(Nessun articolo)')
  }

  for (const item of items) {
    const quantity = Math.max(1, Math.round(toNumber(item.quantity, 1)))
    const itemName = cleanText(item.name) || 'Prodotto'
    const additionsPrice = toNumber(item.additions_unit_price)
    const basePrice = toNumber(item.price)
    const unitPrice = basePrice + additionsPrice
    const lineTotal = unitPrice * quantity
    const amount = `EUR ${formatMoney(lineTotal)}`
    const firstLineWidth = Math.max(8, LINE_WIDTH - amount.length - 1)
    const itemTitleLines = wrapText(`${quantity}x ${itemName}`, firstLineWidth)

    lines.push(amountLine(itemTitleLines[0] || `${quantity}x ${itemName}`, amount))
    for (const extraLine of itemTitleLines.slice(1)) {
      lines.push(extraLine)
    }

    const additions = cleanText(item.additions)
    if (additions) {
      for (const additionLine of wrapText(`+ ${additions}`, LINE_WIDTH - 2)) {
        lines.push(`  ${additionLine}`)
      }
    }

    if (quantity > 1) {
      lines.push(`  (${formatMoney(unitPrice)} cad.)`)
    }
  }

  lines.push(SEPARATOR)
  lines.push(amountLine('Subtotale', `EUR ${formatMoney(order.subtotal)}`))

  const deliveryFee = toNumber(order.delivery_fee)
  if (deliveryFee > 0) {
    lines.push(amountLine('Consegna', `EUR ${formatMoney(deliveryFee)}`))
  }

  const discountAmount = toNumber(order.discount_amount)
  if (discountAmount > 0) {
    const discountCode = cleanText(order.discount_code)
    const discountLabel = discountCode ? `Sconto (${discountCode})` : 'Sconto'
    lines.push(amountLine(discountLabel, `-EUR ${formatMoney(discountAmount)}`))
  }

  lines.push(SEPARATOR)
  lines.push(amountLine('TOTALE', `EUR ${formatMoney(order.total)}`))

  if (cleanText(order.notes)) {
    lines.push(SEPARATOR)
    lines.push('NOTE')
    lines.push(...wrapText(String(order.notes)))
  }

  lines.push(SEPARATOR)
  lines.push(centerText('Grazie per il tuo ordine!'))
  lines.push(centerText(`Stampato ${formatDateTime(Date.now())}`))

  return lines
}

function buildReceiptHtml(order: Order, storeInfo?: StoreInfo): string {
  const lines = buildReceiptLines(order, storeInfo)
  const receiptText = escapeHtml(lines.join('\n'))
  const orderNumber = cleanText(order.order_number) || 'N/A'

  return `
<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Comanda #${escapeHtml(orderNumber)}</title>
    <style>
      :root {
        color-scheme: light only;
      }

      * {
        box-sizing: border-box;
      }

      @page {
        size: ${RECEIPT_WIDTH_MM}mm auto;
        margin: 2mm;
      }

      html,
      body {
        margin: 0;
        padding: 0;
        width: ${RECEIPT_WIDTH_MM}mm;
        background: #fff;
      }

      body {
        font-family: 'Courier New', Courier, monospace;
        font-size: 12px;
        line-height: 1.25;
        color: #000;
      }

      .receipt {
        width: ${CONTENT_WIDTH_MM}mm;
        margin: 0 auto;
        padding: 0;
        white-space: pre-wrap;
        word-break: break-word;
      }

      @media screen {
        body {
          padding: 8px;
        }

        .receipt {
          border: 1px dashed #bbb;
          width: ${RECEIPT_WIDTH_MM}mm;
          padding: 3mm;
        }
      }

      @media print {
        html,
        body {
          width: ${RECEIPT_WIDTH_MM}mm;
        }

        .receipt {
          width: ${CONTENT_WIDTH_MM}mm;
          border: 0;
          padding: 0;
        }
      }
    </style>
  </head>
  <body>
    <pre class="receipt">${receiptText}</pre>
  </body>
</html>
  `
}

function createErrorReporter(options?: PrintReceiptOptions) {
  return (message: string) => {
    options?.onError?.(message)
    if (!options?.suppressAlert) {
      alert(message)
    }
  }
}

function tryPopupPrint(html: string, onError?: (message: string) => void): boolean {
  const popup = window.open('', '_blank', 'popup=yes,width=420,height=760')
  if (!popup) {
    return false
  }

  let printStarted = false
  let closeTimeout: number | null = null

  const closePopup = () => {
    if (closeTimeout !== null) {
      window.clearTimeout(closeTimeout)
      closeTimeout = null
    }

    try {
      popup.close()
    } catch {
      // Ignore close errors.
    }
  }

  const startPrint = () => {
    if (printStarted) return
    printStarted = true

    window.setTimeout(() => {
      try {
        popup.focus()
        popup.print()
        closeTimeout = window.setTimeout(closePopup, 60000)
      } catch {
        onError?.('Errore durante la stampa della comanda')
        closePopup()
      }
    }, 180)
  }

  try {
    popup.document.open()
    popup.document.write(html)
    popup.document.close()
  } catch {
    closePopup()
    return false
  }

  popup.addEventListener(
    'afterprint',
    () => {
      window.setTimeout(closePopup, 300)
    },
    { once: true }
  )

  if (popup.document.readyState === 'complete') {
    startPrint()
  } else {
    popup.addEventListener('load', startPrint, { once: true })
    window.setTimeout(startPrint, 900)
  }

  return true
}

function tryIframePrint(html: string, onError?: (message: string) => void): boolean {
  if (!document.body) {
    onError?.('Impossibile preparare la stampa della comanda')
    return false
  }

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.style.opacity = '0'
  iframe.style.pointerEvents = 'none'

  let cleanupTimeout: number | null = null
  const cleanup = () => {
    if (cleanupTimeout !== null) {
      window.clearTimeout(cleanupTimeout)
      cleanupTimeout = null
    }

    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe)
    }
  }

  const scheduleCleanup = (delayMs: number) => {
    if (cleanupTimeout !== null) {
      window.clearTimeout(cleanupTimeout)
    }
    cleanupTimeout = window.setTimeout(cleanup, delayMs)
  }

  iframe.onload = () => {
    const frameWindow = iframe.contentWindow
    if (!frameWindow) {
      onError?.('Impossibile avviare la stampa della comanda')
      cleanup()
      return
    }

    const handleAfterPrint = () => {
      frameWindow.removeEventListener('afterprint', handleAfterPrint)
      scheduleCleanup(500)
    }

    frameWindow.addEventListener('afterprint', handleAfterPrint)

    window.setTimeout(() => {
      try {
        frameWindow.focus()
        frameWindow.print()
        scheduleCleanup(60000)
      } catch {
        onError?.('Errore durante la stampa della comanda')
        cleanup()
      }
    }, 180)
  }

  document.body.appendChild(iframe)
  const frameDocument = iframe.contentDocument || iframe.contentWindow?.document
  if (!frameDocument) {
    onError?.('Impossibile preparare la stampa della comanda')
    cleanup()
    return false
  }

  frameDocument.open()
  frameDocument.write(html)
  frameDocument.close()

  return true
}

export function printReceipt(
  order: Order,
  storeInfo?: StoreInfo,
  options?: PrintReceiptOptions
): boolean {
  const reportError = createErrorReporter(options)
  const html = buildReceiptHtml(order, storeInfo)
  const preferPopup = options?.preferPopup ?? true

  if (preferPopup) {
    const popupStarted = tryPopupPrint(html, reportError)
    if (popupStarted) {
      return true
    }
  }

  return tryIframePrint(html, reportError)
}
