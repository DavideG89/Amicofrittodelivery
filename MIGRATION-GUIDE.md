# Guida alle migrazioni

Le migrazioni SQL si trovano in `scripts/` e sono ordinate numericamente.

## Regole

- Non modificare il database remoto automaticamente.
- Esportare schema, policy, grant, funzioni e trigger prima di una migrazione di sicurezza.
- Applicare in staging prima della produzione.
- Non usare la disattivazione di RLS come rollback.
- Una nuova migrazione deve dichiarare prerequisiti, impatto e rollback.

## Compatibilità della cronologia

`04-migrate-discount-codes.sql` gestisce sia lo schema legacy (`discount_percent`, `is_active`) sia il nuovo schema creato da `01-create-tables.sql`.

La colonna `orders.payment_method` è presente nel nuovo schema base e viene aggiunta in modo idempotente da `21-harden-row-level-security.sql` sui database esistenti.

La colonna `orders.public_token` è presente nel nuovo schema base e viene aggiunta in modo idempotente da `22-add-order-public-token.sql` sui database esistenti. I nuovi ordini devono avere un token casuale restituito dall'API; gli ordini legacy senza token restano compatibili solo temporaneamente.

## Migrazioni 20 e 21

La configurazione RLS è deliberatamente divisa in due fasi per evitare lockout:

1. `20-create-admin-authorization.sql` crea `admin_users` e `is_admin()` senza revocare accessi esistenti.
2. Un operatore inserisce esplicitamente almeno un UUID valido da `auth.users`.
3. `21-harden-row-level-security.sql` verifica i prerequisiti e sostituisce policy e grant.

Il deploy applicativo deve avvenire soltanto dopo il completamento della fase 3 e nella stessa finestra di manutenzione. Durante il breve intervallo tra script 21 e deploy, il vecchio comando dashboard per la pulizia ordini non può più invocare direttamente la RPC. Lo script 21 rimuove inoltre il vecchio trigger push SQL: l'API ordini rimane l'unico proprietario dell'invio per evitare duplicati.

Consultare [`SETUP.md`](./SETUP.md) per bootstrap, verifica e rollback.

## Migrazione 22

`22-add-order-public-token.sql` va applicata prima del deploy del codice che restituisce link ordine con `?token=...`.

Impatto:

- aggiunge `orders.public_token`;
- aggiunge indice univoco parziale sui token non nulli;
- aggiunge indice di lookup pubblico `order_number + public_token`;
- aggiunge vincolo formato token.

Rollback operativo:

1. ripristinare prima il codice applicativo precedente;
2. mantenere la colonna finché esistono link cliente tokenizzati;
3. rimuovere indici e colonna solo dopo finestra di retention ordini.

## Migrazione 23

`23-add-product-ingredients.sql` va applicata prima di abilitare nel frontend la rimozione degli ingredienti.
Richiede che le migrazioni 20 e 21 siano già state completate, perché riusa `public.is_admin()` per la policy di gestione.

Impatto:

- aggiunge la tabella `product_ingredients`, collegata ai singoli prodotti;
- aggiunge a `categories` il flag `ingredient_customization_enabled`, con default `false`;
- abilita inizialmente il flag per Hamburger/Hamburgers, Kebab, Mini hamburger/Mini Burger/Mini e Panini tramite corrispondenza prudente su slug o nome normalizzati, senza rinominare gli slug;
- espone in lettura pubblica soltanto gli ingredienti attivi;
- rende univoci per prodotto i nomi ingrediente ignorando maiuscole e spazi esterni;
- espone `replace_product_ingredients(p_product_id uuid, p_ingredients jsonb)` come unico comando di sostituzione atomica, eseguibile soltanto da utenti autenticati presenti in `admin_users`;
- valida un massimo di 20 oggetti `{name, removable?, active?}`, usa la posizione nell'array come `display_order`, conserva gli ID a parità di nome normalizzato e archivia come inattive le righe assenti;
- espone `save_product_with_ingredients(p_product_id uuid, p_product jsonb, p_product_ingredients jsonb)` per creare o aggiornare prodotto e ingredienti nella stessa transazione, preservando `display_order` del prodotto; l'eventuale sincronizzazione upsell resta separata;
- non modifica gli ordini esistenti né esegue automaticamente il backfill del campo testuale `products.ingredients`.

Il backfill deve essere verificato manualmente: il testo storico separato da virgole non è una fonte strutturata affidabile.
Il deploy deve seguire l'ordine: migrazione, configurazione ingredienti, backend, frontend cliente.

Rollback operativo:

1. disabilitare prima la personalizzazione nel frontend e ripristinare il backend precedente;
2. conservare la tabella finché configurazione amministrativa o ordini conservati dipendono dai relativi ID;
3. rimuovere la tabella soltanto dopo la finestra di retention necessaria.

## Migrazione 24

`24-enable-mini-burger-ingredients.sql` corregge i database storici in cui la categoria concordata e presente come `Mini Burger`/`mini-burger`, denominazione non inclusa nella prima versione della migrazione 23.

Impatto:

- abilita soltanto `ingredient_customization_enabled` per i nomi o slug esatti `Mini Burger`/`mini-burger`, incluse le forme plurali;
- non crea ingredienti a partire dal testo libero dei prodotti;
- non modifica prodotti, prezzi, aggiunte o ordini.

Gli ingredienti rimovibili dei singoli prodotti devono essere configurati dall'amministratore.

Rollback operativo:

1. disabilitare manualmente il flag della categoria soltanto se la personalizzazione Mini Burger non e piu desiderata;
2. non eliminare gli ingredienti gia usati in ordini ancora conservati.
