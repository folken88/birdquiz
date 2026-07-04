# Audio-First Bird Quiz — Design Spec

**Date:** 2026-07-04
**Status:** Approved by Tobias, ready for implementation planning.

## Vision

A fun, engaging, and genuinely educational audio-focused game for bird
identification and knowledge. Challenging enough to hold the interest of
real birders/ornithologists, welcoming enough that a total beginner can
start their birdwatching journey through it. Audio-first and blind/screen-reader
accessible from the ground up — not a visual game with accessibility bolted on.

## Background

`bird.folkengames.com` ("Bird Fan") already exists: a Node/Express backend
proxying eBird (species lists), xeno-canto (recordings), Wikipedia (photos),
and Nominatim (geocoding), with a vanilla-JS sight-ID/sound-ID quiz frontend.
It has ordinary ARIA-live-region accessibility but no deliberate blind-access
design. It has no git history (canonical copy was whatever ran on the
server) and currently runs with no eBird/xeno-canto keys configured (demo mode).

Meanwhile, the poker/dungeon game (`folken88/poker`) has spent months of real
blind-playtester feedback (Josh, via VoiceOver) building out a genuine
blind-mode architecture: a `SpeechSynthesisUtterance` narrator as the primary
channel, numbered menus with digit-key selection instead of free text,
a single sacred "stop talking" key, adjustable narrator rate/volume, earcons,
and hard-won lessons about verbosity and interrupt ordering (see
`poker-josh-feedback` notes). This project reuses those lessons rather than
re-learning them.

**Decision:** rebuild clean in the new `folken88/birdquiz` repo (previously
empty). The old server's proxy layer is good and gets reused; the old
frontend does not carry forward as the base.

## Audience & design center

Primary: blind/screen-reader users, audio-first. The experience is designed
around listening and non-visual input from the start. Sighted play still
works (numbered choice lists render as normal buttons; an optional photo-ID
mode exists for sighted/low-vision players) but is not the design center.

## Quiz modes

Every round draws from one region-specific species pool (via the existing
eBird region-search flow) and mixes all of the following question types, so
a player drills the same species multiple ways in one session:

1. **Sound-ID** — play a xeno-canto call/song clip, guess the species.
   Already audio-native; needs the new numbered-choice answer mechanism.
2. **Spoken field-mark trivia** — narrator describes the bird verbally
   (size, color pattern, behavior, voice character) instead of showing a
   photo. This is the audio-first replacement for photo-ID.
3. **Habitat/range/behavior trivia** — short factual questions built from
   eBird taxonomy + Wikipedia summary data ("which of these winters in
   Illinois").
4. **Photo-ID** — kept as a visual-optional mode for sighted/low-vision
   players; skipped entirely in a blind session.

Difficulty scales with the player: novice sessions favor common/likely
species for the region and easier field marks; advanced sessions pull in
rarer regional species and finer distinguishing detail — this is what makes
the same game work for a first-timer and a working ornithologist.

## Answering: numbered choice, not free text

The narrator reads up to 5–6 candidate species as a numbered list; a digit
key answers immediately. This is the direct lesson from poker's spellbook/menu
pattern — free-text answering with autocomplete was hard to use blind, numbered
menus were not. (A future "expert" free-text mode is a possible later addition,
not part of this build.)

## Narrator & audio architecture

Adapted from poker's `blindMode.js`, simplified because this is single-player
and turn-paced (no live multiplayer combat, no ducking controller needed):

- `SpeechSynthesisUtterance` narrator is the primary channel for questions,
  choices, results, and facts — not ARIA-live-and-hope.
- One sacred, global "stop talking" key, never bound to any game feature
  (poker's hard lesson: a feature landing on that key silently breaks
  everything layered on top of it).
- Adjustable narrator rate and volume, independent of any clip/sound volume.
- Short earcons (tones, not speech) for correct/incorrect/mode-change.
- Terse by default: announce outcomes and the one relevant fact, not an
  exhaustive dump. Default toward less narration, not more.

## Player identity: name + token login

- **`players` table**: `name` (primary identity — continuity hangs on this,
  not a composite key), `token_id`, `created_at`, `last_seen`.
- **`tokens` table**: `token_id`, `bird_species` (nullable for now),
  `image_path`.
- **Login flow**: fully casual, no password — pick your name (existing or
  new) and pick a token from the available set. Picking an existing name
  pre-highlights your last-used token and loads your mastery progress; you
  can still swap tokens. Both the name list and the token grid are
  narrator-read, numbered, and digit-key selectable, same as in-game answers.
- **Token art**: placeholder set of 16 general animal tokens has been staged
  at `/mnt/fast/apps/stacks/birdquiz-assets/tokens/` on the TrueNAS (pulled
  from the Foundry media share — axolotl, gibbon, guenon, siamang, crested
  macaque, jungle monkey, wild boar, yak, lioness, monk seal, hawk, great
  white shark, humpback whale, crocodile, thylacine, silly goat). Real
  per-bird-species token art replaces these later — since `image_path` lives
  on the `tokens` row, swapping art is a data update, not a schema or code
  change.

## Progress model: per-species mastery, not just high scores

The existing flat `highscores.json` can't support this — needs a small
SQLite DB (same pattern as poker/dungeon's content-DB precedent):

- **`mastery` table**: `(player_name, species_code)` → seen count, correct
  count, last_seen, a due-for-review score. Species the player misses more
  resurface more often (lightweight spaced-repetition, not a full SM-2
  implementation).
- High scores / session scoring can still exist as a secondary, session-level
  view on top of this — the mastery table is the actual learning-tool data.

## Backend: reuse the existing proxy layer

Keep wholesale: the eBird species/region proxy, the xeno-canto recording
proxy (including the audio streaming passthrough — xeno-canto requires auth
as of Oct 2025), the Wikipedia thumbnail proxy, and the Nominatim geocoding
flow. All are working and this app has the same "no API keys go to the
client" requirement the old app already satisfied.

**New:** a facts-sourcing step for field-mark/habitat trivia. No existing
proxy returns prose. Plan is to pull Wikipedia's summary-extract API
(already partially proxied for photos) and trim to a couple of spoken
sentences per species. This is the one piece without a direct poker
precedent — prose quality/consistency across species is a real open risk,
not a solved problem, and should get explicit attention (and possibly hand
review/curation for a starter species set) during implementation.

## Deployment

New stack in `folken88/birdquiz`, deployed similarly to poker's
testbed → prod flow: its own compose stack, own port, cut over
`bird.folkengames.com` once solid. eBird/xeno-canto API keys still need to
be supplied for the app to run outside demo mode (pre-existing gap, not new).

## Explicit non-goals for this build

- No password/PIN on login (deferred if ever needed).
- No full SM-2/Anki-grade spaced repetition — a simpler due-for-review score
  is enough to start.
- No free-text "expert mode" answering yet.
- No multiplayer/concurrent-session handling (poker-style) — single player
  per session.
