import { Order } from './supabase'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeText(value: string | null | undefined): string {
  if (!value) return ''
  return escapeHtml(value)
}

function buildReceiptHtml(order: Order, storeInfo?: { name: string; phone?: string | null; address?: string | null }) {
  const itemsHTML = order.items
    .map(
      (item) => `
    <tr>
      <td>${item.quantity}x</td>
      <td>
        ${safeText(item.name)}
        ${
          item.additions_unit_price && item.additions_unit_price > 0
            ? `<div style="font-size: 10pt; color: #444;">+ Extra: ${item.additions_unit_price.toFixed(2)}€ cad.</div>`
            : ''
        }
        ${item.additions ? `<div style="font-size: 10pt; color: #444;">+ ${safeText(item.additions)}</div>` : ''}
      </td>
      <td style="text-align: right">€${(item.price + (item.additions_unit_price || 0)).toFixed(2)}</td>
    </tr>
  `
    )
    .join('')

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Comanda #${order.order_number}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          html,
          body {
            width: 80mm;
            margin: 0;
            padding: 0;
          }

          body {
            font-family: 'Courier New', monospace;
            font-size: 11pt;
            line-height: 1.3;
            letter-spacing: 0;
            word-spacing: 0;
            font-kerning: none;
            padding: 3mm;
            color: #000;
            background: #fff;
          }

          .header {
            text-align: center;
            border-bottom: 2px dashed #000;
            padding-bottom: 10px;
            margin-bottom: 10px;
          }

          .header h1 {
            font-size: 18pt;
            font-weight: bold;
            margin-bottom: 5px;
          }

          .header p {
            font-size: 9pt;
            margin: 2px 0;
          }

          .order-info {
            margin: 15px 0;
            border-bottom: 1px dashed #000;
            padding-bottom: 10px;
          }

          .order-info div {
            margin: 5px 0;
          }

          .order-type {
            font-weight: bold;
            font-size: 14pt;
            text-transform: uppercase;
            text-align: center;
            background: #000;
            color: #fff;
            padding: 5px;
            margin: 10px 0;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
          }

          table td {
            padding: 5px 2px;
            vertical-align: top;
          }

          table td:first-child {
            width: 11mm;
            white-space: nowrap;
          }

          table td:nth-child(2) {
            word-break: break-word;
          }

          table td:last-child {
            width: 18mm;
            text-align: right;
            white-space: nowrap;
          }

          .totals {
            border-top: 1px dashed #000;
            padding-top: 10px;
            margin-top: 10px;
          }

          .totals div {
            display: flex;
            justify-content: space-between;
            margin: 5px 0;
          }

          .total-final {
            font-size: 14pt;
            font-weight: bold;
            border-top: 2px solid #000;
            padding-top: 5px;
            margin-top: 5px;
          }

          .notes {
            margin-top: 15px;
            border-top: 1px dashed #000;
            padding-top: 10px;
          }

          .notes strong {
            display: block;
            margin-bottom: 5px;
          }

          .footer {
            text-align: center;
            margin-top: 20px;
            font-size: 9pt;
            border-top: 2px dashed #000;
            padding-top: 10px;
          }

          @media print {
            @page {
              margin: 0;
            }

            html,
            body {
              width: 80mm;
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${safeText(storeInfo?.name || 'AMICO FRITTO')}</h1>
          ${storeInfo?.address ? `<p>${safeText(storeInfo.address)}</p>` : ''}
          ${storeInfo?.phone ? `<p>Tel: ${safeText(storeInfo.phone)}</p>` : ''}
        </div>

        <div class="order-info">
          <div><strong>COMANDA:</strong> #${safeText(order.order_number)}</div>
          <div><strong>Data:</strong> ${new Date(order.created_at).toLocaleString('it-IT')}</div>
        </div>

        <div class="order-type">
          ${order.order_type === 'delivery' ? 'DOMICILIO' : 'ASPORTO'}
        </div>

        <div style="margin: 15px 0;">
          <div><strong>Cliente:</strong> ${safeText(order.customer_name)}</div>
          <div><strong>Tel:</strong> ${safeText(order.customer_phone)}</div>
          ${
            order.customer_address && order.order_type === 'delivery'
              ? `<div><strong>Indirizzo:</strong> ${safeText(order.customer_address)}</div>`
              : ''
          }
          ${
            order.payment_method
              ? `<div><strong>Pagamento:</strong> ${order.payment_method === 'card' ? 'Carta (POS)' : 'Contanti'}</div>`
              : ''
          }
        </div>

        <table>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>

        <div class="totals">
          <div>
            <span>Subtotale:</span>
            <span>€${order.subtotal.toFixed(2)}</span>
          </div>
          ${
            order.discount_amount > 0
              ? `
            <div>
              <span>Sconto (${safeText(order.discount_code)}):</span>
              <span>-€${order.discount_amount.toFixed(2)}</span>
            </div>
          `
              : ''
          }
          ${
            order.delivery_fee > 0
              ? `
            <div>
              <span>Consegna:</span>
              <span>€${order.delivery_fee.toFixed(2)}</span>
            </div>
          `
              : ''
          }
          <div class="total-final">
            <span>TOTALE:</span>
            <span>€${order.total.toFixed(2)}</span>
          </div>
        </div>

        ${
          order.notes
            ? `
          <div class="notes">
            <strong>Note:</strong>
            <p>${safeText(order.notes)}</p>
          </div>
        `
            : ''
        }

        <div class="footer">
          <p>Grazie per il tuo ordine!</p>
          <p style="margin-top: 5px; font-size: 9pt;">Stampato: ${new Date().toLocaleString('it-IT')}</p>
        </div>
      </body>
    </html>
  `
}

export function printReceipt(order: Order, storeInfo?: { name: string; phone?: string | null; address?: string | null }) {
  const html = buildReceiptHtml(order, storeInfo)
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
      alert('Impossibile avviare la stampa della comanda')
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
        // Fallback cleanup in case afterprint is not fired by the browser/printer driver.
        scheduleCleanup(60000)
      } catch {
        alert('Errore durante la stampa della comanda')
        cleanup()
      }
    }, 150)
  }

  document.body.appendChild(iframe)
  const frameDocument = iframe.contentDocument || iframe.contentWindow?.document
  if (!frameDocument) {
    alert('Impossibile preparare la stampa della comanda')
    cleanup()
    return
  }

  frameDocument.open()
  frameDocument.write(html)
  frameDocument.close()
}
