import os
import base64
import logging
from io import BytesIO

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from PIL import Image
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Configure Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
if GEMINI_API_KEY and GEMINI_API_KEY != "your_key_here":
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    logger.info(f"Gemini configured successfully (model: {GEMINI_MODEL})")
else:
    gemini_client = None
    logger.warning("GEMINI_API_KEY not set — Gemini will not work")

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")  # Rachel default

SYSTEM_PROMPT = """You are BlindSpot, an AI assistant helping a visually impaired person find a lost item.
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
Speak naturally as if guiding a friend."""


class AnalyzeRequest(BaseModel):
    image: str   # base64-encoded image (data URL or raw base64)
    query: str


class SpeakRequest(BaseModel):
    text: str


@app.get("/")
async def serve_index():
    return FileResponse("static/index.html")


@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    if not gemini_client:
        raise HTTPException(status_code=503, detail="Gemini API key not configured")

    try:
        # Strip data URL prefix if present
        image_data = req.image
        if "," in image_data:
            image_data = image_data.split(",", 1)[1]

        image_bytes = base64.b64decode(image_data)
        image = Image.open(BytesIO(image_bytes)).convert("RGB")

        logger.info(f"Analyzing image for query: {req.query!r}")

        # Convert PIL image to bytes for the new SDK
        img_buffer = BytesIO()
        image.save(img_buffer, format="JPEG")
        img_bytes = img_buffer.getvalue()

        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[
                types.Content(parts=[
                    types.Part(text=SYSTEM_PROMPT),
                    types.Part(
                        inline_data=types.Blob(
                            mime_type="image/jpeg",
                            data=img_bytes,
                        )
                    ),
                    types.Part(text=f"The user is looking for: {req.query}"),
                ])
            ],
        )

        guidance = response.text.strip()
        logger.info(f"Gemini response: {guidance!r}")
        return {"guidance": guidance}

    except Exception as e:
        logger.error(f"Gemini error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/speak")
async def speak(req: SpeakRequest):
    if not ELEVENLABS_API_KEY or ELEVENLABS_API_KEY == "your_key_here":
        raise HTTPException(status_code=503, detail="ElevenLabs API key not configured")

    try:
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}"
        headers = {
            "xi-api-key": ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
        }
        payload = {
            "text": req.text,
            "model_id": "eleven_turbo_v2",
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()

        logger.info("ElevenLabs TTS succeeded")
        return Response(content=response.content, media_type="audio/mpeg")

    except httpx.HTTPStatusError as e:
        logger.error(f"ElevenLabs HTTP error {e.response.status_code}: {e.response.text}")
        raise HTTPException(status_code=502, detail=f"ElevenLabs error: {e.response.status_code}")
    except Exception as e:
        logger.error(f"ElevenLabs error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Serve static files (after routes so / is handled above)
app.mount("/static", StaticFiles(directory="static"), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
