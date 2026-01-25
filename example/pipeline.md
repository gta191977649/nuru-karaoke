# Melody Evaluation Pipeline (Signal-Processing View)

This document summarizes the **end-to-end pipeline** used in this codebase to transform microphone audio into beat-aligned melody judgments and scoring, expressed in signal-processing language. It is written directly from the implementation and references the exact source locations at the end.

## 1) Symbols and Variables (Definitions and Origins)

All times are in **milliseconds** unless explicitly stated. Beat-time variables are measured in **beats**.

### 1.1 Audio sampling

The audio input is framed into time-domain windows. Let $x_k[n]$ be the sample at frame index $k$ and sample index $n$, with frame length $N$ samples and $n \in \{0, \ldots, N-1\}$. In code, $N$ is the analyser FFT size, `analyser.fftSize = 2048`. The sampling rate is $f_s$ (Hz), coming from `context.sampleRate`. The update interval is implemented as

$$\Delta t_{\text{update}} = \frac{f_s}{N}$$

(as passed directly to `setInterval`).

### 1.2 Pitch / F0

For each frame, the system estimates a fundamental frequency $f_0[k]$ (Hz) using AubioJS `Pitch`. The configuration is `(method='default', buffer=N, hop=N/8, sampleRate=f_s)` with tolerance `0.5`.

### 1.3 Timing and beat domain

Let $t_{\text{current}}$ be the current playback time (ms) from `GameState.getCurrentTime()` and $t_{\text{lag}}$ the input lag compensation (ms) from `InputManager.getPlayerInputLag()`. The lag-corrected timestamp is

$$t_k = t_{\text{current}} - t_{\text{lag}}$$

The beat length is $T_b$ (ms/beat) from `GameState.getSongBeatLength()`, and the beat-aligned time for frame $k$ is

$$b_k = \frac{t_k}{T_b}$$

The note-selection tolerance is $\tau$ (beats), used as $\tau=0$ first and $\tau=0.5$ if no note is found.

### 1.4 Score sheet / melody

Each melody note $i$ is defined by $(s_i, l_i, p_i, \text{type}_i)$, where $s_i$ is the **start beat**, $l_i$ is the **duration in beats**, $p_i$ is the **target pitch** in semitone units (MIDI-like integer), and $\text{type}_i$ is the **note category** (normal, star, rap, freestyle, etc.). The aligned note index at beat $b_k$ is denoted $i^*$.

### 1.5 Distance / tolerance

The pitch tolerance in semitones is $\delta$ from `GameState.getTolerance()`. The reference pitch is A4 with frequency $f_{A4}=440$ Hz (`MIDDLEA`) and semitone index $p_{A4}=69$ (`SEMITONE`). The pitch-to-frequency mapping used by `pitchToFrequency` is

$$f(p) = f_{A4} \cdot 2^{(p - p_{A4})/12}$$

The estimated pitch index for $f_0[k]$ is

$$\hat p[k] = \mathrm{round}\left(12 \log_2\frac{f_0[k]}{f_{A4}}\right) + p_{A4}$$

The smallest modulo-12 distance between $\hat p[k]$ and $p_{i^*}$ is

$$\Delta p = ((\hat p[k] \bmod 12) - (p_{i^*} \bmod 12) + 18) \bmod 12 - 6$$

After applying tolerance $\delta$, the stored semitone distance is $d_k$. If $d_k=0$, the cent deviation is

$$c_k = 1200 \log_2\frac{f_0[k]}{f(p_{i^*})}$$

and the normalized precision stored in each frame is

$$\text{preciseDistance} = \frac{c_k}{100\,\delta + 50}$$

### 1.6 Segmented player notes

Consecutive frames aligned to the same note and distance are aggregated into `PlayerNote` segments. Each segment stores a $\text{distance}$ derived from $d_k$. The break tolerance in beat domain is

$$b_{\text{tol}} = \frac{100\,\mathrm{ms}}{T_b}$$

