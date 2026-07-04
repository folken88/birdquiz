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

## Current state (as of 2026-07-04, evening)

**Live and working**, now verified by full automated browser playthroughs
(login → region → 10 questions → session complete → mastery persisted),
not just curl checks:
- Casual name+token login (no password), progress resumes by name.
- Weighted "due for review" mastery tracking per player per species —
  verified live: correct answer dropped due_score to 0.45, misses sat at 2.3.
- Three quiz modes mixed per session, answered by number key, no typing.
- **Real bird sounds work with zero API keys**: `/api/birds/recording`
  falls back to iNaturalist's keyless public API (research-grade,
  openly-licensed sounds, played from `static.inaturalist.org` directly).
  xeno-canto v3 is still preferred when `XC_API_KEY` is set (v2 keyless API
  is dead — 404; v3 without key — 401).
- **Media eligibility gate (Tobias's rule)**: a bird may only be a quiz
  question if it has ≥1 verified recording AND ≥1 picture. Enforced via
  `POST /api/birds/media-check` (batch endpoint that also returns the media
  so the quiz plays what was verified). All 18 demo species pass.
  Distractor names still come from the full pool — names need no media.
- Bird clips route through `Narrator.playClip()` — sacred `S` stops them,
  20s length cap, ended/error/blocked-autoplay all resolve (no hangs).
- Session-complete screen is a numbered choice ("1. Play again") now.
- SpeechSynthesis narrator: earcons, adjustable rate (`[`/`]`) and volume
  (`-`/`=`), one sacred global stop key (`S` — never rebind it to a feature).
- 16 placeholder animal tokens (not bird-specific yet) staged and serving.
- **Both API keys configured now** (2026-07-04, in server `.env`). eBird →
  live regional species; xeno-canto → primary sound (song-typed, A-quality,
  streamed via our `/api/birds/audio/` proxy), with iNaturalist as keyless
  fallback. Live species are sampled randomly (not taxonomic-front, which
  was all waterfowl) and filtered to `category === 'species'` (no
  hybrids/spuh/slash/domestics).
- **Region picker is a curated country → state/province drill-down**
  (`backend/src/regions.js` + `GET /api/regions`): US/Canada/Australia/UK
  only — the regions with eBird subnational codes we can query. Free-text
  region entry is GONE (player can't land on an unsupported place). Two
  numbered-choice prompts. `/api/geo/search` (Nominatim) still exists but is
  unused by the region flow.
- **`presentChoices` now paginates lists >10** (9/page, `0` = More, wrapping,
  "page X of Y" announced) — needed for the 51-state US list, and it also
  fixed the old token-picker gap where tokens 11–16 were keyboard-unreachable.
  Lists ≤10 keep the classic 1–9/0 behavior untouched.

**Known bugs / not yet done:**
1. **Voice answers (STT) — designed, not built.** Spec at
   `docs/superpowers/specs/2026-07-04-voice-answers-design.md`: hold-`V`
   push-to-talk, say the bird's name (whole/partial/garble-tolerant), closed-
   set match against the choices, no-penalty mis-hears, no LLM. Tobias's
   ruling: credit requires the actual name — "the red one" scores nothing.
   **Open question before implementing:** fold in mobile fixes (Josh may be
   on a phone) — on-screen Stop + hold-to-Talk buttons, iOS audio-unlock,
   render spoken clue as text. Recommendation was to fold them in.
2. No buzz-in-early: during a sound clip the digit keys aren't live yet
   (choices bind after the clip finishes) — a player who knows the call
   immediately still has to wait out the clip (max 20s). Voice answers (V)
   will partly address this since `V` is live during the clip.
3. eBird taxonomy endpoint occasionally drops a code or two from a batch
   (fed 5, got 4 — `mourdo` missing); pool just comes back slightly smaller.
   Not blocking; look if a region ever comes up short.
4. Field-mark/habitat trivia for real (non-demo) species falls back to a
   raw Wikipedia summary sentence — untested at scale, likely needs curation.
5. No on-screen settings UI for rate/volume/photo-mode — keyboard-only,
   undocumented in the app itself (see mobile note under voice answers).
6. Real per-bird-species token art doesn't exist yet — swap is a one-column
   `image_path` update in the `tokens` table (see `backend/src/db.js`), no
   schema change needed when art shows up.
7. Image license not verified: iNat sounds are filtered to explicitly-
   licensed, but Wikipedia `pageimages` thumbnails are used without checking
   their license. Almost always freely-licensed Commons images, but to be
   airtight, add a Commons `imageinfo` license check to `findImage`.
7. Not yet added to the nightly Google Drive backup routine — low priority
   while all data is placeholder/test data.

**Local dev on Windows (this box):** `better-sqlite3` cannot build here
(no VS C++ toolset, no Node 24 prebuilt) so the full backend won't run
locally. `backend/local-test.js` (untracked, do not commit) serves
`public/` + the real `proxy.js` locally on :8081 and forwards the
sqlite-backed routes to the live server — good enough to playtest any
frontend or proxy change before deploying.

**Deploy gotcha #2 (hit 2026-07-04):** after `docker compose build backend
&& up -d --force-recreate backend`, the backend crash-looped with
`SQLITE_READONLY` — the db files in `backend/data/` were host-owned
(tobias, mode 644) and the rebuilt image's `node` user couldn't write them.
Fix: `chmod 0666 backend/data/birdquiz.db*` on the host, restart container.
Check `docker logs birdquiz-backend` after every recreate.

**Upstream API etiquette (learned the hard way):** Wikipedia's api.php
rate-limits per-title thumbnail calls brutally (429 + Retry-After ~54s
after ~10 rapid calls). Always use the batched form (up to 50 titles per
request) — `imagesForNames()` in `proxy.js` does this; don't regress it
to per-species calls.

## Architecture map (start here when reading code)

```
backend/
  src/server.js      — Express app, mounts everything below
  src/db.js          — better-sqlite3: tokens/players/mastery schema +
                        session-pick weighting logic (read this to
                        understand the spaced-repetition-lite scoring)
  src/proxy.js        — eBird/xeno-canto+iNaturalist/Wikipedia/Nominatim
                        proxy routes + /api/birds/facts + the batch
                        /api/birds/media-check eligibility endpoint
  local-test.js       — untracked Windows dev harness (see "Local dev")
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
