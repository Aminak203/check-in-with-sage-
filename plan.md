# TalkToMabel — Project Plan

## 1. Overview
WhatsApp-style conversational mental health app for corporate employees. An AI assistant named "Mabel" triages employees experiencing mental health struggles and delivers guided EFT tapping and hypnotherapy exercises to prevent decline while they wait for a therapist appointment.

## 2. Tech Stack
| Layer | Choice |
|-------|--------|
| Frontend | React 18 + Vite |
| Styling | Tailwind CSS (via CDN for quick demo) |
| Backend | Node.js + Express |
| LLM | MedGemma-1.5-4b via `http://localhost:1234/v1` (OpenAI-compatible) |
| State | In-memory only (no persistence) |
| Package manager | npm |

## 3. Directory Structure
```
TalktoMabel/
├── server/
│   ├── index.js              # Express server + API routes
│   ├── llm.js                # OpenAI client wrapper + system prompt
│   └── triage.js             # Crisis keyword detection
├── client/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx           # Main app component
│       └── components/
│           ├── ChatWindow.jsx       # WhatsApp-style container
│           ├── MessageBubble.jsx    # Message bubbles (user/bot)
│           ├── InputBar.jsx         # Text input + send button
│           └── CrisisOverlay.jsx    # Crisis modal (Samaritans/MIND)
├── .env.example              # API config template
└── package.json              # Root workspace scripts
```

## 4. Triage Flow
```
Greeting → "What's been on your mind lately?"
    → User describes issue
    → Mabel assesses severity (asks for 0-10 scale, duration)
    → Branch decision (Mabel decides):
        ┌─────────────────────────────────────────────────────┐
        │ CRITICAL (8-10 + crisis keywords)                  │
        │ → CrisisOverlay with Samaritans (116 123)          │
        │   and MIND (0808 808 1111)                         │
        ├─────────────────────────────────────────────────────┤
        │ MODERATE (5-7)                                     │
        │ → Offer guided EFT tapping session                 │
        ├─────────────────────────────────────────────────────┤
        │ MILD (1-4)                                         │
        │ → Offer breathing / guided hypnotherapy            │
        └─────────────────────────────────────────────────────┘
    → Post-session check-in → Loop or close
```

## 5. System Prompt (Initial Draft)
Mabel is a compassionate mental health first-aid assistant for employees. Key behaviors:
- **Role:** Supportive triage assistant, NOT a therapist
- **Tone:** Warm, conversational, WhatsApp-length messages (2-3 sentences max)
- **Triage:** Assess symptoms, severity (0-10 scale), and duration before recommending tools
- **EFT guidance:** Walk user through all 5 steps — identify issue, rate intensity, setup phrase, guide through 9 tapping points (side of hand → eyebrow → side of eye → under eye → under nose → chin → collarbone → under arm → top of head), re-rate intensity
- **Hypnotherapy:** Deliver progressive relaxation, safe-place visualization, and breathing exercises conversationally
- **Crisis detection:** If user mentions self-harm, suicide, or severe distress → instruct them to contact Samaritans (116 123) or MIND (0808 808 1111), and return `{"crisis": true}` flag
- **Guardrails:** Never diagnose, never prescribe, always remind user that Mabel is not a substitute for professional care

## 6. Crisis Detection (`server/triage.js`)
Server-side keyword/phrase detection that runs in parallel with LLM response:
- Keywords: `suicide`, `self-harm`, `end my life`, `don't want to live`, `hurt myself`, etc.
- If triggered → frontend shows `CrisisOverlay` with UK resources
- Crisis resources:
  - **Samaritans:** 116 123
  - **MIND In Crisis:** 0808 808 1111
  - **Text SHOUT to 85258**

## 7. API Endpoints
| Endpoint | Method | Body | Response |
|----------|--------|------|----------|
| `/api/chat` | POST | `{ messages: [...] }` | `{ reply: string, crisis: boolean }` |

## 8. EFT Tapping Points (Reference)
1. Side of hand (karate chop) — small intestine meridian
2. Top of head — governing vessel
3. Eyebrow — bladder meridian
4. Side of eye — gallbladder meridian
5. Under the eye — stomach meridian
6. Under the nose — governing vessel
7. Chin — central vessel
8. Beginning of collarbone — kidney meridian
9. Under the arm — spleen meridian

## 9. Development Phases
| Phase | Deliverable |
|-------|-------------|
| 1 | Project scaffolding + Express server + OpenAI client wired to MedGemma |
| 2 | React frontend + WhatsApp-style chat UI |
| 3 | System prompt + triage logic + crisis detection |
| 4 | EFT tapping guidance refinement in system prompt |
| 5 | Hypnotherapy scripts + crisis overlay UI |
| 6 | Polish + testing |
