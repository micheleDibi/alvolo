<div align="center">

<img src="frontend/public/icons/icon-192.png" width="96" height="96" alt="AlVolo" />

# AlVolo ✈️

**Inbox personale di cattura al volo.** Butti dentro screenshot, link e idee con zero
attrito; un'AI li **arricchisce in background** (titolo, riassunto, tag, approfondimento;
OCR sulle immagini, fetch+riassunto sui link). Si consulta come **app** su iPhone (PWA) e
da PC, con uno **Shortcut iOS** per catturare dal menu Condividi senza nemmeno aprire l'app.

</div>

## Screenshot

<table>
  <tr>
    <td align="center"><b>Inbox</b><br/><img src="docs/screenshots/inbox.png" width="220" alt="Inbox"/></td>
    <td align="center"><b>Dettaglio</b><br/><img src="docs/screenshots/detail.png" width="220" alt="Dettaglio"/></td>
    <td align="center"><b>Cattura</b><br/><img src="docs/screenshots/capture.png" width="220" alt="Cattura"/></td>
    <td align="center"><b>Impostazioni</b><br/><img src="docs/screenshots/settings.png" width="220" alt="Impostazioni"/></td>
  </tr>
</table>

## Caratteristiche

- ⚡ **Cattura istantanea** di testo, link e immagini: l'API risponde subito (202), l'AI lavora dopo.
- 🧠 **Arricchimento AI** (Anthropic Claude): titolo, riassunto, categoria, tag, punti chiave, approfondimento, spunti correlati. OCR + descrizione sulle immagini, fetch + riassunto sui link.
- 📱 **PWA installabile** su iPhone ("Aggiungi a Home") e usabile da PC — stessa app.
- 🔗 **Shortcut iOS** nel menu Condividi per la cattura "al volo".
- 🗂️ **Inbox** con stato live (in coda → elaboro → pronto/errore), dettaglio, retry, elimina.
- 🏠 **Self-hosted**: un solo container Docker, dati tuoi (SQLite + immagini su volume).

## Come funziona

```
Cattura (PWA o Shortcut) ──POST /api/capture──▶ 202 immediato · item = "in coda"
                                                        │
                            worker asyncio in-process ◀─┘   (la tabella item È la coda)
                                  │ enrich con Claude (Opus per immagini, Sonnet per testo/link)
                                  ▼
                            item = "pronto"  ◀── la PWA fa polling e mostra la card arricchita
```

Lo stato vive nel DB (`capturing → processing → done/failed`), quindi sopravvive ai
riavvii; all'avvio gli item rimasti in `processing` vengono rimessi in coda.

## Stack

- **Backend**: Python 3.12 · FastAPI · SQLModel/SQLite (WAL) · worker asyncio in-process (niente broker)
- **AI**: Anthropic Claude — `claude-opus-4-8` (vision) e `claude-sonnet-4-6` (testo/link), output strutturato
- **Frontend**: React 18 + Vite + TypeScript · Tailwind CSS v4 + shadcn/ui · icone Lucide · font Space Grotesk + Inter (self-hosted) · PWA (vite-plugin-pwa) · TanStack Query
- **Deploy**: un container Docker (frontend buildato dentro il backend), pensato per un VPS

---

## Sviluppo locale

Requisiti: Python 3.12, Node 20+.

**Backend**
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
cp ../.env.example .env          # opzionale: configura le variabili
DATA_DIR=./data alembic upgrade head
DATA_DIR=./data uvicorn app.main:app --reload --port 8000
```
Senza `ANTHROPIC_API_KEY` gira un **arricchimento mock** (l'intero flusso funziona, solo i
contenuti AI sono placeholder). Senza `CAPTURE_TOKEN` l'**auth è disabilitata** (solo dev).

**Frontend**
```bash
cd frontend
npm install
npm run dev      # http://localhost:5173 (proxy /api -> http://127.0.0.1:8000)
```

**Test**
```bash
cd backend && source .venv/bin/activate && pytest
```

---

## Deploy sul VPS

Servono **Docker** + **Docker Compose** sul VPS, e un **dominio** (o sottodominio) puntato
all'IP del VPS — l'HTTPS è obbligatorio per la PWA e lo Shortcut iOS.

**1. Clona e configura**
```bash
git clone https://github.com/micheleDibi/alvolo.git
cd alvolo
cp .env.example .env
# modifica .env: imposta ANTHROPIC_API_KEY e un CAPTURE_TOKEN
#   genera il token con: python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

