## ShadowScript

Professional, distraction-free shadow boxing trainer (vanilla HTML/CSS/JS).

### Run

- Open `index.html` in a browser, or serve the folder locally (recommended).
- For speech: use a browser with Web Speech API support (Chrome / Edge).

### Features

- **Coach engine**: numeric DSL (0–9), difficulty modes, pivot/variation logic
- **States**: Idle → Warmup → Running → Rest → Finished
- **Speech coaching**: natural combo phrasing + voice selection (prefers high-quality en-US voices)
- **Burnout finisher**: final 15s of the last round
- **Custom routines**: one combo per line, persisted in `localStorage`
- **Wake Lock + haptics** (when supported)

### Repo layout

- `index.html`: UI markup
- `styles.css`: premium desktop UI theme
- `app.js`: workout logic + speech
- `logo.svg`: ShadowScript logo (SVG)

