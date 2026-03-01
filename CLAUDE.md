# CLAUDE.md — BlindSpot

## Project Overview

**BlindSpot** is an AI-powered assistive tool for visually impaired people that helps them locate lost or dropped items using their phone camera (designed for Meta smart glasses). The user tells the AI what they're looking for, the camera captures snapshots of the environment, and the AI provides real-time voice guidance to help them find the item — all without any human intermediary, protecting the user's privacy.

**Hackathon:** HenHacks 2026 — University of Delaware (Feb 28 – Mar 1)
**Team:** Solo developer
**Time constraint:** ~5 hours remaining — speed and simplicity are critical
**Categories:**
- Main 1: Community Wellness & Social Connections (assistive tech for independence & quality of life)
- Main 2: Security & Safety (privacy-preserving alternative to human-assisted services)
- Mini: Best Use of Gemini API
- Mini: Best Use of ElevenLabs

---

## Agent Instructions

### 1. Speed Over Perfection
- This is a hackathon with hours left. Ship working features, not perfect code.
- Do NOT over-engineer. No unnecessary abstractions, no premature optimization.
- If something works, move on. Polish only if there's time at the end.

### 2. Plan Before Building
- Before writing code for any feature, briefly state what you're about to do and why.
- If a task has 3+ steps, outline them first.
- If something breaks, STOP — diagnose the root cause before trying fixes.

### 3. Verification Before Done
- Never call a feature complete without testing it.
- Run the server, check for errors, confirm the feature works end-to-end.
- Ask: "Can I demo this to judges right now?" If no, it's not done.

### 4. Simplicity First
- Minimal dependencies. Minimal files. Minimal complexity.
- Every line of code should earn its place.
- Use vanilla HTML/CSS/JS on the frontend — no frameworks.
- Use Python + FastAPI on the backend — no unnecessary middleware.

### 5. Error Handling
- Read the full error message before attempting a fix.
- If an API call fails, check: API key? Rate limit? Wrong endpoint? Payload format?
- If using paid API credits, flag it before running expensive calls.
- Never silently swallow errors — always log them.

### 6. File Discipline
- Keep the project flat and simple. No deeply nested folders.
- API keys go in `.env` — NEVER hardcode them, NEVER commit them.
- `.gitignore` must include `.env` from the start.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Vanilla HTML + CSS + JS | Zero build steps, camera API works natively, fastest to develop |
| Backend | Python + FastAPI | Lightweight, async, easy API integration |
| Vision AI | Google Gemini 2.0 Flash (via Google AI Studio) | Free API key, excellent vision capabilities, fast inference |
| Voice Output | ElevenLabs TTS API | Natural human-like voice, MLH mini category |
| Fallback TTS | Browser Web Speech API | Free, no API key needed, works offline |

---

## Architecture

```
[Phone Camera / Browser] 
    → captures snapshot (periodic or on-command)
    → sends base64 image + user query to backend

[FastAPI Backend]
    → receives image + query
    → builds privacy-aware prompt
    → sends to Gemini Vision API
    → receives text guidance
    → sends text to ElevenLabs TTS API
    → returns audio + text to frontend

[Frontend]
    → plays voice guidance
    → displays text response
    → shows privacy indicator (text/docs detected & ignored)
```

---

## File Structure

```
blindspot/
├── CLAUDE.md              # This file
├── README.md              # Project description for GitHub/judges
├── .env                   # API keys (gitignored)
├── .gitignore             # Ignore .env, __pycache__, etc.
├── requirements.txt       # Python dependencies
├── server.py              # FastAPI backend (single file)
├── static/                # Frontend files served by FastAPI
│   ├── index.html         # Main UI
│   ├── style.css          # Styling
│   ├── app.js             # Camera, API calls, audio playback
│   └── assets/            # Logo, icons if needed
└── tasks/
    └── todo.md            # Build checklist
```

---

## Core Features (Priority Order)

