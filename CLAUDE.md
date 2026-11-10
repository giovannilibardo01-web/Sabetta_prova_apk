# Sabetta_prova_apk — istruzioni per Claude Code

## Che cos'è questo repository
APK **di prova** del prototipo `sabetta-app.jsx`, solo Android, impacchettato con
Vite + Capacitor. Serve al titolare per toccare il prototipo su un telefono vero.

- **Non** è l'app definitiva. L'app vera è in Expo (React Native, TypeScript) nel repo
  privato `Sabetta_in_piazza`; le decisioni del progetto stanno in
  `Sabetta_in_piazza/docs/00-DECISIONI.md` e **vincono su tutto**, prototipo compreso.
- **Non** va su Google Play e non va data ai clienti.

## Chi ti parla
Il titolare del progetto, non uno sviluppatore. Rispondi in italiano semplice, senza gergo
superfluo. Quando una cosa costa soldi o tempo, dillo. Se una richiesta contraddice le
regole qui sotto, segnalalo prima di procedere.

## Struttura (tutto nella cartella principale, niente `src/`)
| File | Ruolo |
|---|---|
| `sabetta-app.jsx` | Il prototipo intero (React, un solo file, CSS nella costante `CSS`). |
| `main.jsx` | Avvio. Sostituisce `window.storage` (esiste solo dentro Claude) con `localStorage`. |
| `index.html` | Pagina di partenza, carica `/main.jsx`. |
| `capacitor.config.json` | `appId` `it.sabettaortofrutta.app.preview`, nome «Sabetta (prova)». |
| `.github/workflows/build-apk-prova.yml` | Compila l'APK su GitHub a ogni push su `main`. |

La cartella `android/` **non** è nel repo: la genera il workflow (`npx cap add android`).

## Come si compila
- **Normale:** push su `main` → scheda Actions → artifact `sabetta-prova-apk`
  (dentro `app-debug.apk`). Circa 3 minuti.
- **In locale** (servono JDK 21 e Android SDK): `npm install`, `npm run build`,
  `npx cap add android` (solo la prima volta), `npx cap sync android`,
  poi `cd android && ./gradlew assembleDebug`.

Ogni build di GitHub firma con una chiave di debug nuova: per installare un APK nuovo il
titolare deve **prima disinstallare** quello vecchio. Ricordaglielo.

## Regole che non si toccano
- Nessun segreto nel repo o nell'app: niente `service_role` Supabase, chiavi segrete
  Stripe, chiave Anthropic, keystore, `.env`. Niente chiavi incollate in chat.
- Non usare il package definitivo `it.sabettaortofrutta.app`: qui resta `.preview`.
- **Non collegare Supabase o Stripe a questo prototipo.** Totali, punti, coupon e
  pagamenti vanno decisi dal server e il pagato lo conferma solo il webhook Stripe: è il
  lavoro della riscrittura Expo (tappe 2–7), non di questo repo.
- Solo Android: niente selettore iPhone/Android, niente stili iOS.

## Limiti noti della prova
- Tasto indietro di Android non gestito (probabilmente chiude l'app).
- Da verificare a schermo intero: la testata non deve finire sotto la barra di stato.
- Betta risponde solo con il motore locale in `rispostaLocale` (argomenti a punteggio +
  ricerca nel catalogo): nessuna chiamata AI dal telefono, nessuna chiave nell'app, ed è giusto.
- PIN del gestionale `1234`, dati solo sul telefono.

## Prima di ogni push
1. `npm install` e `npm run build` devono finire senza errori.
2. `grep -rniE "service_role|sk_live|sk_test|api[_-]?key" --exclude-dir=node_modules --exclude=CLAUDE.md .`
   non deve trovare nulla.
3. Messaggio di commit in italiano che dica cosa cambia per chi usa l'app.
4. Dopo il push, controlla che il workflow su Actions finisca verde.
