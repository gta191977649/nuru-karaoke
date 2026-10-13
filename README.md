# Raku Sound

**Japanese Style Online Karaoke System**

Raku Sound brings Japanese-style karaoke to your browser, combining song selection, MIDI accompaniment, synchronized lyrics, and real-time singing scores. Inspired by Japanese karaoke interfaces, it features a visual melody guide, singing technique feedback, and animated backgrounds for singing and practice at home.

## Screenshots

### Song Selection

Find songs by artist, title, keyword, or song number, manage your song queue, and adjust tempo, key, and volume.

![Raku Sound song selection screen](docs/karaoke2.png)

### Singing and Real-Time Scoring

Follow synchronized lyrics with pronunciation guides and a scrolling melody guide, view your current score, and track techniques such as shakuri, kobushi, falls, and vibrato.

![Raku Sound singing and real-time scoring screen](docs/karaoke.png)

## Features

- **Japanese-style song selection**: Search songs and artists, filter the library, queue songs, and control playback.
- **Browser-based MIDI accompaniment**: Play MIDI through SpessaSynth and SoundFont synthesis, with MIDI standard detection and instrument mapping.
- **Synchronized lyrics**: LRC parsing with pronunciation annotations and playback highlighting.
- **Live pitch tracking and scoring**: Detect microphone pitch, compare it with the reference melody, and display results after singing.
- **Singing technique analysis**: Visual feedback for vibrato, kobushi, upward slides, and downward slides.
- **Audio customization**: Key and tempo controls, microphone selection, latency calibration, and synthesizer and audio effect settings.
- **Accounts and scores**: Registration, login, favorite songs, score history, and per-song leaderboards.
- **Song library management**: A Django administration interface for songs, artists, tags, MIDI files, and lyrics.

## Technology

| Area | Technologies |
| --- | --- |
| Frontend | React, Vite, Zustand, Bootstrap |
| Graphics and singing interface | PixiJS, Canvas |
| Accompaniment and audio | SpessaSynth, SoundFont, Web Audio API |
| Pitch and singing analysis | Pitchy, Aubio, TensorFlow.js, and other pitch detection options |
| Backend | Django, Django REST Framework, JWT |
| Database | SQLite by default |

## Running Locally

Install Node.js compatible with Vite 7 (20.19+ on the Node 20 branch, or 22.12+) and a Python version compatible with Django 5. The commands below use Windows PowerShell.

### 1. Start the Backend

From the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py createsuperuser
.\.venv\Scripts\python.exe manage.py runserver 8000
```

Open <http://localhost:8000/admin/> and sign in with your administrator account to add or manage songs, MIDI files, and lyrics.

### 2. Start the Frontend

Open another terminal and run these commands from the repository root:

```powershell
cd frontend
npm install
npm run dev
```

Open the URL printed by Vite, usually <http://localhost:5173>. In development, the frontend connects to the backend at <http://localhost:8000> by default.

To use a different backend, create `frontend/.env.local` with:

```dotenv
VITE_API_BASE_URL=http://localhost:8000
```

Restart the development server after changing this value. Production builds also use this variable; when it is unset, the current code defaults to `https://raku-sound.okamei.net`.

### 3. Start Singing

Allow microphone access, select a song, add it to the queue, and start playback. Use the settings to choose your microphone, calibrate latency, and configure the sound source. Microphone access requires HTTPS or localhost.

### Build the Frontend

```powershell
cd frontend
npm run build
```

Build output is written to `frontend/dist/`. See [backend/README.md](backend/README.md) for backend setup and API details.

## Project Structure

```text
frontend/       React frontend, singing interface, and browser audio engine
backend/        Django API, song management, accounts, and score services
docs/           Project screenshots used in this README
doc/            Additional project documentation
```
