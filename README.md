# TalkToMabel

A WhatsApp-style conversational mental health app for corporate employees. An AI assistant named "Mabel" triages employees experiencing mental health struggles and delivers guided EFT tapping and hypnotherapy exercises to prevent decline while they wait for a therapist appointment.

## Features

- **Conversational Triage** — Mabel assesses distress level through natural conversation before recommending interventions
- **EFT Tapping Sessions** — Guided Emotional Freedom Techniques with auto-play support
- **Hypnotherapy Exercises** — Progressive muscle relaxation, 4-7-8 breathing, and safe-place visualization
- **Crisis Detection** — Automatic detection of crisis keywords with UK helpline overlay (Samaritans, MIND, SHOUT)
- **Client-Side Encryption** — All session data encrypted with AES-256-GCM before localStorage persistence
- **Auto-Lock** — Session locks after 10 minutes of inactivity
- **Neural TTS Voice** — Natural UK female voice (edge-tts) for spoken responses

## Architecture

```
TalktoMabel/
├── server/
│   ├── index.js          # Express server, API routes (/api/chat, /api/tts)
│   ├── llm.js            # OpenAI client wrapper, system prompt, reasoning stripping
│   ├── tts.js            # TTS proxy to edge-tts Python server
│   ├── triage.js         # Crisis/rating/therapy keyword detection
│   └── tts_server.py     # edge-tts HTTP server (Python)
├── client/
│   ├── package.json      # React + Vite dependencies
│   ├── vite.config.js    # Vite config, API proxy to :3001
│   ├── index.html        # Entry HTML
│   └── src/
│       ├── main.jsx      # React entry point
│       ├── App.jsx       # Main app, session management, auto-lock, EFT autoplay
│       ├── App.css       # All styles (WhatsApp theme)
│       └── components/
│           ├── ChatWindow.jsx       # Chat container, header with lock/wipe/mute buttons
│           ├── MessageBubble.jsx    # User/bot message bubbles
│           ├── InputBar.jsx         # Text input + send button
│           ├── CrisisOverlay.jsx    # Crisis modal (Samaritans/MIND)
│           ├── LockScreen.jsx       # Passphrase lock screen
│           └── DistressScale.jsx    # Inline emoji distress scale 1-10
│       └── utils/
│           ├── crypto.js            # AES-256-GCM encryption via Web Crypto API
│           └── tts.js               # TTS queue manager, fetches audio from /api/tts
├── .env                  # LLM + TTS config (DO NOT COMMIT)
├── .env.example          # Template
├── .gitignore
└── package.json          # Root deps and scripts
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 5 |
| Styling | Plain CSS (WhatsApp theme) |
| Backend | Node.js + Express 4 |
| LLM | Qwen/Gemma via LM Studio `localhost:1234` (OpenAI-compatible) |
| TTS | edge-tts (Microsoft neural voices, local Python server) |
| Encryption | Web Crypto API (AES-256-GCM, PBKDF2 key derivation) |
| Persistence | localStorage (client-side encrypted only) |

## Prerequisites

- **Node.js 18+** — [nodejs.org](https://nodejs.org/)
- **Python 3.10+** — [python.org](https://www.python.org/)
- **LM Studio** — [lmstudio.ai](https://lmstudio.ai/) (for local LLM inference)

## Setup

### 1. Install Dependencies

```powershell
# Root dependencies (Express, OpenAI client, etc.)
npm install

# Client dependencies (React, Vite)
cd client
npm install
cd ..

# Python TTS dependency
pip install edge-tts
```

### 2. Configure Environment

Copy `.env.example` to `.env` and adjust values:

```powershell
Copy-Item .env.example .env
```

Required variables in `.env`:

```ini
# LLM — must match your LM Studio setup
OPENAI_BASE_URL=http://localhost:1234/v1
OPENAI_MODEL=gemma-4-31b-it        # Change to match loaded model
OPENAI_API_KEY=localhost            # Or your API key if using cloud provider

# TTS — edge-tts server config
TTS_HOST=127.0.0.1
TTS_PORT=8765
TTS_VOICE=en-GB-SoniaNeural        # Calm UK female voice
```

To change the LLM model, edit `OPENAI_MODEL` in `.env`. To change the TTS voice, see [Available Voices](#available-tts-voices).

### 3. Start LM Studio

1. Open LM Studio
2. Load your preferred model (e.g., `gemma-4-31b-it`, `qwen3.6-27b-mtp`)
3. Go to the **Local Server** tab
4. Ensure it's serving on `localhost:1234` with OpenAI-compatible endpoint enabled

## Running the App

Start all three services in separate terminal windows:

```powershell
# Terminal 1 — edge-tts server (must start first)
python server/tts_server.py

# Terminal 2 — Express backend
node server/index.js

# Terminal 3 — React frontend (Vite dev server)
cd client
npm run dev
```

Or use the convenience script (starts backend + frontend, but NOT TTS):

```powershell
npm run dev
```

### Service URLs

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend | `http://localhost:3000` | React app (Vite proxy forwards `/api/*` to backend) |
| Backend | `http://localhost:3001` | Express API server |
| TTS Server | `http://127.0.0.1:8765` | edge-tts Python HTTP server |

### Health Check

```powershell
curl http://localhost:3001/health
# Expected: {"status":"ok"}
```

## Testing

### Manual Triage Flow Test

1. Open `http://localhost:3000` in a browser
2. Create or enter your passphrase on the lock screen
3. Follow Mabel's conversation flow:
   - Describe how you're feeling
   - Answer follow-up questions about duration and severity
   - When asked to rate distress (1-10), use the emoji scale or type a number

