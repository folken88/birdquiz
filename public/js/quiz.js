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
    const codes = await Api.species(regionCode);
    const codeStr = codes.slice(0, 200).join(',');
    const taxa = await Api.taxonomy(codeStr);
    return {
      live: true,
      list: taxa.map(t => ({ code: t.speciesCode, commonName: t.comName, sciName: t.sciName })),
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
      <div id="region-step">
        <label for="region-input">Where are you birding? (city, state, or country)</label>
        <input id="region-input" type="text" autocomplete="off" />
      </div>
      <div id="quiz-choices"></div>
      <div id="quiz-status" role="status" aria-live="polite"></div>
    </div>
  `;

  const regionInput = container.querySelector('#region-input');
  const choicesEl = container.querySelector('#quiz-choices');
  const statusEl = container.querySelector('#quiz-status');

  Narrator.speak(`Welcome back, ${player.name}. Where are you birding today?`, { priority: 'urgent' });
  regionInput.focus();

  const regionCode = await new Promise(resolve => {
    regionInput.addEventListener('keydown', async e => {
      if (e.key !== 'Enter' || !regionInput.value.trim()) return;
      const matches = await Api.geoSearch(regionInput.value.trim()).catch(() => []);
      if (!matches.length) {
        Narrator.speak('No location matched. Try a different search, like a state or country name.', { priority: 'urgent' });
        return;
      }
      const idx = await Narrator.presentChoices(
        choicesEl, matches, m => m.displayName, { prompt: 'Pick your location.' }
      );
      resolve(matches[idx].regionCode);
    });
  });

  document.querySelector('#region-step').classList.add('hidden');
  statusEl.textContent = 'Loading species for your region…';
  Narrator.speak('Loading species.', { priority: 'event' });

  const pool = await resolveSpeciesPool(regionCode);
  if (!pool.live) {
    Narrator.speak('No live eBird key is configured yet, so we are playing with a demo set of common backyard birds.', { priority: 'event' });
  }

  const { session } = await Api.session(player.name, pool.list, SESSION_LENGTH, DEFAULT_MODES);

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
      const rec = await Api.recording(sp.sciName, sp.commonName).catch(() => null);
      if (rec) {
        statusEl.dataset.mode = 'sound';
        const audio = new Audio(rec.fileUrl);
        Narrator.speak('Listen to this call, then pick the species.', {
          priority: 'urgent', onEnd: () => audio.play().catch(() => {}),
        });
        await new Promise(r => audio.addEventListener('ended', r, { once: true }));
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
    choicesEl.innerHTML = '';
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'choice-btn';
    again.textContent = 'Play again';
    again.addEventListener('click', () => initQuiz(container, player));
    choicesEl.appendChild(again);
  }
}
