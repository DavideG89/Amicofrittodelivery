import { Order, Product } from './supabase'

export function printReceipt(order: Order, storeInfo?: { name: string; phone?: string | null; address?: string | null }) {
  // Create a hidden iframe for printing
  const printWindow = window.open('', '_blank', 'width=300,height=600')
  
  if (!printWindow) {
    alert('Abilita i popup per stampare le comande')
    return
  }

  const itemsHTML = order.items.map(item => `
    <tr>
      <td>${item.quantity}x</td>
      <td>${item.name}</td>
      <td style="text-align: right">€${item.price.toFixed(2)}</td>
    </tr>
  `).join('')

  const html = `
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
          
          body {
            font-family: 'Courier New', monospace;
            font-size: 12pt;
            line-height: 1.4;
            padding: 10mm;
            width: 80mm;
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
            font-size: 10pt;
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
            font-size: 10pt;
            border-top: 2px dashed #000;
            padding-top: 10px;
          }
          
          @media print {
            body {
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${storeInfo?.name || 'AMICO FRITTO'}</h1>
          ${storeInfo?.address ? `<p>${storeInfo.address}</p>` : ''}
          ${storeInfo?.phone ? `<p>Tel: ${storeInfo.phone}</p>` : ''}
        </div>
        
        <div class="order-info">
          <div><strong>COMANDA:</strong> #${order.order_number}</div>
          <div><strong>Data:</strong> ${new Date(order.created_at).toLocaleString('it-IT')}</div>
        </div>
        
        <div class="order-type">
          ${order.order_type === 'delivery' ? '🚗 DOMICILIO' : '🏪 ASPORTO'}
        </div>
        
        <div style="margin: 15px 0;">
          <div><strong>Cliente:</strong> ${order.customer_name}</div>
          <div><strong>Tel:</strong> ${order.customer_phone}</div>
          ${order.customer_address && order.order_type === 'delivery' ? 
            `<div><strong>Indirizzo:</strong> ${order.customer_address}</div>` : ''}
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
          ${order.discount_amount > 0 ? `
            <div>
              <span>Sconto (${order.discount_code}):</span>
              <span>-€${order.discount_amount.toFixed(2)}</span>
            </div>
          ` : ''}
          ${order.delivery_fee > 0 ? `
            <div>
              <span>Consegna:</span>
              <span>€${order.delivery_fee.toFixed(2)}</span>
            </div>
          ` : ''}
          <div class="total-final">
            <span>TOTALE:</span>
            <span>€${order.total.toFixed(2)}</span>
          </div>
        </div>
        
        ${order.notes ? `
          <div class="notes">
            <strong>Note:</strong>
            <p>${order.notes}</p>
          </div>
        ` : ''}
        
        <div class="footer">
          <p>Grazie per il tuo ordine!</p>
          <p style="margin-top: 5px; font-size: 9pt;">
            Stampato: ${new Date().toLocaleString('it-IT')}
          </p>
        </div>
      </body>
    </html>
  `

  printWindow.document.write(html)
  printWindow.document.close()
  
  // Wait for content to load, then print
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print()
      // Close the window after printing (optional)
      setTimeout(() => {
        printWindow.close()
      }, 100)
    }, 250)
  }
}
