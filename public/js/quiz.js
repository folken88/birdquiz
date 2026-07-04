import { Narrator } from './narrator.js';
import { Api } from './api.js';

const SESSION_LENGTH = 10;
// Photo-ID is coded but left out of the default mix — this app is
// audio-first by design; a sighted/low-vision player can still get it via
// a future "include photos" toggle without any code changes here.
const DEFAULT_MODES = ['sound', 'fieldmark', 'habitat'];
const CHOICE_COUNT = 5;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function resolveSpeciesPool(regionCode) {
  try {
    // eBird returns the region list in taxonomic order (waterfowl first),
    // so slicing the front every time makes every session ducks-and-geese.
    // Shuffle the codes so the 200 we look up are a random spread of the
    // region — AND shuffle again after taxonomy, which re-sorts its output
    // back into taxonomic order (else the media-check's first-60 slice
    // re-introduces the same bias within that 200).
    const codes = shuffle(await Api.species(regionCode));
    const codeStr = codes.slice(0, 200).join(',');
    const taxa = await Api.taxonomy(codeStr);
    // eBird region lists include hybrids ("Sandhill x Common Crane"),
    // genus-level "sp." entries, slashes, and domestics — junk for a
    // learn-the-name quiz. Keep only true species (category 'species').
    const species = taxa.filter(t => t.category === 'species');
    return {
      live: true,
      list: shuffle(species.map(t => ({ code: t.speciesCode, commonName: t.comName, sciName: t.sciName }))),
    };
  } catch (err) {
    if (err.status === 503) {
      const demo = await Api.demoSpecies();
      return {
        live: false,
        list: demo.map(sp => ({ code: sp.code, commonName: sp.commonName, sciName: sp.sciName, fieldMark: sp.fieldMark, habitat: sp.habitat })),
      };
    }
    throw err;
  }
}

async function factFor(sp, kind) {
  // Demo species carry hand-written field-mark/habitat lines. Live eBird
  // species have no prose of their own, so both trivia kinds fall back to
  // the same Wikipedia summary extract for now.
  if (kind === 'fieldmark' && sp.fieldMark) return sp.fieldMark;
  if (kind === 'habitat' && sp.habitat) return sp.habitat;
  try {
    const fact = await Api.facts(sp.commonName);
    return fact.extract;
  } catch {
    return `${sp.commonName}, scientific name ${sp.sciName}.`;
  }
}

function buildChoices(correctSp, pool) {
  const others = pool.filter(sp => sp.code !== correctSp.code);
  const distractors = shuffle(others).slice(0, CHOICE_COUNT - 1);
  return shuffle([correctSp, ...distractors]);
}

