# SwaraSaathi: Dual-Role Clinical Triage & Session Logging Core

## 🚀 Leveraging Google Gemma 4 for Advanced Clinical Triage

SwaraSaathi is powered by **Google Gemma 4** (specifically the state-of-the-art `google/gemma-4-26b-a4b-it-maas` open model family) hosted on GCP Vertex AI Model Garden. Gemma 4 represents a massive leap forward in open-weights AI, offering exceptional cognitive reasoning, deep bicultural language understanding, and powerful real-time translation.

### Why Gemma 4?

1. **Unrivaled Multilingual & Translation Prowess:** Gemma 4 provides exceptional, native-level comprehension of regional Indian languages (Hindi, Odia, Telugu, Tamil, etc.). In SwaraSaathi, Gemma 4 performs real-time bicultural translation, translating regional-dialect patient transcripts into English for clinicians while simultaneously generating comforting, native-language guidance directly for the patient.
2. **Deep Semantic Reasoning & Risk Assessment:** Clinical triage requires evaluating subtle emotional distress cues, feelings of worthlessness, sleep disturbances, and acute crisis risks. Gemma 4's advanced reasoning capabilities enable it to act as a highly safe dual-role triage engine, estimating clinical severity scores (1 to 100) and identifying primary psychological stressors (e.g. Burnout, Situational Panic, Suicidal Ideation) with clinical-grade safety thresholds.
3. **Strict JSON Schema Adherence:** SwaraSaathi relies on structured API outputs to seamlessly map clinical data onto clinician dashboard charts and crisis lock-screen modals. Gemma 4 natively follows complex system instructions and structural response schemas flawlessly, ensuring robust JSON parsing and minimizing backend decoding errors.
4. **Data Privacy & Compliance:** Unlike closed-source cloud-only models, Gemma 4 is an open-weights model. It can be securely self-hosted, customized, or run locally, ensuring that sensitive patient-clinician clinical transcripts and session recordings remain completely private, compliant, and under your control.

---

## 🌟 Key Features

### 👤 Patient Portal
* **Infinite Continuous Dictation ("Speak as long as you can"):** Leveraging native browser Speech Recognition (`webkitSpeechRecognition`) with an auto-restart loop, patients can record voice journals infinitely without browser timeouts.
* **Bicultural Language Selector:** Patients can choose their language (English, Hindi, Odia, Telugu, Tamil) before speaking.
* **Live Transcription Feed:** Patient speech is translated into text and displayed in real-time inside the text editor as they speak.
* **Empathetic AI Feedback:** Gemma 4 analyzes the patient's entry to formulate custom, compassionate responses directly to the patient in their selected language.
* **Speech Synthesis (TTS):** Patients can click "Listen Aloud" to hear Gemma 4's response spoken in a comforting voice using the browser's speech synthesis engine.

### 🩺 Clinician Dashboard
* **Real-Time Triage Queue:** An interactive patient list displaying identified stressors, detailed clinical notes, risk indicators, and severity distress scores (1 to 100).
* **Bicultural Translation Badge:** If a patient submits a journal in a regional language, the clinician card displays a beautiful, blue-themed **"English Translation"** card directly beneath the "Verbatim Transcript" so the doctor can instantly read the translated consultation notes.
* **Live Session Recorder (Up to 30 mins):** Clinicians can record consulting sessions directly from the dashboard in their selected language. The module utilizes dual capture:
  1. **High-Fidelity Audio Capture:** Uses the browser `MediaRecorder` API to record raw meeting audio and mounts a playback player instantly.
  2. **Real-time Session Transcription:** Transcribes clinician-patient interactions live on screen during the consult.
* **Inline Patient File Builder ("+ Add New Patient"):** Clinicians can toggle to create a brand-new patient file inline (capturing Name, Stressor, and Risk Level), record the consult, and log notes in a single click.
* **Patient Association Engine:** Logs and transcribed interactions are instantly appended directly to the selected patient's active clinician files.

---

## 🤖 Core AI Architecture: Google Gemma 4 + GCP Vertex AI

SwaraSaathi utilizes a modern, **keyless, and Gemini-free backend architecture**:
* **Gemma 4 via Vertex AI Model Garden:** The server communicates directly with your **Gemma 4** open-weights model deployed on Vertex AI.
* **Local Proxy Endpoint:** The application routes cognitive reasoning completion queries through a local proxy listening on `http://127.0.0.1:8787/v1/chat/completions`.
* **Browser-Native STT (Speech-to-Text):** Speech transcription is handled entirely on the client side inside the browser. This eliminates the need to upload heavy audio files to your server or configure backend Gemini API keys, ensuring maximum speed, data privacy, and a cost-free audio pipeline.
* **Robust JSON Schema Enforcement:** Gemma 4 is instructed via explicit system prompts to return strictly conforming JSON. The backend sanitizes raw LLM output (stripping markdown ` ```json ` delimiters if returned) and includes a fallback retry mechanism that rolls back formatting parameters if the upstream endpoint returns exceptions.

---

## ⚙️ Project Structure & Flow

```mermaid
graph TD
    A[Patient Speaks or Types] -->|Continuous Local STT| B[Browser App]
    B -->|Submit Text JSON| C[Express Server]
    C -->|Completion Request| D[Vertex Gemma Proxy :8787]
    D -->|Vertex AI Model Garden completions| E[Gemma 4 Model completion]
    E -->|JSON Output Response| C
    C -->|Sanitize & Parse| B
    B -->|Render Empathetic UI| A
    
    F[Clinician Session Recorder] -->|HTML5 Audio & Speech| G[Real-time Transcript & Player]
    G -->|Create or Append Note| H[Manual Assessment Endpoint]
    H -->|Update in-memory Queue| I[Clinician Triage Cards]
```

---

## 🚀 Running Locally

### Prerequisites
* **Node.js** (v18 or higher recommended)
* A running **Vertex Gemma Proxy** active on `http://127.0.0.1:8787/v1`

### 1. Installation
Clone the repository, navigate into the project directory, and download dependencies:
```bash
cd SwaraSaathi
npm install
```

### 2. Environment Variables
Create or configure a `.env` file in the root of the project:
```env
GEMMA_PROXY_URL=http://127.0.0.1:8787/v1
GEMMA_PROXY_MODEL=google/gemma-4-26b-a4b-it-maas
```
*(Note: No Gemini API Key is required to run this project!)*

### 3. Start Development Server
Run the local compiler and Express server:
```bash
npm run dev
```
Open **`http://localhost:3000`** in your browser (Google Chrome, Microsoft Edge, or Apple Safari are recommended for Speech Recognition support).

### 4. Build for Production
To build and bundle the frontend React assets and the Node/Express server for production deployment:
```bash
npm run build
```
The compiled server and client files will be located in the `dist/` directory. Start the production build with:
```bash
npm start
```