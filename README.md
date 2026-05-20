# vikalpthukral.com

Personal site, served by GitHub Pages from this repo (`Weculp/weculp.github.io`). Hand-rolled static HTML/CSS — no build step.

## Structure

```
index.html              Hero / about / projects feature / experience / contact
projects.html           Full projects list
strategies.html         Strategies index
strategies/rgvh.html      └─ RGVH strategy detail
games.html              Games library (cards)
infinite-tictactoe.html   └─ Infinite Tic-Tac-Toe game
assets/                 PDFs (resume, IAQF report), images, music
firebase-rules.json     Realtime Database security rules (paste into Firebase console)
CNAME                   www.vikalpthukral.com
```

Each page is self-contained: shared design tokens (CSS variables) are duplicated at the top of each `.html` so the site keeps working without a bundler.

---

## Infinite Tic-Tac-Toe

Real-time two-player game at `/infinite-tictactoe.html`. Each player has max 3 pieces on the board; placing a 4th culls the oldest. No draws are possible.

**Stack:** vanilla JS + Firebase Realtime Database (anonymous auth). Player nickname, avatar, UUID, and head-to-head tally are stored in cookies + `localStorage` on the client.

### Setup (one-time)

1. **Create a Firebase project** at https://console.firebase.google.com — disable Analytics, free Spark tier is enough.
2. **Realtime Database** → Create Database → region `us-central1` → start in **test mode**.
3. **Authentication** → Sign-in method → enable **Anonymous**.
4. **Project Settings → Your apps → Web** → register a web app → copy the `firebaseConfig` object.
5. Paste the config into `infinite-tictactoe.html`, replacing the `PASTE_*` placeholder near the top of the `<script type="module">` block (search for `const firebaseConfig`).
6. **Apply security rules**: in Firebase console → Realtime Database → Rules tab → paste the contents of `firebase-rules.json` → Publish. This restricts writes to authed players in the room and validates move shape.
7. **Background music** (optional): drop a royalty-free mp3 at `assets/game-music.mp3`. Suggested sources:
   - Pixabay Music (CC0, no attribution): https://pixabay.com/music/search/arcade/
   - Incompetech (CC-BY, attribution in footer): https://incompetech.com/music/royalty-free/

   Look for chiptune / 8-bit / retro arcade style, loopable, ~2–3 min. If the file is missing the music toggle silently no-ops.

### Local development

```bash
# any static server works; project has no build step
npx serve .
# or
python -m http.server 8000
```

Then open http://localhost:8000/infinite-tictactoe.html. If Firebase isn't configured, the page falls back to a "local hot-seat" mode (single-tab two-player) and shows a yellow dev banner.

### Deployment

Push to `main` on `Weculp/weculp.github.io` — GitHub Pages auto-deploys to www.vikalpthukral.com within ~1 min.
