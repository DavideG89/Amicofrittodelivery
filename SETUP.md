# Setup di Amico Fritto

Questa guida descrive la configurazione riproducibile del progetto. Non inserire credenziali reali nei file versionati.

## 1. Prerequisiti

- Node.js compatibile con la versione Next.js installata
- pnpm
- progetto Supabase
- accesso al SQL Editor e alla sezione Authentication di Supabase

## 2. Installazione locale

```bash
pnpm install
pnpm dev
```

L'applicazione è normalmente disponibile su `http://localhost:3000`.

## 3. Variabili d'ambiente

Creare `.env.local` nella root:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_ADMIN_EMAIL=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Regole:

- `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` sono pubbliche per definizione.
- `SUPABASE_SERVICE_ROLE_KEY` è un segreto server-side e non deve mai comparire nel browser, nei log o nei commit.
- `NEXT_PUBLIC_ADMIN_EMAIL` identifica l'account usato dalla schermata di login; l'autorizzazione effettiva dipende anche da `public.admin_users`.
- Firebase, reCAPTCHA e stampa richiedono variabili aggiuntive solo quando le rispettive integrazioni sono abilitate.

## 4. Database

### Nuovo database

Gli script in `scripts/` sono numerati. Eseguirli in ordine, fermandosi dopo lo script 20 per configurare il primo amministratore. Lo script 05 crea soltanto la tabella dei token push admin: l'invio push è responsabilità dell'API ordini e non richiede URL o segreti dentro una migrazione.

Lo script `02-seed-data.sql` inserisce dati dimostrativi: eseguirlo solo se desiderati.

### Database esistente

Non rieseguire indiscriminatamente tutta la cronologia. Esportare prima schema, policy, grant, funzioni e trigger, quindi applicare soltanto le migrazioni mancanti.

Nessun agente o comando locale deve applicare automaticamente migrazioni al database remoto.

## 5. Configurazione amministratore

L'unico sistema supportato è Supabase Auth con allowlist `public.admin_users`.

1. Creare l'utente amministratore in Supabase Authentication.
2. Eseguire `scripts/20-create-admin-authorization.sql`.
3. Copiare l'UUID dell'utente da `auth.users`.
4. Inserire esplicitamente l'UUID:

```sql
INSERT INTO public.admin_users (user_id)
VALUES ('UUID-REALE-UTENTE')
ON CONFLICT (user_id) DO NOTHING;
```

5. Verificare che la query restituisca una riga:

```sql
SELECT au.user_id, u.email
FROM public.admin_users au
JOIN auth.users u ON u.id = au.user_id;
```

6. Esportare le policy correnti come rollback.
7. Eseguire `scripts/21-harden-row-level-security.sql`.
8. Impostare `NEXT_PUBLIC_ADMIN_EMAIL` con l'email dello stesso utente.

Lo script 21 si interrompe senza modifiche se non trova almeno un amministratore valido o una tabella richiesta.

### Ordine di rilascio obbligatorio

1. Creare un backup ed esportare policy e grant correnti.
2. Applicare lo script 20, che è preparatorio e non revoca accessi esistenti.
3. Verificare eventuali righe legacy incomplete e correggerle prima di proseguire:

```sql
SELECT COUNT(*) AS admin_rows_without_user_id
FROM public.admin_users
WHERE user_id IS NULL;
```

4. Inserire e verificare l'UUID amministratore.
5. Applicare lo script 21 in staging e completare i test admin/non-admin.
6. Applicare lo script 21 in produzione.
7. Applicare `scripts/22-add-order-public-token.sql`.
8. Distribuire il nuovo codice applicativo subito dopo, nella stessa finestra di manutenzione.

Se il deploy applicativo deve essere annullato, ripristinare la versione precedente del codice; le nuove policy possono restare attive se i test della dashboard precedente sono verdi. In caso contrario, ripristinare l'esportazione esatta delle policy raccolta al punto 1.

Tra lo script 21 e il nuovo deploy, la versione precedente della dashboard non può eseguire “Pulisci ordini vecchi”, perché chiamava direttamente la RPC ora riservata al service-role. Le altre operazioni restano coperte dalle policy; mantenere comunque questo intervallo il più breve possibile.

Tra lo script 22 e il deploy, i vecchi link ordine continuano a funzionare perché gli ordini esistenti hanno `public_token = NULL`. Dopo il deploy, i nuovi ordini ricevono un token casuale e il link pubblico deve includere `?token=...`.

## 6. Verifica dopo il rollout

Verificare in staging:

1. menu pubblico, prodotti, informazioni locale, salse e upsell;
2. login e logout amministratore;
3. rifiuto di un utente Supabase autenticato ma non presente in `admin_users`;
4. checkout nuovo ordine e apertura del link `/order/NUMERO?token=...`;
5. lettura ordini, ricavi e feedback dalla dashboard;
6. CRUD di menu, impostazioni, sconti e upsell;
7. cambio stato ordine, Realtime, push e coda stampa;
8. checkout tramite API server con service-role.

## 7. Comandi di verifica locale

```bash
pnpm exec next typegen
pnpm exec tsc --noEmit --incremental false
pnpm build
```

La build richiede accesso ai font remoti configurati tramite `next/font`.

## 8. Rollback RLS

Non usare `DISABLE ROW LEVEL SECURITY` come rollback.

In caso di lockout:

1. usare SQL Editor o service-role;
2. verificare la riga in `admin_users`;
3. verificare `SELECT public.is_admin()` in una sessione autenticata;
4. ripristinare l'esportazione delle policy precedenti solo se necessario.

La colonna `orders.payment_method` aggiunta dallo script 21 è additive e può restare presente.
