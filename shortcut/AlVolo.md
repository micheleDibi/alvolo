# Shortcut iOS — "Cattura al Volo"

Questo Shortcut aggiunge **AlVolo** al menu **Condividi** di iOS: da Safari, Foto o
qualsiasi app, condividi un link, uno screenshot o del testo selezionato e finisce
direttamente nella tua inbox AlVolo — senza nemmeno aprire l'app.

> Perché serve uno Shortcut e non basta la PWA? Su iOS, Safari **non** permette a una web
> app di registrarsi come destinazione del menu Condividi (la *Web Share Target API* non è
> supportata). Lo Shortcut è il modo nativo per ottenere la cattura "al volo".

## Cosa ti serve
- L'URL pubblico del tuo server, es. `https://alvolo.tuodominio.com`
- Il tuo **token** (`CAPTURE_TOKEN`). Lo trovi/copi nella PWA → **Impostazioni → Copia token**.

L'endpoint di cattura è: `https://<tuo-dominio>/api/capture`

---

## Costruirlo a mano (5 minuti)

Apri l'app **Comandi** (Shortcuts) → **+** (nuovo comando).

### 1. Impostazioni del comando (icona (i) o "Dettagli")
- Attiva **"Mostra nel foglio di condivisione"**.
- **Tipi di input accettati**: seleziona **Immagini**, **URL**, **Testo**
  (oppure lascia **Qualsiasi**). iOS gestisce un solo "contenitore" di input, quindi
  smistiamo nella logica qui sotto.

### 2. Azioni (in ordine)

1. **Ricevi** `Immagini, URL, Testo` **dal foglio di condivisione**
   - In "Se non c'è input": **Chiedi testo** (così funziona anche se lo lanci a mano per
     scrivere una nota veloce).

2. *(consigliato)* **Mostra notifica** → testo: `Catturo al volo…`
   (feedback immediato mentre parte la richiesta).

3. **Se** `Input del comando` **ha valore** … usa l'azione **"Ottieni tipo di"**
   (Get Type of) sull'Input e ramifica:

   **A) Se è un'Immagine**
   - *Preferito (semplice e robusto):* invia il file direttamente.
     - **Ottieni contenuto di URL** (Get Contents of URL):
       - URL: `https://<tuo-dominio>/api/capture`
       - Metodo: **POST**
       - **Intestazioni**: `Authorization` = `Bearer IL-TUO-TOKEN`
       - **Corpo richiesta**: **Modulo** (Form)
       - Campi del modulo:
         - `image` = *(l'Immagine ricevuta)*  ← scegli il tipo **File**
         - `source` = `shortcut`
   - *Alternativa base64* (solo se la tua versione di iOS dà problemi col file):
     - **Codifica** l'immagine in **Base64**. ⚠️ Apri le opzioni dell'azione e imposta
       **"A capo automatico" / Line Breaks = Nessuno (None)**. Il default "Standard" spezza
       il testo ogni 76 caratteri e **corrompe silenziosamente** le immagini grandi.
     - Poi **Ottieni contenuto di URL** come sopra, ma il campo `image` = *(testo Base64)*.

   **B) Altrimenti, se è un URL**
   - **Ottieni contenuto di URL**:
     - URL: `https://<tuo-dominio>/api/capture`, Metodo **POST**
     - Intestazioni: `Authorization` = `Bearer IL-TUO-TOKEN`
     - Corpo: **Modulo**, campi: `url` = *(Input del comando)*, `source` = `shortcut`

   **C) Altrimenti (Testo)**
   - **Ottieni testo dall'input** (se necessario) → **Ottieni contenuto di URL**:
     - POST, Intestazioni `Authorization: Bearer IL-TUO-TOKEN`
     - Corpo: **Modulo**, campi: `text` = *(il Testo)*, `source` = `shortcut`

4. *(opzionale)* **Mostra notifica** → `Catturato ✓`

Rinomina il comando in **"AlVolo"** e scegli un'icona. Fatto.

### Provalo
- In **Foto**: apri uno screenshot → **Condividi** → scorri fino a **AlVolo** → tocca.
- In **Safari**: **Condividi** una pagina → **AlVolo**.
- Apri la PWA: l'elemento compare subito come *in coda/elaboro* e dopo qualche secondo
  diventa *pronto* con titolo, riassunto e approfondimento.

---

## Note
- Il server risponde **202** in meno di ~300 ms, quindi il foglio di condivisione si chiude
  subito: è questo a dare la sensazione "al volo".
- **Token**: tienilo in un'azione **Testo** in cima al comando (o "Chiedi una volta" e
  memorizzalo). Se cambi il token sul server, riaprilo e aggiornalo qui.
- **Niente auto-update**: se in futuro cambiamo la ricetta, dovrai ricrearla/reimportarla.
- Sicurezza: tutto passa su **HTTPS**; non condividere il token. In caso di necessità,
  rigeneralo sul server (`CAPTURE_TOKEN`) e aggiornalo nella PWA e nello Shortcut.
