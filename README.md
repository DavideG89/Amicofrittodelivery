# Amico Fritto - Food Delivery App

Una web app completa per la gestione degli ordini online del ristorante "Amico Fritto".

## Funzionalità

### Per i Clienti
- **Menu Interattivo**: Visualizzazione dei prodotti suddivisi per categorie (Panini, Hamburgers, Fritti, Salse, Bevande)
- **Carrello**: Aggiunta/rimozione prodotti con gestione quantità
- **Delivery o Takeaway**: Scelta tra consegna a domicilio o ritiro in negozio
- **Codici Sconto**: Possibilità di applicare codici sconto agli ordini
- **Pagamento in Contanti**: Pagamento alla consegna o al ritiro
- **Informazioni Locale**: Pagina con indirizzo, telefono e orari
- **Allergeni**: Visualizzazione degli allergeni per ogni prodotto

### Per il Ristoratore
- **Dashboard Amministrativa**: Interfaccia completa per la gestione
- **Gestione Menu**: Creazione e modifica di categorie e prodotti con immagini
- **Gestione Ordini**: Visualizzazione ordini in tempo reale con stati (Ricevuto, In Preparazione, Pronto, Completato)
- **Codici Sconto**: Creazione e gestione dei codici sconto
- **Impostazioni**: Modifica informazioni del locale (indirizzo, telefono, orari)
- **QR Code**: Generazione e download del QR code per ordinazioni rapide

## Setup

### 1. Configurazione Supabase

Devi eseguire gli script SQL nel tuo progetto Supabase (**AmicoFritto** - ID: `sghftuvrupaswqhdckvs`):

1. Vai su [Supabase](https://supabase.com) e accedi al tuo progetto
2. Vai su **SQL Editor**
3. Esegui in ordine i seguenti script:
   - `scripts/01-create-tables.sql` - Crea le tabelle del database
   - `scripts/02-seed-data.sql` - Inserisce dati di esempio
   - `scripts/07-customer-push.sql` - Crea la tabella token notifiche cliente
   - `scripts/08-add-order-additions.sql` - Crea tabella aggiunte ordine (salse/extra)
   - `scripts/09-add-category-addition-rules.sql` - Crea regole aggiunte per categoria
   - `scripts/10-fix-security-advisor.sql` - Applica fix sicurezza (RLS + view invoker)
   - `scripts/11-fix-security-warnings.sql` - Applica fix warning sicurezza (policy RLS + estensione)
   - `scripts/12-fix-function-search-path.sql` - Fissa search_path della funzione trigger ordini

### 2. Variabili d'Ambiente

Crea un file `.env.local` nella root del progetto con le seguenti variabili:

```env
NEXT_PUBLIC_SUPABASE_URL=https://sghftuvrupaswqhdckvs.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tua_anon_key_qui
ADMIN_PASSWORD=password_admin_sicura
```

Puoi trovare la `SUPABASE_ANON_KEY` nel tuo progetto Supabase in **Settings > API**.

### 3. Installazione

```bash
# Installa le dipendenze
pnpm install

# Avvia il server di sviluppo
pnpm dev
```

L'applicazione sarà disponibile su [http://localhost:3000](http://localhost:3000)

## Accesso alla Dashboard

- URL: `/admin/login`
- Password: quella configurata in `ADMIN_PASSWORD` (variabile d'ambiente)

## Struttura del Database

### Tabelle Principali

- **categories**: Categorie del menu
- **products**: Prodotti con ingredienti, allergeni, prezzi e immagini
- **orders**: Ordini dei clienti con stato
- **order_items**: Dettagli dei prodotti ordinati
- **discount_codes**: Codici sconto attivi
- **store_info**: Informazioni del locale

## Come Usare

### Per i Clienti

1. Scansiona il QR code o accedi al link
2. Sfoglia il menu per categorie
3. Aggiungi prodotti al carrello
4. Scegli delivery o takeaway
5. Inserisci i dati e completa l'ordine
6. Paga in contanti alla consegna/ritiro

### Per il Ristoratore

1. Accedi alla dashboard (`/admin/login`)
2. **Menu**: Gestisci categorie e prodotti
3. **Ordini**: Visualizza e aggiorna lo stato degli ordini
4. **Sconti**: Crea codici sconto per i clienti
5. **Impostazioni**: Modifica i dati del locale
6. **QR Code**: Scarica il QR code da stampare

## Tecnologie Utilizzate

- **Next.js 16**: Framework React con App Router
- **Supabase**: Database PostgreSQL e backend
- **TypeScript**: Type safety
- **Tailwind CSS**: Styling
- **shadcn/ui**: Componenti UI
- **QRCode**: Generazione QR code

## Note Importanti

- **Sicurezza**: La password admin è gestita tramite variabile d'ambiente. Usa una password sicura in produzione.
- **Immagini Prodotti**: Puoi caricare immagini tramite URL o caricandole su un servizio di hosting (es. Supabase Storage).
- **Notifiche Ordini**: Per ricevere notifiche in tempo reale, considera l'aggiunta di webhook o email notifications.
- **Pagamenti**: L'app è configurata per pagamenti in contanti. Per pagamenti online, integra Stripe o PayPal.

## Prossimi Passi

1. Configura le variabili d'ambiente
2. Esegui gli script SQL su Supabase
3. Personalizza i dati di esempio con i tuoi prodotti
4. Aggiorna le informazioni del locale nella dashboard
5. Scarica e stampa il QR code
6. Inizia a ricevere ordini!

## Supporto

Per problemi o domande, consulta la documentazione di:
- [Next.js](https://nextjs.org/docs)
- [Supabase](https://supabase.com/docs)
- [shadcn/ui](https://ui.shadcn.com)
