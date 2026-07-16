# Sicurezza

Questo documento descrive lo stato versionato del repository. Non certifica la configurazione effettiva del deployment Supabase o Vercel.

## Confini di fiducia

- Browser pubblico → route API Next.js
- Dashboard autenticata → Supabase RLS e route API amministrative
- Route server → Supabase tramite service-role
- Print agent → API tramite chiave dedicata
- Database → notifiche e funzioni pianificate

Input client, cookie, header, numeri ordine e dati in storage locale non sono considerati affidabili.

## Autenticazione e autorizzazione amministrativa

Il sistema supportato usa:

- Supabase Auth per verificare identità e password;
- `public.admin_users` come allowlist degli UUID autorizzati;
- `public.is_admin()` nelle policy RLS;
- `lib/admin-authorization.ts` come controllo unico per le API amministrative;
- service-role soltanto dopo la verifica dell'amministratore.

Le vecchie sessioni HMAC basate su `ADMIN_PASSWORD` e `ADMIN_SESSION_SECRET` non sono più supportate.

La dashboard verifica l'appartenenza a `admin_users` tramite `/api/admin/session`. Il controllo client migliora il flusso utente, mentre la protezione effettiva dei dati resta nelle API e nelle policy RLS.

## Row Level Security

- `scripts/20-create-admin-authorization.sql` crea l'allowlist e la funzione `is_admin()`.
- `scripts/21-harden-row-level-security.sql` sostituisce le policy delle tabelle applicative con policy versionate e fail-closed.
- Le tabelle contenenti ordini, ricavi, feedback, token cliente e job di stampa non hanno accesso pubblico diretto.
- Menu e configurazione pubblica espongono soltanto letture esplicitamente autorizzate.

La presenza degli script non prova che siano stati applicati. Prima del rilascio verificare policy, grant, owner, trigger e publication Realtime sul database effettivo.

## Controlli già presenti

- Ricalcolo server-side di prodotti, aggiunte, sconti, consegna e totale ordine
- Chiave service-role esclusa dal bundle client
- Validazione di base degli ordini
- CAPTCHA configurabile sul checkout
- Cookie e credenziali legacy rimossi dal flusso admin
- Header HTTP di sicurezza applicativi
- Tabelle push cliente e print queue senza accesso anonimo diretto
- Token pubblico casuale per i nuovi link di tracking ordine

## Rischi ancora aperti

### Alta priorità

1. Gli ordini creati prima di `scripts/22-add-order-public-token.sql` possono restare leggibili senza token finché `orders.public_token` è `NULL`.
2. Il webhook della funzione push deve fallire quando `WEBHOOK_SECRET` manca.

### Media priorità

1. Il rate limiting in memoria non coordina più istanze serverless.
2. Il payload ordine non ha ancora limiti strutturali completi.
3. La creazione ordine non usa ancora una chiave di idempotenza.
4. Le transizioni di stato non sono ancora una state machine atomica.
5. Il print agent usa una chiave condivisa e deve verificare ownership e lease del job.

## Segreti

Non committare:

- `SUPABASE_SERVICE_ROLE_KEY`
- chiavi private Firebase
- `RECAPTCHA_SECRET_KEY`
- `PRINTER_AGENT_KEY`
- password, token o file `.env.local`

Le variabili `NEXT_PUBLIC_*` sono visibili nel browser e non devono contenere segreti.

## Segnalazione

Una vulnerabilità deve essere descritta con percorso d'attacco, impatto, prerequisiti e riproduzione minima. Non includere credenziali o dati reali dei clienti nei report.