### P0 — Must Have for Demo (Build These First)
1. **Camera capture** — Access phone/laptop camera via browser, take snapshots on button press or periodic interval (every 3-5 seconds)
2. **Gemini Vision integration** — Send snapshot + user query ("I dropped my keys") to Gemini, receive spatial guidance text
3. **Voice output** — Convert Gemini response to speech via ElevenLabs (or fallback to Web Speech API)
4. **Conversational flow** — User can speak or type what they're looking for, AI responds with directional guidance ("The keys are about 2 feet to your left, near the chair leg"), user can ask follow-ups
5. **Privacy filtering** — Prompt Gemini to explicitly ignore and never read out any text visible in the frame (documents, screens, cards, letters). Show a visual indicator on the UI: "🔒 Privacy Mode Active — Text & documents ignored"

### P1 — Must Also Build (Required for Demo)
6. **Speech-to-text input** — User speaks their query using Web Speech API (browser built-in), making it fully hands-free. This is critical for the blind user narrative — they can't type.
7. **Continuous guidance mode** — After user says what they're looking for, snapshots auto-capture every 3-5 seconds with ongoing guidance ("Getting warmer... turn slightly right... almost there!"). This lines up naturally with the ~3-5 second API response time.
8. **Privacy demo mode** — A special toggle that shows a split view: the raw camera frame on one side and a visualization of what the AI "sees" on the other (with detected text areas highlighted and marked as IGNORED). This is a killer demo feature for judges and critical for the Security & Safety category.

> **NOTE:** There are no stretch goals. P0 and P1 are the complete scope. Build all 8 features. Nothing else.

---

## API Integration Details

### Gemini Vision API
- **Endpoint:** Use `google.generativeai` Python SDK
- **Model:** `gemini-2.0-flash` (fast, free tier available)
- **How to call:**
```python
import google.generativeai as genai
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel("gemini-2.0-flash")

response = model.generate_content([
    system_prompt,  # Privacy-aware instructions
    image,          # PIL Image from base64
    user_query      # "I dropped my keys, help me find them"
])
```

- **System prompt (critical — this is the core of BlindSpot):**
```
You are BlindSpot, an AI assistant helping a visually impaired person find a lost item. 
The user is wearing smart glasses (or holding a phone camera). You are seeing what their camera sees.

Your job:
1. Look at the image and try to locate the item the user described.
2. If you see the item: Give clear, spatial directions relative to the camera's perspective. 
   Use clock positions (e.g., "at your 2 o'clock"), distance estimates, and reference nearby objects.
   Example: "I can see your keys on the floor, about 3 feet ahead at your 2 o'clock, right next to the table leg."
3. If you don't see the item: Guide the user to look in a different direction.
   Example: "I don't see the keys in this view. Try turning slowly to your right so I can scan more of the room."
4. Give step-by-step guidance if the user needs to walk toward the item.
   Example: "Take about 3 small steps forward, then reach down to your left."

CRITICAL PRIVACY RULES:
- NEVER read, mention, or describe any text visible in the image (documents, screens, mail, cards, labels, etc.)
- NEVER describe the content of any screens, monitors, or papers
- If you see text or documents, completely ignore them as if they don't exist
- Only focus on physical objects and spatial layout
- Treat all text in the environment as invisible

Keep responses concise (2-3 sentences max). Be warm, patient, and encouraging.
Speak naturally as if guiding a friend.
```

### ElevenLabs TTS API
- **Endpoint:** `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`
- **Voice:** Use a warm, clear voice (Rachel or similar default voice)
- **How to call:**
```python
import httpx

async def text_to_speech(text: str) -> bytes:
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}"
    headers = {"xi-api-key": os.getenv("ELEVENLABS_API_KEY")}
    payload = {
        "text": text,
        "model_id": "eleven_turbo_v2",
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers=headers)
        return response.content  # MP3 audio bytes
```

### Fallback: Web Speech API (Browser TTS)
- If ElevenLabs is unavailable or rate-limited, fall back to browser's built-in `speechSynthesis`
- Implementation is frontend-only, no API key needed:
```javascript
function speak(text) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    speechSynthesis.speak(utterance);
}
```

---

## UI Design Guidelines

### Layout
- **Dark theme** — easier on the eyes, looks professional for demo
- **Large, accessible buttons** — this is an accessibility app, practice what you preach
- **Minimal UI** — camera feed takes center stage
- **Status bar** at top: "🔒 Privacy Mode Active" indicator
- **Bottom panel**: text input (or voice button), and the latest AI response in large text

