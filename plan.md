# ShadowScript — MVP Improvement Plan
> No backend required. Everything runs in the browser with localStorage.

---

## Priority 1 — Core Training Experience

### 1.1 Workout History & Stats (localStorage)
**What:** After each session, save a summary to localStorage and show it on the finished screen.
**Data to store:** date, rounds, duration, total combos thrown, difficulty.
**Why:** New boxers need to see progress. Even simple numbers ("You threw 47 combos today") feel motivating.
**How:** Append to a `shadowscript_history` array in localStorage. Cap at last 30 sessions.

---

### 1.2 Countdown Beeps / Audio Cues
**What:** Play a short beep sound at:
- 3 seconds before round ends ("3… 2… 1…")
- Start of each round (bell sound)
- Rest period start
**Why:** Real boxing gyms use a bell. This is the single biggest "feels like a real gym" upgrade.
**How:** Use the Web Audio API to generate tones (no audio files needed). A 440Hz sine wave for 0.1s = bell-like click. No external assets required.

---

### 1.3 Warmup Instructions
**What:** During the 10s warmup, speak and display a short instruction:
- "Get into your stance. Hands up. Stay light on your feet."
**Why:** New boxers don't know what to do during warmup. This fills the silence and sets the tone.
**How:** One `speakCombo(...)` call at warmup start. Already have the infrastructure.

---

### 1.4 Rest Period Tips
**What:** During rest between rounds, the coach speaks a short tip:
- "Keep your hands up between combos."
- "Exhale on every punch."
- "Stay on your toes."
**Why:** Dead silence during rest feels amateur. A real trainer talks between rounds.
**How:** Array of 10–15 tips, pick one randomly each rest. One `speakCombo(...)` call.

---

### 1.5 Combo Counter on Training Screen
**What:** Show a live count of combos thrown in the current round.
**Why:** Gives new boxers a sense of volume and progress mid-round.
**How:** Increment a `combosThisRound` counter each time `scheduleNext()` fires. Display in the header next to the round badge.

---

## Priority 2 — Coach Intelligence

### 2.1 Preset Training Programs
**What:** Replace the blank custom routine with named programs the user can select:
- **Beginner** — jabs and crosses only (1-2, 1-2-1, 2-1-2)
- **Fundamentals** — adds hooks (1-2-3, 1-2-3-2)
- **Defense Focus** — heavy slip/roll combos (1-2-7, 2-8-3)
- **Power Combos** — uppercuts and hooks (5-2-3, 6-3-4)
**Why:** New boxers don't know what to type. Presets remove friction and teach real combinations.
**How:** A `<select>` dropdown that populates the custom routine textarea. No logic change needed.

---

### 2.2 Focus Mode (Single Technique Drill)
**What:** A mode where the coach only calls one move type for the whole round.
- "Jab only round" — builds muscle memory
- "Defense round" — only slips and rolls
**Why:** Coaches isolate techniques. New boxers need repetition before combination.
**How:** Add a "Focus" select to the Workout panel. Filter `OFFENSE`/`DEFENSE` arrays before combo generation.

---

### 2.3 Smarter Combo Logic — No Consecutive Same Move
**What:** Prevent the same punch from appearing twice in a row (e.g. `1-1-2` is unrealistic).
**Why:** Real boxing combos alternate hands. `1-1` (jab-jab) is unusual and teaches bad habits.
**How:** In `generateCombo()`, check `out[out.length - 1]` before pushing. Retry if same.

---

### 2.4 Coach Encouragement Mid-Round
**What:** Occasionally (every 3–4 combos) the coach says a short motivational phrase:
- "Good work, keep moving."
- "Stay sharp."
- "Push through."
**Why:** A real trainer doesn't just call combos — they encourage. This makes the app feel alive.
**How:** Counter in `scheduleNext()`. Every N combos, queue a motivational utterance before the next combo.

---

## Priority 3 — Onboarding & Learning

