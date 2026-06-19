# AlVolo — Estensione browser (Chrome/Edge, MV3)

"Salva in AlVolo" dal desktop: cattura la pagina corrente, un link o una selezione di
testo nella tua inbox, con un clic. Usa l'API `/api/capture` esistente (nessuna modifica
al server).

## Installazione (modalità sviluppatore)
1. Apri `chrome://extensions`, attiva **Modalità sviluppatore**.
2. **Carica estensione non pacchettizzata** → seleziona questa cartella `extension/`.
3. Apri le **Opzioni** dell'estensione e imposta:
   - **Endpoint**: l'URL base della tua istanza (es. `https://alvolo.tuodominio.com`)
   - **Token**: il `CAPTURE_TOKEN` del server
   - (salvati solo nel profilo del browser via `chrome.storage.sync`)

## Uso
- **Popup** (icona in barra): "Salva questa pagina" oppure "Salva solo la nota".
- **Menu contestuale** (tasto destro): "Salva questa pagina / il link / la selezione in AlVolo".

Le catture arrivano con `source: "extension"` e vengono arricchite in background come le altre.
