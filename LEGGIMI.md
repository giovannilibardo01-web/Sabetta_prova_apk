# Sabetta — APK di prova del prototipo

**Che cos'è.** Il prototipo `sabetta-app.jsx` impacchettato come app Android, solo per
vederlo e toccarlo su un telefono vero. **Non è l'app definitiva e non va su Google Play.**
L'app vera sarà quella in Expo del piano a 13 tappe, con il suo APK di prova (profilo
`preview`) alla tappa 12.

## Come ottenere l'APK (circa 10 minuti, nessun programma da installare)

1. Su GitHub crea un repository **privato nuovo**, ad esempio `Sabetta_prova_apk`.
   Non usare `Sabetta_in_piazza`: questa prova resta separata.
2. Carica dentro **tutto il contenuto di questa cartella** (Add file → Upload files).
   Se la cartella nascosta `.github` non sale, crea a mano il file
   `.github/workflows/build-apk-prova.yml` (Add file → Create new file) e incolla il testo
   del file omonimo.
3. Vai nella scheda **Actions** → *Build APK di prova* → **Run workflow**.
4. Dopo 5–10 minuti il lavoro diventa verde. Aprilo e in fondo, sotto *Artifacts*,
   scarica `sabetta-prova-apk` (è uno zip: dentro c'è `app-debug.apk`).
5. Passa l'APK al telefono (cavo, email a te stesso, Drive). Aprendolo Android chiede di
   consentire l'installazione da quella fonte: conferma.

Se il lavoro diventa rosso, copia l'ultimo blocco di errore del log e incollalo in chat.

## Cosa c'è di diverso dal prototipo nel browser
| Tema | Nella prova |
|---|---|
| Dati | Restano solo sul telefono, nella memoria dell'app. Nessun server. |
| Betta (assistente) | Funziona con le risposte locali di riserva: l'app non ha alcuna chiave per l'AI e non deve averla. |
| Tasto indietro di Android | Non è gestito: probabilmente chiude l'app. Nell'app vera sarà un requisito. |
| Foto | Il selettore del telefono dovrebbe aprirsi; fotocamera da provare. |
| Nome del pacchetto | `it.sabettaortofrutta.app.preview`. Quello definitivo `it.sabettaortofrutta.app` **non** viene toccato. |
| Firma | APK di sviluppo firmato con la chiave di prova di Android. Nessun keystore e nessun segreto in questo kit. |

## Attenzione
- Il PIN del gestionale nel prototipo è `1234` e chi installa può passare alla vista
  negozio: **non distribuire questo APK ai clienti**, solo a chi deve provarlo.
- Il kit non è stato compilato prima della consegna: in questo ambiente non c'è internet
  né Android SDK. Ho controllato sintassi del codice, JSON e YAML; la prima build vera
  è quella di GitHub.
