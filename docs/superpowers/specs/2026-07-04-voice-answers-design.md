# Voice Answers (Speech-to-Text) — Design

**Date:** 2026-07-04
**Status:** Approved by Tobias

## Purpose

Let a player answer a quiz question by *saying the bird's name* — including
buzzing in early while the recording is still playing — instead of waiting
for and using the numbered menu. Voice is additive: digit keys and buttons
keep working exactly as before, and browsers without speech support see no
change at all.

**Design ruling (Tobias):** the point of the game is learning the names.
Credit requires saying all or part of the *actual species name*. There is
no semantic matching — "the red one" earns nothing. No LLM is involved.

## Interaction model

- **Push-to-talk on `V`** (hold or tap; recognition auto-stops on silence).
  Chosen over an open mic so the game's own narrator/bird audio can never
  trigger a false answer on speaker setups, and the mic is never open
  without the player asking.
- `V` is live from the moment a question starts, **including during the
  bird clip** — pressing it stops the clip and narrator (same stop path as
  `S`) and opens the mic. This also delivers the buzz-in-early ability that
  was previously missing entirely.
- `S` stays sacred: it stops speech, clips, AND an in-progress listen.
- Digit keys remain fully functional at all times. Voice never replaces
  the numbered-choice idiom — it sits beside it.
- Scope: quiz answer choices only. Login and region screens are untouched.

## Speech engine

Browser-native Web Speech API (`SpeechRecognition` /
`webkitSpeechRecognition`), same family as the `SpeechSynthesis` narrator
the app is already built on. No backend changes, no keys, no cost.

- Feature-detect at startup; if absent (Firefox), the voice feature simply
  does not exist — no broken UI, no mention of `V` in prompts.
- First use triggers the browser mic-permission dialog; the narrator
  announces "your browser will ask for microphone permission" beforehand so
  a blind player isn't surprised by a silent modal.
- `lang: 'en-US'`, non-continuous, interim results off, maxAlternatives 5
  (alternatives all get run through the matcher).

## Matching (the important part)

Closed-set fuzzy matching of the transcript against the **current
question's choice names only** — never an open vocabulary, never semantic.

Normalization: lowercase, strip punctuation/hyphens, collapse whitespace.
For each transcript alternative vs each choice name:

1. **Exact / containment:** normalized transcript equals the full name, or
   the full name appears within the transcript ("that's a mourning dove").
2. **Partial name:** every spoken word matches *some* word of the choice
   name (word-level, so "cardinal" hits "Northern Cardinal"). Counts only
   if exactly ONE choice matches — if the player says "woodpecker" and two
   woodpeckers are among the choices, that is ambiguous → not confident.
3. **Garble tolerance:** word-level comparison uses edit distance
   (Damerau–Levenshtein, threshold scaled to word length, ~1 edit per 4
   chars) plus a compound-split pass so "nut hatch" ≈ "nuthatch",
   "blue j" ≈ "blue jay", "junko" ≈ "junco".

Outcome:
- **Confident single match** → submitted immediately, identical to pressing
  that choice's number (same scoring, mastery recording, earcons).
- **Anything else** (no match, ambiguous, empty transcript, recognition
  error) → soft earcon + spoken "Didn't catch that — try again, or press a
  number." **No penalty**, question stays open. Mis-transcriptions must
  never charge the player a miss.

## Audio/earcon feedback

- New earcons: `listen-start` (mic open) and `listen-end` (mic closed) so a
  blind player always knows the mic state.
- While listening, the narrator is silenced (it must not talk over the
  player, and the mic must not hear the narrator).

## Component layout

- **`public/js/voice.js` (new, ~100–130 lines):** mic lifecycle + matcher.
  - `Voice.available` — feature-detect boolean.
  - `Voice.listen()` → Promise<string[]> of transcript alternatives
    (empty on error/abort). Owns the recognition object, one listen at a
    time, hard 8s cap.
  - `Voice.match(alternatives, names)` → index or -1. Pure function,
    exported separately so it is unit-testable without a mic.
- **`narrator.js`:** `presentChoices` gains an optional
  `{ voiceNames }` opt. When set and `Voice.available`, a `V` keydown
  handler stops clip/speech, plays `listen-start`, awaits `Voice.listen()`,
  runs `Voice.match`, and either `finish(idx)`es or speaks the retry line.
  Narrator also exposes the two new earcons.
- **`quiz.js`:** passes `voiceNames: choices.map(c => c.commonName)` to the
  answer `presentChoices` call, and mentions `V` once in the first
  question's prompt ("…or hold V and say the name"). One-line change plus
  prompt copy.
- **Backend:** no changes.

## Error handling

| Failure | Behavior |
|---|---|
| No `SpeechRecognition` in browser | Feature absent; no `V` handler bound, no prompt copy about voice |
| Mic permission denied | Narrator: "Microphone was blocked — voice answers are off. Number keys still work." Voice disables for the session |
| Recognition error / no speech / 8s cap | Same as not-confident: retry line, no penalty |
| `V` pressed mid-listen | Ignored (one listen at a time) |
| `S` pressed mid-listen | Recognition aborted, mic closed, `listen-end` earcon |

## Testing

- `Voice.match` exercised against a table of known garbles and ambiguity
  cases (junko→junco, nut hatch→nuthatch, blue j→blue jay, morning
  dove→mourning dove, "woodpecker" with two woodpeckers present → -1,
  "the red one" → -1).
- Automated browser playthrough verifying digit-answer path is unchanged
  and that a stubbed `Voice.listen` (injected transcript) answers a
  question end-to-end.
- Real-microphone testing is manual (Tobias), on bird.folkengames.com.