export async function initQuiz(container, player) {
  container.innerHTML = `
    <div class="screen quiz-screen">
      <h1>Bird Quiz</h1>
      <p class="subtitle">Playing as ${player.name}</p>
      <div id="quiz-choices"></div>
      <div id="quiz-status" role="status" aria-live="polite"></div>
    </div>
  `;

  const choicesEl = container.querySelector('#quiz-choices');
  const statusEl = container.querySelector('#quiz-status');

  Narrator.speak(`Welcome back, ${player.name}. Where are you birding today?`, { priority: 'urgent' });

  // Region picking is a curated country → state/province drill-down (only
  // regions we can query live from eBird), so the player can never land on
  // an unsupported place. Same numbered-choice widget as everything else.
  const regions = await Api.regions();
  const countryIdx = await Narrator.presentChoices(
    choicesEl, regions, r => r.country, { prompt: 'Choose your country.' }
  );
  const country = regions[countryIdx];
  const subIdx = await Narrator.presentChoices(
    choicesEl, country.subregions, s => s.name,
    { prompt: `${country.country}. Choose your state or province.` }
  );
  const regionCode = country.subregions[subIdx].code;

  statusEl.textContent = 'Loading species for your region…';
  Narrator.speak('Loading species.', { priority: 'event' });

  const pool = await resolveSpeciesPool(regionCode);
  if (!pool.live) {
    Narrator.speak('No live eBird key is configured yet, so we are playing with a demo set of common backyard birds.', { priority: 'event' });
  }

  // A bird only qualifies as a quiz question if we verified it has at least
  // one recording AND at least one picture. The media-check returns the
  // media itself, so sound questions play what was already verified.
  // (Capped at 60 species per check — enough for a session; the full pool
  // still supplies distractor names, which need no media.)
  statusEl.textContent = 'Checking which birds have sounds and pictures…';
  Narrator.speak('Checking which birds have sounds and pictures.', { priority: 'event' });
  const { species: checked } = await Api.mediaCheck(
    pool.list.slice(0, 60).map(sp => ({ code: sp.code, commonName: sp.commonName, sciName: sp.sciName }))
  );
  const mediaByCode = new Map(checked.map(c => [c.code, c]));
  const eligible = pool.list.filter(sp => mediaByCode.get(sp.code)?.eligible);

  if (!eligible.length) {
    statusEl.textContent = 'No birds with both sound and picture data are available right now.';
    Narrator.speak('Sorry — no birds with both sound and picture data are available right now. Please try again later.', { priority: 'urgent' });
    return offerPlayAgain();
  }

  const { session } = await Api.session(player.name, eligible, SESSION_LENGTH, DEFAULT_MODES);

  let score = 0;
  let i = 0;
  Narrator.earcon('start');
  await runQuestion();

  async function runQuestion() {
    if (i >= session.length) return finishSession();
    const q = session[i];
    const sp = pool.list.find(s => s.code === q.code) || q;
    statusEl.textContent = `Question ${i + 1} of ${session.length} — score ${score}`;
    Narrator.earcon('mode');

    if (q.mode === 'sound') {
      const rec = mediaByCode.get(sp.code)?.recording
        || await Api.recording(sp.sciName, sp.commonName).catch(() => null);
      if (rec) {
        statusEl.dataset.mode = 'sound';
        await new Promise(r => Narrator.speak('Listen to this call, then pick the species.', { priority: 'urgent', onEnd: r }));
        // playClip resolves on ended, error, blocked autoplay, the length
        // cap, or the stop key — a sound question can never hang.
        await Narrator.playClip(rec.fileUrl);
      } else {
        Narrator.speak('No recording is available for this one right now, so here is a clue instead.', { priority: 'urgent' });
        const fact = await factFor(sp, 'fieldmark');
        Narrator.speak(fact, { priority: 'event' });
      }
    } else {
      const kind = q.mode === 'habitat' ? 'habitat' : 'fieldmark';
      const fact = await factFor(sp, kind);
      Narrator.speak(fact, { priority: 'urgent' });
    }

    const choices = buildChoices(sp, pool.list);
    const idx = await Narrator.presentChoices(
      choicesEl, choices, c => c.commonName, { prompt: 'Which species is it?' }
    );
    const pickedCorrect = choices[idx].code === sp.code;
    if (pickedCorrect) score++;
    Narrator.earcon(pickedCorrect ? 'correct' : 'incorrect');

    Api.answer(player.name, sp.code, sp.commonName, pickedCorrect).catch(() => {});

    const resultLine = pickedCorrect
      ? `Correct — ${sp.commonName}.`
      : `Not quite — that was a ${sp.commonName}.`;
    i++;
    Narrator.speak(resultLine, { priority: 'event', onEnd: runQuestion });
  }

  function finishSession() {
    statusEl.textContent = `Session complete — ${score} of ${session.length} correct.`;
    Narrator.speak(`Session complete. You got ${score} out of ${session.length} correct.`, { priority: 'urgent' });
    return offerPlayAgain();
  }

  // Numbered choice like everything else — a bare click-only button would be
  // invisible to the digit-key input idiom blind players rely on.
  async function offerPlayAgain() {
    await Narrator.presentChoices(choicesEl, ['Play again'], l => l);
    initQuiz(container, player);
  }
}
