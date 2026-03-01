// ── State ──────────────────────────────────────────────────────────────────
let stream = null;
let facingMode = "environment";   // start with back camera
let continuousTimer = null;
let isAnalyzing = false;
let currentQuery = "";

// ── DOM refs ───────────────────────────────────────────────────────────────
const video               = document.getElementById("camera");
const canvas              = document.getElementById("snapshot-canvas");
const responseText        = document.getElementById("response-text");
const statusIndicator     = document.getElementById("status-indicator");
const queryInput          = document.getElementById("query-input");
const micBtn              = document.getElementById("mic-btn");
const snapBtn             = document.getElementById("snap-btn");
const continuousBtn       = document.getElementById("continuous-btn");
const cameraSwitchBtn     = document.getElementById("camera-switch-btn");
const scanningOverlay     = document.getElementById("scanning-overlay");
const privacyAlert        = document.getElementById("privacy-alert");
const privacyAlertDetail  = document.getElementById("privacy-alert-detail");
const privacyAlertDismiss = document.getElementById("privacy-alert-dismiss");
const wakeIndicator       = document.getElementById("wake-indicator");
const wakeLabel           = document.getElementById("wake-label");

// ── iOS Audio unlock ───────────────────────────────────────────────────────
// iOS blocks audio unless .play() is called on the SAME element that was
// touched during a user gesture. We create one element at startup and
// "unlock" it synchronously on every tap before any await.
const audioEl = new Audio();
audioEl.preload = "auto";
let audioUnlocked = false;

// Tiny 1-frame silent WAV — plays instantly, unlocks the element
const SILENT_WAV = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

function unlockAudio() {
  if (audioUnlocked) return;
  audioEl.src = SILENT_WAV;
  audioEl.volume = 0;
  audioEl.play().then(() => {
    audioEl.pause();
    audioEl.volume = 1;
    audioEl.src = "";
    audioUnlocked = true;
  }).catch(() => {
    // Unlock failed silently — will retry on next tap
  });

  // Also warm up speechSynthesis for the fallback path
  if (window.speechSynthesis) {
    const dummy = new SpeechSynthesisUtterance("");
    dummy.volume = 0;
    speechSynthesis.speak(dummy);
    speechSynthesis.cancel();
  }
}

// Unlock audio on any first tap anywhere — catches wake-word-only users
document.addEventListener("click", () => unlockAudio(), { once: true });

// ── Camera ─────────────────────────────────────────────────────────────────
async function startCamera() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    setStatus("Camera ready.");
  } catch (err) {
    setStatus("⚠️ Camera error: " + err.message);
    console.error("Camera error:", err);
  }
}

function captureSnapshot() {
  const w = video.videoWidth  || 640;
  const h = video.videoHeight || 480;
  canvas.width  = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(video, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.85);
}

// ── Analysis ───────────────────────────────────────────────────────────────
async function analyzeSnapshot(query) {
  if (isAnalyzing) return;
  if (!query.trim()) {
    setResponse("Please tell me what you're looking for first.");
    return;
  }

  isAnalyzing = true;
  currentQuery = query.trim();
  setStatus("Analyzing…");
  snapBtn.disabled = true;

  const dataUrl = captureSnapshot();

  try {
    const res = await fetch("/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataUrl, query: currentQuery }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || res.statusText);
    }

    const data = await res.json();
    const guidance        = data.guidance;
    const privacyDetected = data.privacy_detected || false;
    const privacyType     = data.privacy_type || "sensitive item";

    // Privacy warning takes priority — speak it first, then guidance
    if (privacyDetected) {
      showPrivacyAlert(privacyType);
      const warning = `Privacy alert: ${privacyType} detected in frame. Content has been ignored for your privacy. You may want to move it out of view.`;
      await speakText(warning);
    } else {
      hidePrivacyAlert();
    }

    setResponse(guidance);
    setStatus("✓ Analysis complete");
    await speakText(guidance);

  } catch (err) {
    console.error("Analyze error:", err);
    const msg = "Sorry, I had trouble analyzing that. " + err.message;
    setResponse(msg);
    setStatus("⚠️ Error — see console");
    speakFallback(msg);
  } finally {
    isAnalyzing = false;
    snapBtn.disabled = false;
    // Restart wake word if it went quiet during analysis
    if (!wakeListening && !micBtn.classList.contains("listening")) {
      setTimeout(startWakeWordListening, 800);
    }
  }
}

