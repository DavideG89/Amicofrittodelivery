# Setup Istruzioni - Amico Fritto

## 1. Configurazione Database Supabase

Il tuo progetto Supabase è: **AmicoFritto** (ID: sghftuvrupaswqhdckvs)

### Esegui gli script SQL

1. Vai su [https://supabase.com/dashboard/project/sghftuvrupaswqhdckvs](https://supabase.com/dashboard/project/sghftuvrupaswqhdckvs)
2. Nel menu laterale, clicca su **SQL Editor**
3. Clicca su **New query**
4. Copia e incolla il contenuto di `scripts/01-create-tables.sql`
5. Clicca su **Run** per eseguire lo script
6. Ripeti i passaggi 3-5 con `scripts/02-seed-data.sql`
7. Ripeti i passaggi 3-5 con `scripts/07-customer-push.sql`
8. Ripeti i passaggi 3-5 con `scripts/08-add-order-additions.sql`
9. Ripeti i passaggi 3-5 con `scripts/09-add-category-addition-rules.sql`
10. Ripeti i passaggi 3-5 con `scripts/10-fix-security-advisor.sql`
11. Ripeti i passaggi 3-5 con `scripts/11-fix-security-warnings.sql`
12. Ripeti i passaggi 3-5 con `scripts/12-fix-function-search-path.sql`

Gli script creano:
- Tabelle: categories, products, store_info, discount_codes, orders, customer_push_tokens
- Dati di esempio con categorie (Panini, Hamburgers, Fritti, Salse, Bevande)
- Prodotti di esempio per ogni categoria
- Codici sconto di esempio (BENVENUTO10, SCONTO5)
- Informazioni del locale predefinite

## 2. Variabili d'Ambiente

Le variabili sono già configurate nel progetto v0:
- `NEXT_PUBLIC_SUPABASE_URL` - URL del progetto Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Chiave anonima (public key)
- `ADMIN_PASSWORD` - Password per accedere alla dashboard amministrativa

## 3. Accesso alla Dashboard Amministrativa

1. Vai su `/admin/login`
2. Inserisci la password configurata in `ADMIN_PASSWORD`
3. Accedi alla dashboard per gestire:
   - Menu e prodotti
   - Ordini in tempo reale
   - Codici sconto
   - Informazioni del locale
   - Generazione QR Code

## 4. Funzionalità Principali

### Per i Clienti:
- **Homepage** (`/`) - Menu completo con tutte le categorie
- **Carrello** (`/cart`) - Gestione carrello con switch delivery/takeaway
- **Checkout** (`/checkout`) - Form ordine con applicazione codici sconto
- **Info** (`/info`) - Informazioni del locale (indirizzo, telefono, orari)
- **QR Code** - I clienti possono scansionare il QR per ordinare

### Per il Ristoratore:
- **Dashboard** (`/admin/dashboard`) - Panoramica ordini e statistiche
- **Menu** (`/admin/dashboard/menu`) - Gestione categorie e prodotti
- **Ordini** (`/admin/dashboard/orders`) - Gestione ordini con cambio stato
- **Sconti** (`/admin/dashboard/discounts`) - Creazione codici sconto
- **Impostazioni** (`/admin/dashboard/settings`) - Modifica info locale
- **QR Code** (`/admin/dashboard/qr-code`) - Generazione QR per ordinazioni

## 5. Password Admin Predefinita

Assicurati di impostare una password sicura nella variabile `ADMIN_PASSWORD`.
Esempio: `admin2024` (cambiala con una password sicura!)

## 6. Primi Passi

1. Esegui gli script SQL su Supabase
2. Visita la homepage per vedere il menu
3. Accedi alla dashboard admin per personalizzare:
   - Prodotti e prezzi
   - Informazioni del locale
   - Codici sconto
4. Genera il QR Code dalla dashboard per permettere ai clienti di ordinare

## 7. Struttura Ordini

Gli ordini vengono salvati con:
- Numero ordine univoco
- Dati cliente (nome, telefono, indirizzo se delivery)
- Tipo ordine (delivery/takeaway)
- Prodotti ordinati
- Applicazione sconto
- Stato ordine (pending → confirmed → preparing → ready → completed)

## 8. Note Importanti

- Il pagamento è **solo in contanti** (alla consegna o al ritiro)
- Gli ordini delivery hanno una commissione configurabile
- I clienti possono inserire note speciali negli ordini
- Il ristoratore può cambiare lo stato degli ordini dalla dashboard
- I prodotti mostrano ingredienti e allergeni