### 3.1 First-Run Tutorial
**What:** On first load (no localStorage), show a brief overlay:
- What the numbers mean (1 = Jab, 2 = Cross…)
- How to read the combo track
- A "Got it" button to dismiss
**Why:** New boxers land on the app with no context. The punch reference exists but nobody reads it first.
**How:** Check `localStorage.getItem('shadowscript_seen_tutorial')`. If null, show a simple modal. Set the key on dismiss.

---

### 3.2 Animated Move SVGs in Punch Reference
**What:** Each collapsible punch reference item shows the animated SVG for that move (like `jab-move.svg`).
**Why:** New boxers learn by watching, not reading. Visual reference is the most valuable thing for home training.
**How:** Create SVG files for all 10 moves (following the `jab-move.svg` pattern). Embed as `<img>` tags inside `.ref-item-desc`. Already have the `moves.svg` source to extract from.

---

### 3.3 Live Move Illustration During Training
**What:** While a combo plays, show a small SVG illustration of the **current** punch in the corner of the training screen.
**Why:** New boxers forget what "5" means mid-round. A visual cue removes the mental lookup.
**How:** Map punch numbers to SVG files. In `renderComboTrack()`, update an `<img>` src to the current move's SVG.

---

## Priority 4 — Polish & Feel

### 4.1 Workout Summary Screen
**What:** Expand the finished screen to show:
- Total time
- Rounds completed
- Combos thrown
- Difficulty
- A shareable text summary (copy to clipboard)
**Why:** The current finished screen says "All rounds done. Great work." — that's it. A summary feels earned.
**How:** Track `totalCombosThrown` during the session. Render on the finished view.

---

### 4.2 Keyboard Shortcuts
**What:**
- `Space` — Pause / Resume
- `Escape` — End workout (with confirmation)
**Why:** During training, reaching for a mouse is awkward. Keyboard control is essential for desktop use.
**How:** Add a `keydown` listener. Already have `togglePause()` and `stopWorkout()`.

---

### 4.3 Round Duration Presets
**What:** Quick-select buttons next to the round duration input:
- 1 min / 2 min / 3 min
**Why:** New users don't know what duration to pick. Presets reduce decision fatigue.
**How:** Three small buttons that set the input value. Pure HTML/JS, no logic change.

---

### 4.4 PWA Support (Install to Home Screen)
**What:** Add a `manifest.json` and a minimal service worker so the app can be installed on mobile.
**Why:** Home boxers train on their phone. An installed PWA feels like a real app, works offline, and keeps the screen on more reliably.
**How:**
- `manifest.json` with name, icons, theme color
- A 5-line service worker that caches the 4 files (index, styles, app, logo)
- `<link rel="manifest">` in `<head>`

---

### 4.5 Volume Control
**What:** A slider for coach voice volume (separate from speech rate).
**Why:** Some users train with music. They want the coach audible but not dominant.
**How:** Map slider to `utterance.volume`. Save in settings.

---

## What NOT to build for MVP
- User accounts / login
- Cloud sync
- Video recording
- Heart rate monitor integration
- Leaderboards

These all require a backend. Everything above is pure localStorage + Web APIs.

---

## Suggested Build Order

| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 1 | Audio beeps (bell + countdown) | Low | Very High |
| 2 | Warmup instructions + rest tips | Very Low | High |
| 3 | Combo counter on training screen | Very Low | Medium |
| 4 | Preset programs | Low | Very High |
| 5 | Workout summary screen | Low | High |
| 6 | Keyboard shortcuts | Very Low | Medium |
| 7 | No consecutive same move fix | Very Low | Medium |
| 8 | Animated SVGs in punch reference | Medium | High |
| 9 | Live move illustration during training | Medium | High |
| 10 | PWA support | Low | High |
| 11 | First-run tutorial | Low | High |
| 12 | Focus mode | Low | Medium |
| 13 | Round duration presets | Very Low | Low |
| 14 | Volume control | Very Low | Low |
| 15 | Workout history | Medium | Medium |
