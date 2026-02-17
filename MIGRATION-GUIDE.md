# Migration Guide - Amico Fritto

## Database Migrations

Esegui questi script SQL nel Supabase SQL Editor (in ordine):

### 1. Migration: Aggiorna tabella discount_codes

**File:** `scripts/04-migrate-discount-codes.sql`

**Quando eseguire:** Se ricevi l'errore `Could not find the 'discount_percent' column`

**Cosa fa:**
- Aggiunge le nuove colonne: `discount_type`, `discount_value`, `active`
- Migra i dati da `discount_percent` → `discount_value`
- Migra i dati da `is_active` → `active`
- Rimuove le vecchie colonne obsolete

**Come eseguire:**
1. Vai su https://supabase.com/dashboard/project/sghftuvrupaswqhdckvs/editor
2. Apri il SQL Editor
3. Copia il contenuto di `scripts/04-migrate-discount-codes.sql`
4. Incolla ed esegui lo script
5. Verifica che non ci siano errori

---

### 2. Migration: Aggiungi colonna label ai prodotti

**File:** `scripts/03-add-product-label.sql`

**Cosa fa:**
- Aggiunge la colonna `label` alla tabella `products`
- Permette valori: 'sconto', 'novita', o NULL

**Come eseguire:**
1. Vai su https://supabase.com/dashboard/project/sghftuvrupaswqhdckvs/editor
2. Apri il SQL Editor
3. Copia il contenuto di `scripts/03-add-product-label.sql`
4. Incolla ed esegui lo script

---

## Dopo le migrazioni

Dopo aver eseguito gli script:

1. **Ricarica la pagina** nel browser per forzare il refresh della cache
2. **Testa le funzionalità:**
   - Creazione codici sconto in `/admin/dashboard/discounts`
   - Creazione/modifica prodotti con label in `/admin/dashboard/menu`
3. Se persistono errori, contatta il supporto su vercel.com/help

---

## Troubleshooting

### Errore: "Invalid API key"
- Verifica che la chiave anon di Supabase sia corretta in `lib/supabase.ts`
- Controlla che le variabili d'ambiente siano configurate

### Errore: "Column not found"
- Esegui la migrazione corrispondente
- Verifica che lo script sia stato eseguito con successo
- Controlla i log SQL per eventuali errori

### Modifiche non salvate
- Verifica la console del browser per errori
- Controlla che il database abbia i permessi corretti (RLS policies)
- Verifica che la connessione Supabase sia attiva
