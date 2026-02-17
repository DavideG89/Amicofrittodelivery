# Guida alla Stampa Automatica delle Comande

## Soluzione Attuale: Stampa Browser (window.print)

✅ **Già implementato**: Ogni ordine ha un pulsante "Stampa" nella dashboard che apre una finestra di stampa ottimizzata per stampanti termiche (80mm).

**Come funziona:**
- Clicca su un ordine nella dashboard
- Clicca sul pulsante "Stampa"
- Il browser aprirà la finestra di dialogo di stampa
- Seleziona la tua stampante e conferma

**Limitazioni:**
- Richiede interazione manuale (clic sul pulsante)
- Richiede conferma nel dialogo di stampa del browser

---

## Opzione 1: Stampante Termica ESC/POS + Electron App (Consigliato per ristoranti)

### Hardware Necessario
- **Stampante termica ESC/POS** (€50-200)
  - Esempio: Epson TM-T20III
  - Esempio: Star TSP143III
  - Esempio: Xprinter XP-80C (economica)
- **Collegamento**: USB o Ethernet/WiFi

### Software Necessario
1. **Installare un'app desktop locale** che monitora il database Supabase
2. Quando arriva un nuovo ordine, l'app stampa automaticamente sulla stampante termica

### Vantaggi
✅ Stampa automatica (zero interazione)
✅ Veloce (stampanti termiche sono istantanee)
✅ Affidabile (standard ristoranti)
✅ Costo unico hardware

### Come Implementare

#### Passo 1: Acquistare la stampante
Cerca su Amazon/eBay: "stampante termica 80mm ESC/POS"

#### Passo 2: Creare un'applicazione Electron
```bash
# Inizializzare un progetto Node.js
mkdir amico-fritto-printer
cd amico-fritto-printer
npm init -y

# Installare dipendenze
npm install electron escpos escpos-usb @supabase/supabase-js
```

#### Passo 3: Codice dell'applicazione (main.js)
```javascript
const { app, BrowserWindow } = require('electron');
const escpos = require('escpos');
const { createClient } = require('@supabase/supabase-js');

// Configura Supabase
const supabase = createClient(
  'https://sghftuvrupaswqhdckvs.supabase.co',
  'YOUR_ANON_KEY'
);

// Trova la stampante USB
escpos.USB = require('escpos-usb');
const device = new escpos.USB();
const printer = new escpos.Printer(device);

// Monitora nuovi ordini
function startListening() {
  supabase
    .channel('orders')
    .on('postgres_changes', 
      { event: 'INSERT', schema: 'public', table: 'orders' },
      async (payload) => {
        console.log('Nuovo ordine ricevuto:', payload.new);
        await printOrder(payload.new);
      }
    )
    .subscribe();
  
  console.log('In ascolto di nuovi ordini...');
}

// Funzione di stampa
async function printOrder(order) {
  device.open(function(error) {
    if (error) {
      console.error('Errore stampante:', error);
      return;
    }

    printer
      .font('a')
      .align('ct')
      .style('bu')
      .size(2, 2)
      .text('AMICO FRITTO')
      .size(1, 1)
      .text('--------------------------------')
      .align('lt')
      .text(`Comanda: #${order.order_number}`)
      .text(`Data: ${new Date(order.created_at).toLocaleString('it-IT')}`)
      .text('--------------------------------')
      .style('b')
      .size(1, 2)
      .text(order.order_type === 'delivery' ? 'DOMICILIO' : 'ASPORTO')
      .size(1, 1)
      .style('normal')
      .text('--------------------------------')
      .text(`Cliente: ${order.customer_name}`)
      .text(`Tel: ${order.customer_phone}`)
      .text('--------------------------------');

    // Stampa articoli
    order.items.forEach(item => {
      printer.text(`${item.quantity}x ${item.name} - €${item.price.toFixed(2)}`);
    });

    printer
      .text('--------------------------------')
      .style('b')
      .text(`TOTALE: €${order.total.toFixed(2)}`)
      .style('normal')
      .text('--------------------------------')
      .feed(3)
      .cut()
      .close();
  });
}

