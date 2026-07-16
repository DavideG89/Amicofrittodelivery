# Amico Fritto Delivery

Applicazione web e mobile per menu, carrello, ordini delivery/takeaway e gestione operativa del ristorante Amico Fritto.

Questo README è il regolamento tecnico del repository. Chi modifica il progetto, persona o agente, è tenuto a rispettarlo insieme ad [`AGENTS.md`](./AGENTS.md).

## 1. Scopo del progetto

Il sistema gestisce:

- menu, categorie, prodotti, ingredienti e allergeni;
- carrello, salse, extra, quantità e opzioni prodotto;
- ordini delivery e takeaway;
- sconti, costi di consegna e totale ordine;
- dashboard amministrativa e stato degli ordini;
- notifiche push, coda di stampa e applicazione Android tramite Capacitor.

La correttezza di ordini, prezzi, autorizzazioni e dati cliente prevale su velocità di sviluppo e refactoring estetici.

## 2. Stack ufficiale

- Next.js con App Router
- React e TypeScript
- Supabase/PostgreSQL
- Tailwind CSS e componenti Radix/shadcn
- Firebase Cloud Messaging
- Capacitor per Android

Non introdurre framework, database, sistemi di autenticazione o librerie di produzione alternativi senza una decisione esplicita e documentata.

## 3. Regole non negoziabili

### 3.1 Stabilità funzionale

- Ogni modifica deve avere uno scopo definito e un diff limitato.
- Non modificare contemporaneamente comportamento, architettura e interfaccia senza necessità verificabile.
- I flussi menu, carrello, checkout, ordine, dashboard e stampa non devono regredire.
- Prezzi, sconti, aggiunte, disponibilità e totale devono essere ricalcolati lato server da dati canonici.

### 3.2 Qualità del codice

- Usare TypeScript rigoroso ed evitare `any` o assertion non motivate.
- Separare presentazione, logica di dominio, trasporto HTTP e accesso dati.
- Evitare componenti e route con responsabilità multiple.
- Eliminare duplicazioni delle regole commerciali invece di sincronizzarle manualmente.
- Gestire esplicitamente errori, stati vuoti, caricamento e timeout.
- Commentare decisioni non ovvie, non il funzionamento evidente del codice.

### 3.3 Frontend

- Usare HTML semantico e una gerarchia coerente dei titoli.
- Garantire utilizzo da tastiera, focus visibile, label corrette e nomi accessibili.
- Usare elementi nativi prima di ARIA: link per navigazione, button per azioni, controlli form per le scelte.
- Mantenere il comportamento responsive su mobile e desktop.
- I componenti di presentazione non devono interrogare direttamente il database.
- Non usare lo stato client come prova di autorizzazione o come fonte autorevole dei prezzi.

### 3.4 Backend e sicurezza

- Considerare non attendibili body, parametri URL, query string, cookie, header e storage client.
- Validare gli input al confine server con schemi strict, tipi, formati e limiti di dimensione.
- Autenticazione e autorizzazione amministrativa devono avvenire lato server.
- Minimizzare i dati restituiti dalle API e prevenire IDOR ed enumerazione degli ordini.
- Le policy Supabase RLS devono restare attive e coerenti con le route applicative.
- I link pubblici degli ordini nuovi devono usare numero ordine più token casuale; il solo numero ordine non deve essere considerato prova di possesso.
- Non registrare password, token completi o dati personali non necessari.
- Non presentare sanitizzazione, CORS o rate limiting in memoria come protezione completa.

### 3.5 Segreti e dati personali

- Non committare file `.env`, service account, chiavi private, password o token.
- Le variabili `NEXT_PUBLIC_*` sono pubbliche e non devono contenere segreti.
- `SUPABASE_SERVICE_ROLE_KEY`, credenziali Firebase e chiavi del print agent devono esistere solo lato server.
- Log, screenshot, fixture e documentazione non devono contenere dati reali dei clienti.

### 3.6 Database e migrazioni

