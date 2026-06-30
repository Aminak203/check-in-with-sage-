# TalkToMabel — Agent Documentation

## Project Overview

TalkToMabel is a WhatsApp-style conversational mental health app for corporate employees. An AI assistant named "Mabel" triages employees experiencing mental health struggles and delivers guided EFT tapping and hypnotherapy exercises to prevent decline while they wait for a therapist appointment.

## Architecture

```
TalktoMabel/
├── server/
│   ├── index.js          # Express server, API routes, crisis detection
│   ├── llm.js            # OpenAI client wrapper, system prompt, reasoning stripping
│   └── triage.js         # Crisis keyword detection list
├── client/
│   ├── package.json      # React + Vite dependencies
│   ├── vite.config.js    # Vite config, API proxy
│   ├── index.html        # Entry HTML
│   └── src/
│       ├── main.jsx      # React entry point
│       ├── App.jsx       # Main app, session management, auto-lock, persistence
│       ├── App.css       # All styles (WhatsApp theme, lock screen, crisis overlay)
│       └── components/
│           ├── ChatWindow.jsx       # Chat container, header with lock/wipe buttons
│           ├── MessageBubble.jsx    # User/bot message bubbles
│           ├── InputBar.jsx         # Text input + send button
│           ├── CrisisOverlay.jsx    # Crisis modal (Samaritans/MIND)
│           └── LockScreen.jsx       # Passphrase lock screen (encrypt/decrypt)
│       └── utils/
│           └── crypto.js            # AES-256-GCM encryption via Web Crypto API
├── .env                  # LLM config (DO NOT COMMIT)
├── .env.example          # Template
├── .gitignore
├── package.json          # Root deps (express, openai, cors, concurrently, dotenv)
└── plan.md               # Original project plan
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 5 |
| Styling | Plain CSS (WhatsApp dark theme) |
| Backend | Node.js + Express 4 |
| LLM | Qwen 3.6 27B via `http://localhost:1234/v1` (OpenAI-compatible) |
| Encryption | Web Crypto API (AES-256-GCM, PBKDF2 key derivation) |
| Persistence | localStorage (client-side encrypted only) |

## Configuration

### `.env` (server-side)

```
OPENAI_BASE_URL=http://localhost:1234/v1
OPENAI_MODEL=qwen3.6-27b
OPENAI_API_KEY=localhost
```

Change `OPENAI_MODEL` to match whatever model is loaded in LM Studio.

### LLM Settings (`server/llm.js`)

| Setting | Location | Default | Purpose |
|---------|----------|---------|---------|
| System prompt | `SYSTEM_PROMPT` (line 9) | — | Defines Mabel's personality, triage logic, EFT/hypnotherapy guidance |
| Model name | line 80 | `qwen3.6-27b` | Must match LM Studio loaded model |
| Temperature | line 82 | `0.7` | Response creativity |
| Max tokens | line 83 | `512` | Max response length |

### Crisis Keywords (`server/triage.js`)

The `crisisKeywords` array (line 1) contains case-insensitive triggers. When matched, the frontend shows the `CrisisOverlay` with UK helpline numbers. Add or remove keywords as needed.

### TTS Settings (`server/tts.js`, `.env`)

| Setting | Location | Default | Purpose |
|---------|----------|---------|---------|
| TTS_HOST | `.env` | `127.0.0.1` | edge-tts server hostname |
| TTS_PORT | `.env` | `8765` | edge-tts server port |
| TTS_VOICE | `.env` | `en-GB-SoniaNeural` | Voice ID (calm UK female) |

**Available voices:** Run `edge-tts --list-voices` to see all options. Recommended for Mabel: `en-GB-SoniaNeural`, `en-GB-AdaNeural`, `en-GB-RyanNeural`.

## Starting the App

### Prerequisites
- MedGemma or Qwen model running via LM Studio on `localhost:1234`
- Node.js 18+
- Python 3.10+ with `edge-tts` package (`pip install edge-tts`)

### Commands

```powershell
# Kill any existing processes
Get-Process -Name "node","python" -ErrorAction SilentlyContinue | Stop-Process -Force

# Terminal 1 — Start edge-tts server
python server/tts_server.py

# Terminal 2 — Start backend
node server/index.js

# Terminal 3 — Start frontend
cd client
npm run dev
```

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`
- TTS server: `http://127.0.0.1:8765`
- Health check: `http://localhost:3001/health`

## API Endpoints

### `POST /api/chat`

**Request:**
```json
{
  "messages": [
    { "role": "user", "content": "I've been feeling stressed" }
  ]
}
```

**Response:**
```json
{
  "reply": "I'm sorry you're going through that...",
  "crisis": false
}
```

### `POST /api/tts`

**Request:**
```json
{
  "text": "Hello, I'm Mabel.",
  "calm": false
}
```

**Response:** Audio/mpeg blob (MP3 audio data)

The `calm` flag reduces speech rate by 20% for therapy content.

### `GET /health`

```json
{ "status": "ok" }
```

## TTS Architecture

Text-to-speech uses edge-tts via a local Python server:

1. Frontend calls `speak(text)` in `client/src/utils/tts.js`
2. Text is queued and fetched from `/api/tts` on Express server
3. Express proxies to edge-tts Python server (`server/tts_server.py`)
4. Audio blob returned as MP3, played via HTML5 `<Audio>` element
5. Queue ensures messages are spoken in order with ~500ms-2s latency

## Triage Flow

```
Greeting → User describes issue
  → Mabel asks for severity (0-10) + duration
  → Branch:
      CRITICAL (8-10 + crisis keywords) → CrisisOverlay with Samaritans/MIND
      MODERATE (5-7) → Offer guided EFT tapping session
      MILD (1-4) → Offer breathing / hypnotherapy
  → Post-session check-in → loop or close
```

## Encryption & Persistence

All session data is encrypted **client-side** before storage:

1. User creates a passphrase on first visit
2. Messages encrypted with AES-256-GCM (PBKDF2 key derivation, 100k iterations)
3. Encrypted blob stored in `localStorage` — server never sees plaintext
4. Auto-lock after 10 minutes of inactivity
5. Manual lock via 🔒 button in header
6. Wipe all data via 🗑️ button in header
7. On return, user enters passphrase to decrypt and resume

**Zero server-side data exposure.** No database. No server-side keys.

## Crisis Resources (UK)

| Service | Contact |
|---------|---------|
| Samaritans | 116 123 |
| MIND In Crisis | 0808 808 1111 |
| Text SHOUT | 85258 |

## Modifying the System Prompt

Edit `server/llm.js` → `SYSTEM_PROMPT`. After changes, restart the backend:

```powershell
# Kill backend process
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "server" } | Stop-Process -Force
# Or kill all and restart both
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
node server/index.js
```

## Known Issues

- **Reasoning models:** Qwen outputs `<thinking>` tags that are stripped server-side. If using a different reasoning model, add its tag format to `stripReasoning()` in `server/llm.js`.
- **Role alternation:** The greeting message is filtered out before sending to the LLM to prevent `system → assistant` role ordering errors.
- **Port conflicts:** If port 3001 is in use, kill existing node processes before restarting.
