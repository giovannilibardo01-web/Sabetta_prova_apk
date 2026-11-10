# Sabetta — APK di prova del prototipo (solo Android)

Il prototipo `sabetta-app.jsx` impacchettato come app Android, per vederlo e toccarlo su un
telefono vero. **Non è l'app definitiva e non va su Google Play.**

## Come ottenere l'APK
1. Ogni modifica caricata su `main` fa partire la compilazione da sola (scheda **Actions**).
   Per rilanciarla a mano: *Actions → Build APK di prova → Run workflow*.
2. A spunta verde, in fondo alla pagina del lavoro, sotto *Artifacts*, scarica
   `sabetta-prova-apk` ed estrai `app-debug.apk`.
3. **Disinstalla la vecchia «Sabetta (prova)»** dal telefono, poi installa il nuovo APK
   (consenti l'installazione da quella fonte; se Play Protect avvisa, *Installa comunque*).

## Cosa sapere
- Dati solo sul telefono, nessun server. Supabase e Stripe non sono collegati: arriveranno
  con l'app vera in Expo.
- Betta risponde solo dal telefono, con domande frequenti e dati del banco: nessuna AI,
  nessuna chiave nell'app.
- Tasto indietro di Android non gestito.
- PIN del gestionale `1234`: non dare questo APK ai clienti.
- Nome del pacchetto `it.sabettaortofrutta.app.preview`; quello definitivo non viene toccato.

## Come leggere il log dal telefono
Serve un PC e il cavo USB (o la stessa rete Wi-Fi, da Android 11).

1. **Sul telefono attiva le Opzioni sviluppatore:** *Impostazioni → Info sul telefono*
   (su Samsung *→ Informazioni sul software*) e tocca 7 volte *Numero build*.
   Poi *Impostazioni → Opzioni sviluppatore → Debug USB* acceso.
2. Collega il telefono e accetta la richiesta «Consentire il debug USB?».
3. **Modo più comodo, Chrome sul PC:** apri `chrome://inspect/#devices`, sotto il telefono
   compare «Sabetta (prova)»: clicca *inspect*. Nella scheda *Console* vedi errori e
   messaggi dell'app (quelli di Betta iniziano con `[Betta]`), in *Network* le chiamate.
   Funziona con l'APK di prova di GitHub, che è una build di debug.
4. **Log completo di Android (adb):** scarica gratis gli *Android SDK Platform-Tools* da
   developer.android.com, estrai lo zip e da quella cartella lancia:
   - `adb devices` (deve comparire il telefono come `device`)
   - `adb logcat -c` per pulire, poi riproduci il problema sull'app
   - `adb logcat -d -v time Capacitor:V Capacitor/Console:V AndroidRuntime:E *:S > log-sabetta.txt`
   Il file `log-sabetta.txt` contiene i messaggi dell'app e gli eventuali crash.
5. **Senza cavo (Android 11 o più):** *Opzioni sviluppatore → Debug wireless → Associa
   dispositivo con codice*, poi sul PC `adb pair IP:PORTA` e `adb connect IP:PORTA`
   con i numeri mostrati dal telefono; dopo, i comandi del punto 4 sono gli stessi.

Prima di girare il log a qualcuno, guardalo: può contenere nomi, telefoni e indirizzi
inseriti nell'app.