// ── Voice output ───────────────────────────────────────────────────────────
// Both paths return a Promise that resolves only when audio FINISHES,
// so sequential awaits play warning → then guidance without overlap.
async function speakText(text) {
  // Try ElevenLabs first
  try {
    const res = await fetch("/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (res.ok) {
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);

      if (audioEl._blobUrl) {
        URL.revokeObjectURL(audioEl._blobUrl);
        audioEl._blobUrl = null;
      }
      audioEl._blobUrl = url;
      audioEl.src = url;
      audioEl.volume = 1;

      // Wait until playback ENDS, not just starts
      await new Promise((resolve) => {
        audioEl.onended = () => {
          URL.revokeObjectURL(url);
          audioEl._blobUrl = null;
          resolve();
        };
        audioEl.onerror = () => resolve();
        audioEl.play().catch(resolve);
      });
      return;
    }
    console.warn("ElevenLabs unavailable, using browser TTS");
  } catch (err) {
    console.warn("ElevenLabs failed, using browser TTS:", err.message);
  }

  await speakFallback(text);
}

async function speakFallback(text) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();

  await new Promise((resolve) => {
    const utterance    = new SpeechSynthesisUtterance(text);
    utterance.rate     = 0.92;
    utterance.pitch    = 1.0;
    utterance.onend    = resolve;   // resolves when speech FINISHES
    utterance.onerror  = resolve;
    const voices = speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.lang.startsWith("en") && (v.name.includes("Samantha") || v.name.includes("Google") || v.name.includes("Natural"))
    );
    if (preferred) utterance.voice = preferred;
    speechSynthesis.speak(utterance);
  });
}

// ── Speech-to-text input ───────────────────────────────────────────────────
let recognition = null;

function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    micBtn.title = "Speech recognition not supported in this browser";
    micBtn.disabled = true;
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous    = false;
  recognition.interimResults= false;
  recognition.lang          = "en-US";

  recognition.onstart = () => {
    micBtn.classList.add("listening");
    micBtn.setAttribute("aria-label", "Listening… tap again to stop");
    setStatus("Listening…");
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    queryInput.value = transcript;
    setStatus(`Heard: "${transcript}"`);
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    setStatus("⚠️ Mic error: " + event.error);
    micBtn.classList.remove("listening");
  };

  recognition.onend = () => {
    micBtn.classList.remove("listening");
    micBtn.setAttribute("aria-label", "Use microphone to speak your query");
    const q = queryInput.value.trim();
    if (q) {
      analyzeSnapshot(q); // finally block will restart wake word
    } else {
      // No query captured — restart wake word immediately
      startWakeWordListening();
    }
  };
}

// ── Button handlers (unlock audio FIRST, synchronously, before any await) ──
micBtn.addEventListener("click", () => {
  unlockAudio();                           // sync — must be before any await
  if (!recognition) return;
  if (micBtn.classList.contains("listening")) {
    recognition.stop();
  } else {
    stopWakeWordListening();               // pause wake word while manual mic is active
    recognition.start();
  }
});

snapBtn.addEventListener("click", () => {
  unlockAudio();                           // sync unlock before the async fetch
  analyzeSnapshot(queryInput.value.trim());
});

continuousBtn.addEventListener("click", () => {
  unlockAudio();
  if (continuousTimer) {
    stopContinuous();
  } else {
    startContinuous();
  }
});

queryInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") analyzeSnapshot(queryInput.value.trim());
});

cameraSwitchBtn.addEventListener("click", async () => {
  facingMode = facingMode === "environment" ? "user" : "environment";
  await startCamera();
});

// ── Continuous scanning ────────────────────────────────────────────────────
function startContinuous() {
  const query = queryInput.value.trim();
  if (!query) {
    setResponse("Please enter what you're looking for before starting continuous scan.");
    return;
  }
  continuousBtn.textContent = "⏹ Stop Scanning";
  continuousBtn.classList.add("active");
  continuousBtn.setAttribute("aria-label", "Stop continuous scanning");
  scanningOverlay.classList.remove("hidden");

  analyzeSnapshot(query);
  continuousTimer = setInterval(() => analyzeSnapshot(query), 5000);
}

function stopContinuous() {
  clearInterval(continuousTimer);
  continuousTimer = null;
  continuousBtn.textContent = "🔄 Start Scanning";
  continuousBtn.classList.remove("active");
  continuousBtn.setAttribute("aria-label", "Start continuous scanning mode");
  scanningOverlay.classList.add("hidden");
  setStatus("Scanning stopped.");
}

// ── Privacy alert ──────────────────────────────────────────────────────────
let privacyAlertTimer = null;

