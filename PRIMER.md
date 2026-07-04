# Bird Quiz — Primer for picking this project back up

Read this first in a new session. It's the fast path back to full context —
skip re-discovering things already settled here.

## What this is

**Bird Quiz**: an audio-first bird identification & knowledge game, live at
**bird.folkengames.com**. It replaced an old unused demo app ("Bird Fan" /
`birding-game`), which is stopped but left on the server for reference.

Built to apply a year of real blind-playtester lessons from Tobias's
poker/dungeon game (see memory `[[poker-josh-feedback]]`) to a *new* app,
audio-first from the ground up rather than accessibility bolted onto a
visual game afterward. Primary audience: blind/screen-reader users; fun and
challenging enough for real birders, welcoming enough for total beginners.

## Where everything lives

- **Local checkout:** `C:\Users\Tobias Merriman\Documents\birdquiz\` (this repo).
- **GitHub:** `https://github.com/folken88/birdquiz` (public, `main` branch).
- **Live server:** TrueNAS at `192.168.1.200`, stack dir
  `/mnt/fast/apps/stacks/birdquiz` — two containers, `birdquiz-backend`
  (Express/Node) + `birdquiz-web` (nginx serving `public/`, proxying `/api/`
  to the backend). Deployed via `docker compose` there directly (clone +
  build on the box, same pattern as `poker`/`birding` before it).
- **Design spec:** `docs/superpowers/specs/2026-07-04-audio-first-bird-quiz-design.md`
  in this repo — read it for the *why* behind every decision below.
- **Memory (persists across Claude sessions):**
  `birdquiz-app.md` (full architecture + gotchas write-up) and
  `poker-josh-feedback.md` (the accessibility lessons this app draws from).
  Both are pulled in automatically at the start of any session that touches
  this project — but re-read `birdquiz-app.md` explicitly if picking up
  deploy/ops work, since memory can go stale and that file has the sharpest
  detail.
- **SSH access, sudo password, deploy conventions:** same as poker — see
  memory `poker-deploy-ops.md` (SSH key path, `sudo -S -k`, git push
  credential workaround). Nothing birdquiz-specific there; it's the same
  TrueNAS box, same access pattern.

## Current state (as of 2026-07-04)

**Live and working**, verified via direct API calls through
`https://bird.folkengames.com` post-cutover:
- Casual name+token login (no password), progress resumes by name.
- Weighted "due for review" mastery tracking per player per species.
- Three quiz modes mixed per session: sound-ID (xeno-canto), spoken
  field-mark trivia, habitat/range trivia — answered by number key, no typing.
- SpeechSynthesis narrator: earcons, adjustable rate (`[`/`]`) and volume
  (`-`/`=`), one sacred global stop key (`S` — never rebind it to a feature).
- 16 placeholder animal tokens (not bird-specific yet) staged and serving.
- Running with **no eBird/xeno-canto API keys configured** — everything is
  currently served from a hand-written 18-species demo pool
  (`backend/src/demoSpecies.js`), same demo-mode spirit the old app had.

**Not yet done** (see `birdquiz-app.md` memory for the full list):
1. No real browser/screen-reader session has exercised this yet — only
   curl-level API verification and a live cutover health check. **Do this
   first if picking the project back up** — open bird.folkengames.com and
   actually play a round.
2. eBird / xeno-canto API keys not configured (both free) — until they are,
   the game only ever uses the 18-species demo pool regardless of region
   entered.
3. Field-mark/habitat trivia for real (non-demo) species falls back to a
   raw Wikipedia summary sentence — untested at scale, likely needs curation.
4. No on-screen settings UI for rate/volume/photo-mode — keyboard-only,
   undocumented in the app itself.
5. Real per-bird-species token art doesn't exist yet — swap is a one-column
   `image_path` update in the `tokens` table (see `backend/src/db.js`), no
   schema change needed when art shows up.
6. Not yet added to the nightly Google Drive backup routine — low priority
   while all data is placeholder/test data, but real per-player mastery data
   should get backed up once it has value worth protecting.

## Architecture map (start here when reading code)

```
backend/
  src/server.js      — Express app, mounts everything below
  src/db.js          — better-sqlite3: tokens/players/mastery schema +
                        session-pick weighting logic (read this to
                        understand the spaced-repetition-lite scoring)
  src/proxy.js        — eBird/xeno-canto/Wikipedia/Nominatim proxy routes,
                        ported from the old app + new /api/birds/facts
  src/demoSpecies.js  — the 18-species fallback pool w/ hand-written facts
public/
  index.html
  css/styles.css
  js/narrator.js     — READ THIS FIRST for any frontend work. The speech
                        queue, earcons, sacred stop key, and the shared
                        Narrator.presentChoices() numbered-choice widget
                        that both login.js and quiz.js are built on.
  js/login.js        — name+token picker
  js/quiz.js         — region picker → session loop → scoring
  js/api.js          — thin fetch wrappers, one function per backend route
  tokens/*.webp       — the 16 placeholder animal images
docker-compose.yml    — two services: backend, web (nginx). WEB_PORT env
                        var controls the host port (32085 = live/prod).
```

## Conventions to keep following

- **Numbered-choice everywhere.** Any new interactive choice (settings,
  future modes, whatever) should go through `Narrator.presentChoices()`,
  not a bespoke widget — that's the one input pattern that's proven to work
  for blind play, and consistency matters more than novelty here.
- **`S` is sacred.** Never bind a new feature to it. If you're adding
  keybindings, grep `narrator.js` and every screen's keydown handlers first.
- **Player identity is the name, not name+token.** Don't key anything new
  off the pair — token swaps must never orphan a player's mastery data.
- **Deploy gotcha:** a fresh `docker compose up` on this box will
  auto-create `backend/data/` as root-owned, and the container's `node`
  user can't write to it → `SQLITE_CANTOPEN` crash loop. Always
  `mkdir -p backend/data && chmod 0777 backend/data` on the host before
  `docker compose up` after a clean clone.
- **Traefik was never touched** for either deploy or cutover — it already
  points `bird.folkengames.com` at port 32085, and always will unless that
  changes for an unrelated reason. Don't go looking in the Traefik stack
  for anything birdquiz-related.
