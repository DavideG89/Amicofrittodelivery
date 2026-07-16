# Regole di progetto per Codex

## Obiettivo

Mantenere Amico Fritto stabile mentre si migliora progressivamente qualità del codice, HTML semantico, accessibilità e sicurezza. La correttezza di ordini, prezzi, sconti, consegna, autenticazione e stampa ha priorità sul refactoring estetico.

## Metodo di lavoro

- Prima di modificare, leggere il flusso completo interessato e controllare le modifiche locali già presenti.
- Fare cambi piccoli, verificabili e con un solo obiettivo. Non eseguire riscritture estese senza una richiesta esplicita.
- Preservare comportamento, UI e contratti API salvo requisiti contrari.
- Non aggiungere dipendenze di produzione, cambiare provider o modificare infrastruttura remota senza approvazione.
- Non modificare dati Supabase, variabili d'ambiente, credenziali o servizi esterni. Le migrazioni SQL devono essere file versionati, mai eseguite automaticamente sul database remoto.
- Non delegare ad altri subagent salvo richiesta esplicita dell'utente.
- Comunicare risultati, rischi e limiti in italiano.
- Gli audit frontend e backend possono essere eseguiti in parallelo se entrambi restano in sola lettura. Le implementazioni che condividono file o contratti devono essere sequenziali.
- Dopo modifiche non banali, usare `reviewer` sul diff prima di dichiarare il lavoro completato.

## Confini degli agenti

- `frontend-senior`: pagine non API, componenti, hook, provider UI, stili e accessibilità.
- `backend-security`: route API, autenticazione, autorizzazione, validazione server, accesso dati, middleware, rate limiting e migrazioni SQL.
- `reviewer`: revisione in sola lettura; non implementa e non corregge direttamente.
- Se una modifica attraversa frontend e backend, dividere il lavoro in passaggi separati e documentare il contratto condiviso prima dell'implementazione.

## Invarianti di sicurezza e dominio

- Considerare non attendibili input client, cookie, header, parametri URL e dati provenienti da storage locale.
- Prezzi, sconti, aggiunte, disponibilità e totale ordine devono essere verificati e calcolati sul server usando dati canonici.
- Non esporre chiavi service-role, segreti, token, dettagli interni o dati personali non necessari al browser o nei log.
- Ogni operazione amministrativa deve applicare autenticazione e autorizzazione lato server.
- L'accesso pubblico agli ordini deve prevenire enumerazione e IDOR; restituire solo i campi indispensabili.
- Le policy Supabase RLS fanno parte del confine di sicurezza e devono essere coerenti con le route applicative.
- Non presentare escaping o rimozione di caratteri come sostituto di validazione, encoding contestuale e rendering sicuro.

## Qualità del codice

- Preferire funzioni e componenti piccoli con responsabilità unica e nomi legati al dominio.
- Evitare duplicazione di regole commerciali tra client, route e database.
- Evitare `any`, type assertion non motivate e gestione silenziosa degli errori.
- Separare logica di dominio, accesso dati, trasporto HTTP e presentazione.
- Commentare il motivo di una decisione non ovvia, non riscrivere ciò che il codice dice già.

## Regolamento README

- `README.md` è il regolamento tecnico e operativo del repository: deve essere chiaro, sintetico e coerente con il codice corrente.
- Aggiornare il README nella stessa modifica quando cambiano setup, comandi, variabili, architettura, integrazioni o responsabilità.
- Documentare nomi e scopo delle variabili d'ambiente, mai valori reali, credenziali o identificatori sensibili.
- Non inserire funzionalità pianificate come se fossero già disponibili né dichiarazioni assolute di sicurezza o conformità.
- Evitare duplicazioni estese: collegare `SETUP.md`, `SECURITY.md` e guide dedicate per le procedure di dettaglio.
- Considerare incompleta una modifica che rende il README obsoleto, ambiguo o tecnicamente falso.

## Verifica

- Eseguire controlli proporzionati alla modifica, almeno `npx tsc --noEmit --incremental false` per TypeScript modificato.
- Eseguire `npm run build` per cambi che interessano runtime, routing, configurazione o più moduli, quando l'ambiente lo consente.
- Aggiungere test mirati quando esiste l'infrastruttura; se manca, dichiarare il gap senza inventare una verifica manuale come sostituto.
- Riportare comandi eseguiti, esito e ciò che non è stato verificato.