function showPrivacyAlert(privacyType) {
  const label = privacyType
    ? privacyType.charAt(0).toUpperCase() + privacyType.slice(1) + " detected — content ignored for your privacy"
    : "Sensitive item detected — content ignored for your privacy";
  privacyAlertDetail.textContent = label;
  privacyAlert.classList.remove("hidden");

  // Auto-dismiss after 10 seconds
  clearTimeout(privacyAlertTimer);
  privacyAlertTimer = setTimeout(hidePrivacyAlert, 10000);
}

function hidePrivacyAlert() {
  clearTimeout(privacyAlertTimer);
  privacyAlert.classList.add("hidden");
}

privacyAlertDismiss.addEventListener("click", hidePrivacyAlert);

// ── Wake Word Engine ────────────────────────────────────────────────────────
let wakeListening    = false;
let awaitingCommand  = false;
let wakeRecognition  = null;
let wakeRestartTimer = null;

function setWakeState(state) {
  wakeIndicator.className = `wake-indicator ${state}`;
  if (state === "idle") {
    wakeLabel.textContent = "Listening paused…";
  } else if (state === "listening") {
    wakeLabel.textContent = "Say \"Hey BlindSpot\"…";
  } else if (state === "command") {
    wakeLabel.textContent = "Listening for your command…";
  } else if (state === "processing") {
    wakeLabel.textContent = "Processing…";
  }
}

function findWakeWord(transcript) {
  const lower = transcript.toLowerCase();
  const variants = [
    "hey blindspot", "hey blind spot", "hey blintspot",
    "hey blinspot", "hey blinds pot", "hey blend spot",
    "he blindspot", "he blind spot", "a blindspot", "a blind spot",
    "blindspot",
  ];
  for (const phrase of variants) {
    const idx = lower.indexOf(phrase);
    if (idx !== -1) {
      return transcript.slice(idx + phrase.length).trim();
    }
  }
  return null;
}

function playConfirmBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1100].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      const t = ctx.currentTime + i * 0.13;
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      osc.start(t);
      osc.stop(t + 0.11);
    });
  } catch (e) { /* ignore — audio context may be blocked */ }
}

function startWakeWordListening() {
  if (wakeListening) return;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  wakeRecognition = new SpeechRecognition();
  wakeRecognition.continuous     = true;
  wakeRecognition.interimResults = false;
  wakeRecognition.lang           = "en-US";
  wakeListening   = true;
  awaitingCommand = false;
  setWakeState("listening");

  wakeRecognition.onresult = (event) => {
    const transcript = event.results[event.results.length - 1][0].transcript.trim();

    if (awaitingCommand) {
      // Phase 2: we already heard "Hey BlindSpot", now capture the command
      if (transcript) {
        awaitingCommand = false;
        triggerWakeWordAnalysis(transcript);
      }
      return;
    }

    // Phase 1: scan for wake phrase
    const commandPart = findWakeWord(transcript);
    if (commandPart !== null) {
      playConfirmBeep();
      if (commandPart) {
        // Wake word + command in one utterance
        triggerWakeWordAnalysis(commandPart);
      } else {
        // Wake word only — wait for command in next utterance
        awaitingCommand = true;
        setWakeState("command");
      }
    }
  };

  wakeRecognition.onend = () => {
    wakeListening = false;
    if (!micBtn.classList.contains("listening") && !isAnalyzing) {
      setWakeState("idle");
      wakeRestartTimer = setTimeout(startWakeWordListening, 600);
    }
  };

  wakeRecognition.onerror = (e) => {
    wakeListening = false;
    if (e.error !== "aborted" && !micBtn.classList.contains("listening") && !isAnalyzing) {
      wakeRestartTimer = setTimeout(startWakeWordListening, 1000);
    }
  };

  try {
    wakeRecognition.start();
  } catch (e) {
    wakeListening = false;
    setWakeState("idle");
  }
}

function stopWakeWordListening() {
  clearTimeout(wakeRestartTimer);
  wakeListening   = false;
  awaitingCommand = false;
  setWakeState("idle");
  if (wakeRecognition) {
    try { wakeRecognition.abort(); } catch (e) { /* ignore */ }
    wakeRecognition = null;
  }
}

function triggerWakeWordAnalysis(query) {
  stopWakeWordListening();
  setWakeState("processing");
  queryInput.value = query;
  setStatus(`Wake word: "${query}"`);
  analyzeSnapshot(query);  // finally block restarts wake word listening
}

// ── Helpers ────────────────────────────────────────────────────────────────
function setResponse(text) { responseText.textContent = text; }
function setStatus(text)   { statusIndicator.textContent = text; }

// ── Init ───────────────────────────────────────────────────────────────────
(async () => {
  await startCamera();
  setupSpeechRecognition();
  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => {};
  // Start wake word immediately — mic permission prompt fires here
  startWakeWordListening();
})();
