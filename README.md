# BlindSpot — AI-Powered Item Finder for the Visually Impaired

**HenHacks 2026 · University of Delaware**

🏆 **Winner — Best Community Impact Award, Rutgers Raptor Rise Pitch Competition**

BlindSpot helps visually impaired people find lost or dropped items using their phone camera and AI. Point the camera, say what you're looking for, and BlindSpot guides you to it with natural voice directions — no human intermediary, no privacy risk.

---

## The Problem

When a visually impaired person drops something, their current options are:
- Call a sighted friend or family member
- Use apps like Be My Eyes — which connects them to a **live stranger** who sees through their camera

Both options require trusting another person with a live view of their private space — their home, their documents, their medications, their personal life.

## The Solution

BlindSpot replaces the human with AI. It sees what the camera sees, locates the item, and speaks directions in plain language:

> *"I can see your keys on the floor, about 3 feet ahead at your 2 o'clock, right next to the chair leg."*

Designed for **Meta smart glasses** — always on, always private, always ready.

---

## Features

- **Wake word activation** — say "Hey BlindSpot" to trigger hands-free, no button press needed
- **AI vision guidance** — Google Gemini analyzes the camera frame and gives spatial directions (clock positions, distances, reference objects)
- **Natural voice output** — ElevenLabs TTS with Web Speech API fallback
- **Continuous scan mode** — auto-captures every 5 seconds for step-by-step guidance as you move
- **Privacy protection** — AI never reads documents, screens, IDs, or cards in the frame; shows a live alert when sensitive items are detected
- **Mobile-first** — designed for phone camera, works in browser with no app install

---

## Demo Flow

1. Open the app and allow microphone access
2. Tap anywhere once to enable audio (iOS requirement)
3. Say **"Hey BlindSpot, where are my keys?"**
4. The AI scans the frame and speaks directions
5. Follow the guidance — it re-listens automatically after each response

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML + CSS + JS |
| Backend | Python + FastAPI |
| Vision AI | Google Gemini 2.5 Flash |
| Voice Output | ElevenLabs TTS (`eleven_turbo_v2`) |
| Fallback TTS | Browser Web Speech API |
| Speech Input | Web Speech API (SpeechRecognition) |

---

## Running Locally

**Prerequisites:** Python 3.10+, API keys for Gemini and ElevenLabs

```bash
# Clone and set up
git clone https://github.com/jawaadjariwala/BlindSpot.git
cd BlindSpot

python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Add your API keys
cp .env.example .env
# Edit .env with your keys

# Run
python server.py
```

Open `http://localhost:8000` in your browser.

**For mobile access** (required for camera on iOS), expose via HTTPS tunnel:

```bash
brew install cloudflare/cloudflare/cloudflared
cloudflared tunnel --url http://localhost:8000
```

---

## Environment Variables

```
GEMINI_API_KEY=your_gemini_key
ELEVENLABS_API_KEY=your_elevenlabs_key
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
GEMINI_MODEL=gemini-2.5-flash
```

---

## Privacy Architecture

BlindSpot's system prompt instructs Gemini to:
- **Never read, describe, or repeat** any text visible in the frame
- Detect sensitive items (credit cards, IDs, passports, documents, prescriptions, screens) and flag them by **category only** — never by content
- Show a live **Privacy Alert** banner and speak a warning when sensitive items are in frame

This is enforced at the prompt level on every single API call, not as an afterthought.

---

## Recognition

- 🏆 **Best Community Impact Award** — Rutgers Raptor Rise Pitch Competition
- Built for HenHacks 2026 at the University of Delaware

## Hackathon Categories

- **Community Wellness & Social Connections** — assistive tech for independence and quality of life
- **Security & Safety** — privacy-preserving alternative to human-assisted camera services
- **Best Use of Gemini API**
- **Best Use of ElevenLabs**

---

## Built By

Jawaad Jariwala — HenHacks 2026