**2. Avvia l'app**
```bash
docker compose up -d --build
```
L'app gira su `127.0.0.1:8000`, con DB e immagini nel volume `alvolo_data` (persistente).
Per usare un'altra porta, imposta `APP_PORT` nel `.env` (es. `APP_PORT=9090` → l'app sarà
su `127.0.0.1:9090`). Il container resta sempre sulla 8000 internamente.

> Se il reverse proxy gira su **un'altra macchina** (es. Nginx Proxy Manager sulla LAN),
> `127.0.0.1` non è raggiungibile da fuori: imposta `APP_BIND` nel `.env` con l'IP LAN
> dell'host (es. `APP_BIND=192.168.40.13`) o `0.0.0.0`, poi `docker compose up -d`.

**3. Reverse proxy + HTTPS** — scegli UNA delle due:

<details>
<summary><b>Caddy (consigliato — HTTPS automatico)</b></summary>

```bash
sudo apt install caddy
```
`/etc/caddy/Caddyfile`:
```
alvolo.tuodominio.com {
    reverse_proxy 127.0.0.1:8000
}
```
```bash
sudo systemctl reload caddy
```
Caddy ottiene e rinnova il certificato Let's Encrypt da solo.
</details>

<details>
<summary><b>nginx + certbot (se hai già nginx)</b></summary>

vhost:
```nginx
server {
    server_name alvolo.tuodominio.com;
    client_max_body_size 12m;          # immagini fino a ~10MB
    location / { proxy_pass http://127.0.0.1:8000; proxy_set_header Host $host; }
}
```
```bash
sudo certbot --nginx -d alvolo.tuodominio.com
```
</details>

**4. Aggiornamenti**
```bash
git pull && docker compose up -d --build
```

> ⚠️ **Una sola istanza** (`--workers 1`, già impostato nel Dockerfile): il worker
> in-process e SQLite assumono un unico processo scrittore. Non scalare a più repliche.

**Backup**: il volume `alvolo_data` contiene tutto. Esempio:
`docker run --rm -v alvolo_data:/data -v $PWD:/b alpine tar czf /b/alvolo-backup.tgz -C /data .`

---

## iPhone

1. Apri il dominio in **Safari** → **Condividi** → **Aggiungi alla schermata Home**.
2. In **Impostazioni** della PWA incolla il `CAPTURE_TOKEN` (salvato solo sul dispositivo).
3. Crea lo **Shortcut** di cattura seguendo [`shortcut/AlVolo.md`](shortcut/AlVolo.md):
   apparirà nel menu **Condividi** per screenshot, link e testo.

---

## Variabili d'ambiente

| Variabile | Default | Note |
|---|---|---|
| `ANTHROPIC_API_KEY` | _(vuoto)_ | vuoto ⇒ mock enrichment |
| `OPUS_MODEL` | `claude-opus-4-8` | modello vision (immagini) |
| `SONNET_MODEL` | `claude-sonnet-4-6` | modello testo/link |
| `CAPTURE_TOKEN` | _(vuoto)_ | vuoto ⇒ **auth disabilitata** (solo dev) |
| `DATA_DIR` | `./data` | DB + uploads; in Docker = `/data` (volume) |
| `WORKER_CONCURRENCY` | `2` | chiamate Claude in parallelo |
| `APP_PORT` | `8000` | porta host pubblicata da docker compose |
| `APP_BIND` | `127.0.0.1` | interfaccia host del bind; IP LAN o `0.0.0.0` se il proxy è su un'altra macchina |

## Struttura del codice

```
backend/app/
  main.py     FastAPI: lifespan (DB + worker), router, static SPA, /api/health
  config.py · db.py · models.py · schemas.py · auth.py · storage.py
  api/        capture.py (POST /api/capture) · items.py (list/detail/image/retry/delete)
  worker/     queue.py (loop) · enrich.py (branch per tipo) · claude.py · extract.py
frontend/src/ React PWA (Inbox, ItemDetail, Capture, Settings) · UI Tailwind/shadcn (components/ui) · design system in styles.css
Dockerfile · docker-compose.yml · shortcut/AlVolo.md
```

## Percorsi di upgrade (non necessari ora)
Ricerca full-text (i campi testo ci sono già) · Postgres (codice SQLModel portabile) ·
object storage S3/R2 (layer `storage.py` astratto) · job broker · Web Push.