app.whenReady().then(() => {
  startListening();
  
  // Crea finestra nascosta
  const win = new BrowserWindow({
    width: 400,
    height: 300,
    show: false
  });
});
```

#### Passo 4: Avviare l'applicazione
```bash
npm start
```

**L'app rimarrà in esecuzione in background e stamperà automaticamente ogni nuovo ordine.**

---

## Opzione 2: Servizio Cloud PrintNode (Più semplice ma a pagamento)

### Cos'è PrintNode
PrintNode è un servizio cloud che permette di stampare da web su stampanti locali senza software custom.

### Costo
- €10-15/mese per una stampante
- Prova gratuita disponibile

### Come Implementare

#### Passo 1: Registrarsi su PrintNode
1. Vai su https://www.printnode.com/
2. Crea un account
3. Scarica e installa il PrintNode Client sul computer con la stampante
4. Ottieni la tua API Key

#### Passo 2: Modificare il codice dell'app
Nel file di conferma ordine, aggiungi:

```typescript
// Dopo la creazione dell'ordine
const printNodeApiKey = 'YOUR_PRINTNODE_API_KEY';
const printerId = 'YOUR_PRINTER_ID';

const receiptHTML = generateReceiptHTML(order);

await fetch('https://api.printnode.com/printjobs', {
  method: 'POST',
  headers: {
    'Authorization': `Basic ${btoa(printNodeApiKey + ':')}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    printerId: printerId,
    title: `Ordine ${order.order_number}`,
    contentType: 'pdf_uri',
    content: 'https://your-api.com/generate-pdf/' + order.id,
    source: 'Amico Fritto Web'
  })
});
```

### Vantaggi PrintNode
✅ Setup veloce (no codice complesso)
✅ Funziona con qualsiasi stampante
✅ Dashboard web per monitoraggio
✅ Supporto professionale

### Svantaggi
❌ Costo mensile ricorrente
❌ Dipende da servizio esterno

---

## Opzione 3: WebUSB API (Sperimentale)

### Cos'è
API browser che permette di comunicare direttamente con dispositivi USB.

### Limitazioni
- Funziona solo in Chrome/Edge
- Richiede HTTPS
- Non tutti i browser/dispositivi supportati
- Complesso da implementare

### Quando usare
Solo se hai esigenze molto specifiche e competenze tecniche avanzate.

---

## Raccomandazione Finale

**Per Amico Fritto, consiglio:**

### Start-up / Budget limitato
→ **Usa la stampa browser attuale** (già implementata)
- Zero costi aggiuntivi
- Funziona subito

### Crescita / Volume medio-alto
→ **Stampante termica ESC/POS + Electron App**
- Investimento unico: €50-200 per stampante
- Setup: 2-3 ore per sviluppare l'app
- Affidabile e professionale

### Soluzione rapida / Poco tempo tecnico
→ **PrintNode**
- Setup: 30 minuti
- Costo: €10-15/mese
- Zero manutenzione

---

## FAQ

**Q: Posso stampare su stampante normale (non termica)?**  
A: Sì! La stampa browser funziona con qualsiasi stampante. Le termiche sono solo più veloci e adatte ai ristoranti.

**Q: Posso avere più stampanti (cucina + bar)?**  
A: Sì! Con l'app Electron puoi configurare regole (es: hamburgers → stampante cucina, bevande → stampante bar).

**Q: Funziona con iPad/tablet?**  
A: La stampa browser sì. Per stampa automatica serve un computer sempre acceso (Windows/Mac/Linux) con l'app.

**Q: E se internet cade?**  
A: Con stampante locale + app Electron, puoi implementare una coda offline che stampa quando torna la connessione.

---

## Supporto

Per implementare una di queste soluzioni, contatta uno sviluppatore oppure seguimi per tutorial specifici.