## 2) Signal-Processing Pipeline

### Step 0: Score Sheet Preparation (Beat Domain)
The song is parsed into sections of notes. Each note carries $(s_i, l_i, p_i, \text{type}_i)$ measured in beats, where:

- $s_i$: the **start beat** of note $i$ (the first beat index where the note is active).
- $l_i$: the **duration in beats** of note $i$ (how many beats it spans).
- $p_i$: the **target pitch** of note $i$ in semitone units (MIDI-like integer).
- $\text{type}_i$: the **note category** (e.g., normal, star, rap, freestyle), used by later scoring rules.

These notes form the reference melody against which singing is evaluated.

### Step 1: Audio Capture and Framing
Microphone audio is acquired via `getUserMedia`, routed into `AudioContext`, and split into channels if needed. For each channel:

- Create an `AnalyserNode` with `fftSize = 2048`.
- On each timer tick, read a time-domain frame:
  - $$x_k[n] \leftarrow \text{getFloatTimeDomainData}()$$

### Step 2: Fundamental Frequency Estimation
For each frame $x_k[n]$, estimate F0:

$$f_0[k] = \mathrm{Pitch}(x_k)$$

The pitch estimator uses parameters `(buffer=N, hop=N/8, sampleRate=f_s)` and tolerance `0.5`.

### Step 3: Time and Beat Mapping
For each detected F0 sample:

- Correct the timestamp by input lag:
  - $t_k = t_{\text{current}} - t_{\text{lag}}$.
- Map to beat domain:
  - $b_k = \frac{t_k}{T_b}$.

### Step 4: Beat-Aligned Note Selection
Find the target note in the score sheet for this beat:

- Determine the active section by $b_k$.
- Select the note $i^*$ such that:

$$s_i - \tau \le b_k \le s_i + l_i + \tau$$

with $\tau = 0$ first; if not found, retry with $\tau = 0.5$ beats.

If no note exists, the frame is ignored for melody scoring.

### Step 5: Voiced/Unvoiced Gating
If $f_0[k] = 0$, the frame is treated as unvoiced and discarded from melody tracking. Otherwise it proceeds.

### Step 6: Pitch Quantization and Distance Calculation
Compute pitch distance to the target note:

1) Quantize frequency to pitch index:

$$\hat p[k] = \mathrm{round}\left(12 \log_2\frac{f_0[k]}{f_{A4}}\right) + p_{A4}$$

2) Compute the smallest modulo-12 distance $d_k$ and apply tolerance $\delta$:

$$
 d_k =
 \begin{cases}
  0, & |\Delta p| \le \delta \\
  \Delta p, & \text{otherwise}
 \end{cases}
$$

where $\Delta p$ is the smallest modulo-12 pitch distance between $\hat p[k]$ and $p_{i^*}$.

3) If $d_k = 0$, compute cent deviation normalized by tolerance:

$$c_k = 1200 \log_2\frac{f_0[k]}{f(p_{i^*})}$$

$$\text{preciseDistance} = \frac{c_k}{100\,\delta + 50}$$

### Step 7: Segment Formation (PlayerNote Aggregation)
Each valid frame contributes to a `PlayerNote` segment. Create a new segment when:

- the aligned note changes ($s_i$ differs), OR
- the distance $d_k$ changes (except for note types that ignore distance), OR
- the gap since the last segment exceeds $b_{\text{tol}}$.

Otherwise extend the last segment length and append the frame data.

### Step 8: Segment Attributes (Perfect + Vibrato)
For each segment, update:

- **Perfect hit** when $\text{distance} = 0$ and segment length is within $0.5$ beat of target note length.
- **Vibrato** when pitch-change intervals in the segment show stable periodicity (window size 6; interval spread within 1.75x of average).

### Step 9: Scoring (Beat-Weighted)
For each `PlayerNote` segment that is in a scoring note type and has $\text{distance} = 0$, accumulate beat lengths. These beat totals are weighted by note type multipliers and normalized to a fixed max score.