- Ogni modifica allo schema deve essere aggiunta come nuovo file numerato in `scripts/`.
- Non modificare una migrazione già applicata per cambiarne il risultato storico.
- Documentare dipendenze, ordine di esecuzione, impatto e rollback.
- Non eseguire migrazioni sul database remoto durante attività di refactoring o audit.
- Verificare RLS, privilegi e compatibilità applicativa prima del rilascio.

## 4. Struttura del repository

```text
app/                  Pagine, layout e route API Next.js
components/           Componenti applicativi e UI condivisa
hooks/                Hook React condivisi
lib/                  Dominio, integrazioni e servizi
scripts/              Migrazioni SQL e agenti di stampa
public/               Asset statici pubblici
android/              Progetto Android Capacitor
.codex/agents/         Agenti Codex specializzati del progetto
```

Le responsabilità degli agenti e le regole di collaborazione sono definite in [`AGENTS.md`](./AGENTS.md).

## 5. Avvio locale

### Prerequisiti

- Node.js compatibile con la versione Next.js installata
- pnpm
- progetto Supabase configurato

### Installazione

```bash
pnpm install
pnpm dev
```

L'applicazione locale è disponibile normalmente su `http://localhost:3000`.

### Variabili essenziali

Creare `.env.local` senza commetterlo:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_ADMIN_EMAIL=
```

L'autenticazione amministrativa e le integrazioni Firebase, reCAPTCHA e stampa richiedono variabili aggiuntive. Consultare [`SETUP.md`](./SETUP.md) e il codice che usa `process.env` prima di abilitarle. Non inserire valori reali nella documentazione.

## 6. Comandi ufficiali

```bash
pnpm dev                  # sviluppo locale
pnpm build                # build di produzione
pnpm start                # avvio della build
pnpm print:emulator       # emulatore del print agent
pnpm print:agent:escpos   # print agent ESC/POS
pnpm cap:sync             # sincronizzazione progetto Android
```

Il comando `lint` deve essere considerato disponibile solo dopo averne verificato la compatibilità con la versione corrente di Next.js.

## 7. Verifica obbligatoria

Prima di considerare conclusa una modifica:

1. eseguire `npx tsc --noEmit --incremental false` per modifiche TypeScript;
2. eseguire `pnpm build` per modifiche a runtime, routing, configurazione o moduli condivisi;
3. verificare il flusso utente interessato su mobile e desktop quando cambia la UI;
4. verificare autorizzazione, validazione e risposta API quando cambia il backend;
5. controllare che non siano stati aggiunti segreti o dati personali;
6. aggiornare README, `SETUP.md` o `SECURITY.md` quando cambiano procedure, configurazione o garanzie;
7. dichiarare verifiche non eseguite e rischi residui.

Una build riuscita non dimostra da sola correttezza funzionale, accessibilità o sicurezza.

## 8. Regola del README

Il README deve rimanere breve, attuale e operativo.

- Deve descrivere ciò che il repository fa realmente.
- Deve contenere solo comandi verificabili e nomi di variabili, mai valori sensibili.
- Deve essere aggiornato nella stessa modifica che cambia setup, architettura, script o responsabilità.
- Non deve contenere promesse di sicurezza assoluta, funzionalità future o istruzioni obsolete.
- Le procedure dettagliate appartengono ai documenti dedicati; il README deve collegarle senza duplicarle integralmente.

Una modifica che rende il README falso o incompleto non è considerata conclusa.

## 9. Documentazione collegata

- [`AGENTS.md`](./AGENTS.md): regole operative per agenti e collaboratori
- [`SETUP.md`](./SETUP.md): configurazione applicativa e servizi
- [`SECURITY.md`](./SECURITY.md): stato e raccomandazioni di sicurezza
- [`MIGRATION-GUIDE.md`](./MIGRATION-GUIDE.md): indicazioni sulle migrazioni

In caso di conflitto, il codice e la configurazione verificata descrivono lo stato corrente; la documentazione deve essere corretta nella stessa attività.
