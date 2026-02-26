# Android Wrapper Ristoratore (Capacitor + FCM Native)

## Scope
- App Android solo ristoratore.
- Clienti restano su PWA/sito normale.
- Wrapper live URL su `https://v0-amicofritto.vercel.app/admin/dashboard`.

## 1) Setup Capacitor Android
- Package Android: `it.amicofritto.ristoratore`
- Nome app: `Amico Fritto Ristoratore`
- Config file: `capacitor.config.ts`
- Comandi utili:
  - `pnpm cap:add:android`
  - `pnpm cap:sync`
  - `pnpm android:open`

## 2) Firebase Android (FCM Native)
1. In Firebase Console crea app Android con package `it.amicofritto.ristoratore`.
2. Scarica `google-services.json`.
3. Copia il file in `android/app/google-services.json`.
4. Esegui `pnpm cap:sync`.

Nota: `google-services.json` e` ignorato da git (`android/.gitignore`).

## 3) Registrazione token native
- Token FCM native salvato su tabella esistente `admin_push_tokens`.
- Endpoint backend:
  - `POST /api/admin/push/native/register`
  - `POST /api/admin/push/native/unregister`
- Entrambi richiedono Bearer token admin Supabase.

## 4) Invio push backend
- Quando arriva un ordine, backend invia push a `admin_push_tokens`.
- Configurazione invio:
  - `android.priority = high`
  - `android.ttl = <seconds>s` (default 14400 = 4h)
  - `android.notification.channel_id = orders_high`
  - `sound = default`
- Payload include `orderId` + `order_id` + `order_number`.
- Tap notifica -> apertura app su `/admin/dashboard?orderId=XYZ`.

## 5) Notification Channel Android
- Creato in `MainActivity`:
  - ID: `orders_high`
  - IMPORTANCE_HIGH
  - suono attivo (default)
  - lockscreen visibility public

## 6) Build release APK firmato
1. Genera keystore:
```bash
keytool -genkeypair -v -keystore af-ristoratore-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias afristoratore
```
2. Configura signing in `android/app/build.gradle` (release `signingConfig`).
3. Build release:
```bash
cd android
./gradlew assembleRelease
```
4. APK output:
`android/app/build/outputs/apk/release/app-release.apk`

Installazione manuale:
- trasferisci APK sul device
- abilita installazione da origini sconosciute
- installa APK

## 7) Checklist ristoratore
- Notifiche app: abilitate
- Volume notifiche: attivo
- Battery optimization: disattivata per l’app
- Background data: consentiti

## 8) Test obbligatorio (stability)
1. Login admin nell’app wrapper.
2. Metti device in standby 60-120 minuti.
3. Invia ordini test.
4. Verifica:
  - consegna push
  - suono
  - tap apre dashboard corretta
  - sessione admin non perde login