### Mobile-First
- Design for phone screen (that's the demo device)
- Camera viewfinder should be fullscreen or near-fullscreen
- Controls at the bottom (thumb-reachable)
- Touch-friendly — large tap targets (min 48px)

### Color Palette
- Background: `#1a1a2e` (dark navy)
- Primary accent: `#00d4ff` (bright cyan — accessibility/tech feel)
- Text: `#ffffff` 
- Privacy indicator: `#00ff88` (green for "safe")
- Warning/alert: `#ff6b6b`

### Accessibility
- High contrast throughout
- Large font sizes (min 16px body, 20px+ for AI responses)
- All interactive elements labeled with ARIA attributes
- Screen reader compatible (ironic but important — show judges you understand accessibility)

---

## Demo Flow (2:30 presentation)

### 0:00 - 0:20 — The Problem
"Every day, visually impaired people drop things and can't find them. Current solutions require calling a stranger who sees through your camera — a massive privacy risk. They can see your documents, your medications, your personal life."

### 0:20 - 0:45 — The Solution
"BlindSpot replaces the human with AI. Designed for Meta smart glasses, it uses AI vision to locate your lost items and guide you to them with voice — and it never reads your private information."

### 0:45 - 1:45 — Live Demo
1. Show the app on phone
2. Place an item (keys, phone, wallet) on the ground
3. Say/type "I dropped my keys"
4. Show the AI analyzing and giving voice directions
5. Follow the directions to pick up the item
6. (If privacy demo is built) Show that a document in frame is ignored

### 1:45 - 2:15 — Technical & Category Fit
- Briefly mention: Gemini Vision API, ElevenLabs, privacy-first architecture
- Community Wellness: Independence for visually impaired people
- Security & Safety: Eliminates human privacy breach in existing solutions

### 2:15 - 2:30 — Vision
"Today it's a phone demo. Tomorrow it's built into Meta smart glasses — always on, always private, always ready to help."

---

## Build Checklist

### Phase 1: Skeleton (45 min)
- [ ] Initialize project structure (all files/folders)
- [ ] Set up FastAPI server with static file serving
- [ ] Create basic HTML page with camera access
- [ ] Verify camera works in browser on phone

### Phase 2: Core AI (60 min)
- [ ] Implement Gemini Vision API integration in server.py
- [ ] Create the privacy-aware system prompt
- [ ] Build the /analyze endpoint (receives base64 image + query, returns guidance text)
- [ ] Test with a sample image — verify AI responds with spatial directions

### Phase 3: Voice Output (30 min)
- [ ] Implement ElevenLabs TTS integration (or Web Speech API fallback)
- [ ] Build the /speak endpoint (receives text, returns audio)
- [ ] Frontend plays audio response automatically
- [ ] Test end-to-end: snapshot → AI analysis → voice plays

### Phase 4: Full Flow (30 min)
- [ ] Connect all pieces: camera → snapshot → backend → AI → voice → display
- [ ] Add text/voice input for user query
- [ ] Add periodic snapshot mode (every 3-5 seconds during active search)
- [ ] Test complete flow on phone

### Phase 5: Polish & Privacy (30 min)
- [ ] Add privacy mode indicator to UI
- [ ] Style the UI (dark theme, large buttons, mobile-first)
- [ ] Add loading states and error handling
- [ ] Test privacy: place a document in frame, verify AI ignores it

### Phase 6: Demo Prep (30 min)
- [ ] Write README.md for GitHub submission
- [ ] Test demo flow end-to-end multiple times
- [ ] Prepare backup plan (if API fails during demo, have a recorded backup)
- [ ] Final commit and push

---

## Environment Variables (.env)

```
GEMINI_API_KEY=your_key_here
ELEVENLABS_API_KEY=your_key_here
ELEVENLABS_VOICE_ID=your_voice_id_here
```

---

## Dependencies (requirements.txt)

```
fastapi
uvicorn[standard]
python-dotenv
google-generativeai
httpx
Pillow
python-multipart
```

---

## Important Reminders
- **NEVER commit .env to git**
- **Test on phone browser** — that's the demo device
- **Keep Gemini prompts concise** — long prompts = slow responses
- **ElevenLabs free tier has limits** — use Web Speech API during development, save ElevenLabs for demo
- **If something breaks during demo** — have the Web Speech API fallback ready, it needs zero API keys
- **The judges care about impact and passion** — the tech just needs to work, it doesn't need to be complex