### Testing Crisis Detection

Send a message containing crisis keywords like `I want to end my life` — the CrisisOverlay should appear with Samaritans (116 123) and MIND (0808 808 1111) contact info.

### Testing EFT Auto-Play

1. Rate your distress as **5-8** (moderate range)
2. Accept Mabel's offer for an EFT tapping session
3. The pause button (⏸️) should appear in the header
4. Mabel will auto-advance through tapping points every 12 seconds with spoken guidance

### Testing TTS Voice

1. Ensure `python server/tts_server.py` is running
2. Send any message and observe:
   - Avatar pulses green while speaking
   - Header shows "Speaking..." status
   - Audio plays through default speaker
3. Toggle mute with the 🔊/🔇 button in header

### Testing Encryption + Persistence

1. Have a conversation with Mabel
2. Click 🔒 to lock (or wait 10 minutes for auto-lock)
3. Refresh the page — you should see the lock screen
4. Enter your passphrase — conversation history should restore exactly

### API Endpoint Tests

Test endpoints directly from PowerShell:

```powershell
# Chat endpoint
$body = @{ messages = @( @{ role="user"; content="I've been feeling stressed" } ) } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3001/api/chat" -Method POST -ContentType "application/json" -Body $body

# TTS endpoint (returns audio blob)
$body = @{ text = "Hello, I'm Mabel."; calm = $false } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3001/api/tts" -Method POST -ContentType "application/json" -Body $body

# Health check
Invoke-RestMethod -Uri "http://localhost:3001/health"
```

## Configuration Reference

### LLM Settings (`server/llm.js`)

| Setting | Location | Default | Purpose |
|---------|----------|---------|---------|
| System prompt | `SYSTEM_PROMPT` constant | — | Mabel's personality and guardrails |
| Model name | `.env OPENAI_MODEL` | `gemma-4-31b-it` | Must match LM Studio loaded model |
| Temperature | line 57 | `0.2` | Response creativity (lower = more consistent) |
| Max tokens | line 58 | `32768` | Max response length |

### TTS Settings (`server/tts.js`, `.env`)

| Setting | Location | Default | Purpose |
|---------|----------|---------|---------|
| TTS_HOST | `.env` | `127.0.0.1` | edge-tts server hostname |
| TTS_PORT | `.env` | `8765` | edge-tts server port |
| TTS_VOICE | `.env` | `en-GB-SoniaNeural` | Voice ID (calm UK female) |

### Crisis Keywords (`server/triage.js`)

The `crisisKeywords` array contains case-insensitive triggers. When matched, the frontend shows the crisis overlay with UK helpline numbers. Edit this file to add or remove keywords.

## Available TTS Voices

List all available voices:

```powershell
edge-tts --list-voices
```

Recommended for Mabel (calm UK female):

| Voice ID | Description |
|----------|-------------|
| `en-GB-SoniaNeural` | Warm, calm — default choice |
| `en-GB-AdaNeural` | Soft, gentle |
| `en-GB-RyanNeural` | Male alternative |

Change voice in `.env`:

```ini
TTS_VOICE=en-GB-AdaNeural
```

## Triage Flow

```
Greeting → "What's been on your mind?"
  ↓ User describes issue
  ↓ Mabel asks duration + supportive conversation (5+ exchanges)
  ↓ Asks distress rating 1-10
  ↓ Branch:
      CRITICAL (9-10 or self-harm keywords)
        → CrisisOverlay with Samaritans/MIND/SHOUT
        → No EFT/hypnotherapy offered

      MODERATE (5-8)
        → Guided EFT tapping session (~5 min, 9 points)
        → Auto-play with spoken guidance

      MILD (1-4)
        → Breathing exercise or hypnotherapy relaxation
```

## Crisis Resources (UK)

| Service | Contact |
|---------|---------|
| Samaritans | 116 123 |
| MIND In Crisis | 0808 808 1111 |
| Text SHOUT | 85258 |

## Troubleshooting

### Port already in use

```powershell
# Kill all existing processes
Get-Process -Name "node","python" -ErrorAction SilentlyContinue | Stop-Process -Force
```

### TTS returns error or no audio

1. Verify `python server/tts_server.py` is running and printed `edge-tts server running on 127.0.0.1:8765`
2. Check `.env` has correct `TTS_HOST` and `TTS_PORT` values
3. Test directly: `curl http://127.0.0.1:8765/tts -d '{"text":"test"}' -H "Content-Type: application/json"`

### LLM returns empty or garbled response

1. Verify LM Studio is running and model is loaded
2. Check `OPENAI_MODEL` in `.env` matches the loaded model name exactly
3. Test LM Studio directly: `curl http://localhost:1234/v1/models`

### Browser shows "TTS service unavailable"

The Express server can't reach the Python TTS server. Ensure both are running and check that no firewall is blocking `127.0.0.1:8765`.

## Security Notes

- **Zero server-side data exposure** — all messages are encrypted client-side with AES-256-GCM before localStorage
- **No database** — no persistent server storage of any kind
- **No server-side keys** — encryption key is derived from user passphrase via PBKDF2 (100k iterations) in the browser only
- **`.env` must never be committed** — it's listed in `.gitignore`

## Disclaimer

Mabel is not a substitute for professional mental health care. This application provides early intervention support and guided exercises while users wait for a therapist appointment. In case of emergency, always contact local crisis services immediately.