## 3) Pipeline Diagram (ASCII)

```
Microphone
   |
   v
AudioContext + AnalyserNode (N=2048)
   |
   v
Time-domain frames x_k[n]
   |
   v
Aubio Pitch(f0[k]) ----> f0[k] == 0 ? discard
   |
   v
Timestamp t_k  ---> beat mapping b_k = t_k / T_b
   |
   v
Beat-aligned note selection (s_i, l_i, p_i)
   |
   v
Pitch quantization + distance (d_k, preciseDistance)
   |
   v
Segment aggregation (PlayerNote)
   |        |
   |        +--> Perfect / Vibrato flags
   |
   v
Beat-weighted scoring
```

## 4) Full Pipeline Pseudocode (Code-Accurate)

```text
for each player update tick:
  frequency = InputManager.getPlayerFrequency(player)
  t_now = GameState.currentTime - InputManager.getPlayerInputLag(player)

  if frequency is an array (remote mic):
    last_t = last real timestamp
    for each value f in frequency:
      t_k = last_t + step
      process_frame(t_k, f)
  else:
    process_frame(t_now, frequency)

function process_frame(t_k, f0):
  record = { timestamp: t_k, frequency: f0 }
  store record in raw frequency list

  b_k = t_k / songBeatLength
  section = getSectionByBeat(b_k)
  if section is notes:
    note = getNoteAtBeat(section, b_k, 0) ?? getNoteAtBeat(section, b_k, 0.5)
    if note exists:
      appendFrequencyToPlayerNotes(playerNotes, record, note, songBeatLength)

function appendFrequencyToPlayerNotes(playerNotes, record, note, beatLength):
  if record.frequency == 0: return

  b_k = max(0, record.timestamp) / beatLength
  (distance, preciseDistance) = calcDistance(record.frequency, note.pitch)

  break_tol = 100ms / beatLength
  if new note OR distance changed OR gap > break_tol:
    start new PlayerNote segment
    clamp start to [note.start, note.end]
    adjust previous segment end if needed
  else:
    extend last segment length
    append frequency record
    update isPerfect and vibrato flags

function calcDistance(f0, targetPitch):
  p_hat = round(12 * log2(f0 / f_A4)) + p_A4
  d = smallest mod-12 distance between p_hat and targetPitch
  if |d| <= tolerance: d = 0
  if d == 0:
    preciseDistance = cent_error / (100 * tolerance + 50)
  else:
    preciseDistance = -1
  return (d, preciseDistance)

function score(playerNotes):
  for each PlayerNote with distance==0 and scoring type:
    add segment length to beat counters
  scale by note-type multipliers and normalize to MAX_POINTS
```

## 5) Source References (Code Locations)

- Audio capture, analyser setup, frame read, update timer: `src/modules/GameEngine/Input/MicInput.tsx:20-71`
- Aubio Pitch setup and F0 estimation: `src/modules/GameEngine/Input/MicStrategies/Aubio.ts:6-20`
- Beat alignment and per-frame note update: `src/modules/GameEngine/GameState/PlayerState.ts:36-99`
- Beat-to-note selection logic: `src/modules/Songs/utils/notesSelectors.ts:25-27`
- Segment aggregation + break tolerance + perfect/vibrato logic: `src/modules/GameEngine/GameState/Helpers/appendFrequencyToPlayerNotes.ts:14-71`
- Pitch distance and cent normalization: `src/modules/GameEngine/GameState/Helpers/calcDistance.tsx:5-38`
- Vibrato detector (interval regularity): `src/modules/GameEngine/GameState/Helpers/detectVibrato.ts:1-45`
- Scoring aggregation: `src/modules/GameEngine/GameState/Helpers/calculateScore.ts:63-127`

## 6) Validation Notes
This document was verified against the listed files and line ranges to ensure that each step, variable definition, and formula corresponds to the actual implementation.
