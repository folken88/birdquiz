// Narrator — the audio-first core of Bird Quiz.
//
// Adapted from the poker/dungeon game's blindMode.js, distilled to what a
// single-player, turn-paced quiz actually needs (no live-multiplayer ducking
// controller). Carries forward the hard-won lessons from a year of real
// blind playtesting there:
//   - SpeechSynthesis is the PRIMARY channel, not an ARIA-live afterthought.
//   - 'urgent' priority cancels the queue — use it rarely, never mid-report.
//   - Rate/volume must be independently adjustable and persisted.
//   - Exactly ONE global "stop talking" key, and it must NEVER also be a
//     game feature (a prior app in this family learned that the hard way).
//   - Numbered menus + digit-key selection beat free-text input for blind
//     play, every time it was tried.

const STORAGE_KEY = 'birdquiz.narrator.prefs';
const STOP_KEY = 's';

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const p = raw ? JSON.parse(raw) : {};
    return { rate: p.rate ?? 1.0, volume: p.volume ?? 1.0 };
  } catch { return { rate: 1.0, volume: 1.0 }; }
}
function savePrefs(prefs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

const prefs = loadPrefs();
let queue = [];
let speaking = false;
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

// Chrome (and Safari) have a long-standing bug: calling speechSynthesis
// .cancel() and then .speak() in the same tick makes the new utterance race
// through — often gabbling its first few words. So all cancels go through
// cancelSpeech(), which stamps a short guard window, and pump() waits out
// that window before starting the next utterance.
let resumeAt = 0;
function cancelSpeech() {
  speechSynthesis.cancel();
  resumeAt = performance.now() + 150;
}

function pump() {
  if (speaking || !queue.length) return;
  const wait = resumeAt - performance.now();
  if (wait > 0) { setTimeout(pump, wait); return; } // don't rush a post-cancel utterance
  const { text, onEnd } = queue.shift();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = prefs.rate;
  utter.volume = prefs.volume;
  speaking = true;
  utter.onend = utter.onerror = () => { speaking = false; onEnd?.(); pump(); };
  speechSynthesis.speak(utter);
}

/**
 * priority: 'urgent' (stop everything and speak now), 'event' (queue,
 * spoken in order), 'ambient' (drop silently if the narrator is busy).
 */
function speak(text, { priority = 'event', onEnd } = {}) {
  if (!text) return;
  if (priority === 'urgent') {
    queue = [];
    cancelSpeech();
    speaking = false;
    queue.push({ text, onEnd });
    pump();
    return;
  }
  if (priority === 'ambient' && (speaking || queue.length)) return;
  queue.push({ text, onEnd });
  pump();
}

function stopAll() {
  queue = [];
  cancelSpeech();
  speaking = false;
  stopClip();
}

// Non-speech audio (bird recordings) also routes through the narrator so
// the sacred stop key silences it like everything else. One clip at a time;
// capped so a minutes-long field recording can't stall a question.
let currentClip = null;
function playClip(url, { maxSeconds = 20 } = {}) {
  return new Promise(resolve => {
    stopClip();
    const audio = new Audio(url);
    audio.volume = prefs.volume;
    let timer = null;
    const done = () => {
      if (timer) clearTimeout(timer);
      audio.pause();
      if (currentClip === audio) currentClip = null;
      resolve();
    };
    audio.__stop = done;
    currentClip = audio;
    audio.addEventListener('ended', done, { once: true });
    audio.addEventListener('error', done, { once: true });
    audio.play().then(() => { timer = setTimeout(done, maxSeconds * 1000); }).catch(done);
  });
}
function stopClip() {
  currentClip?.__stop?.();
}

// Short WebAudio earcons — a tone, not more speech to sit through.
const EARCONS = {
  correct: [{ f: 660, d: 0.09 }, { f: 880, d: 0.14 }],
  incorrect: [{ f: 320, d: 0.16 }],
  mode: [{ f: 500, d: 0.06 }, { f: 620, d: 0.06 }],
  start: [{ f: 440, d: 0.08 }, { f: 550, d: 0.08 }, { f: 660, d: 0.12 }],
};
function earcon(name) {
  const seq = EARCONS[name];
  if (!seq) return;
  const ctx = getAudioCtx();
  let t = ctx.currentTime;
  for (const { f, d } of seq) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = f;
    osc.type = 'sine';
    gain.gain.setValueAtTime(prefs.volume * 0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + d);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + d);
    t += d;
  }
}

function setRate(v) { prefs.rate = Math.min(2, Math.max(0.5, v)); savePrefs(prefs); }
function nudgeRate(delta) { setRate(prefs.rate + delta); }
function setVolume(v) { prefs.volume = Math.min(1, Math.max(0, v)); savePrefs(prefs); }
function nudgeVolume(delta) { setVolume(prefs.volume + delta); }

let globalKeysBound = false;
function bindGlobalKeys() {
  if (globalKeysBound) return;
  globalKeysBound = true;
  document.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    // S IS SACRED. Never bind a feature to it — it must always just stop
    // the narrator, on every screen, no exceptions.
    if (k === STOP_KEY) { stopAll(); return; }
    if (e.key === '[') { nudgeRate(-0.1); speak('rate down', { priority: 'ambient' }); }
    if (e.key === ']') { nudgeRate(0.1); speak('rate up', { priority: 'ambient' }); }
    if (e.key === '-') { nudgeVolume(-0.1); speak('quieter', { priority: 'ambient' }); }
    if (e.key === '=') { nudgeVolume(0.1); speak('louder', { priority: 'ambient' }); }
  });
}

const PAGE_SIZE = 9; // items per page when a list is long enough to paginate

/**
 * Render a numbered choice list into `container` (real clickable buttons for
 * sighted/mouse use) AND speak it as a numbered list, resolving as soon as
 * either a button is clicked or the matching digit key is pressed. This is
 * the one answer/selection pattern used everywhere in the app — poker's
 * lesson was that a single numbered-menu idiom beats bespoke input widgets
 * for blind play.
 *
 * Short lists (≤10 items): keys 1-9 pick, 0 picks a 10th item — unchanged.
 * Long lists (>10 items): paginated at 9 per page; keys 1-9 pick within the
 * page and 0 advances to the next page (wrapping), so every item stays
 * reachable by keyboard (fixes the old "items 11+ unreachable" gap).
 *
 * `labelFn(item, index)` returns the spoken+visible label for each item.
 * Resolves with the picked index into the ORIGINAL items array, or -1 if
 * Escape is pressed and `escapeCancels` is true.
 */
function presentChoices(container, items, labelFn, { prompt = '', escapeCancels = false } = {}) {
  return new Promise(resolve => {
    const paginated = items.length > 10;
    const pageCount = paginated ? Math.ceil(items.length / PAGE_SIZE) : 1;
    let page = 0;

    function render() {
      container.innerHTML = '';
      const list = document.createElement('div');
      list.className = 'choice-list';

      const start = paginated ? page * PAGE_SIZE : 0;
      const end = paginated ? Math.min(start + PAGE_SIZE, items.length) : items.length;
      const pageLines = [];
      for (let i = start; i < end; i++) {
        const slot = paginated ? (i - start) + 1 : i + 1; // 1-based key on this page
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'choice-btn';
        btn.textContent = `${slot}. ${labelFn(items[i], i)}`;
        btn.addEventListener('click', () => finish(i));
        list.appendChild(btn);
        pageLines.push(`${slot}. ${labelFn(items[i], i)}`);
      }

      let moreBtn = null;
      if (paginated) {
        moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'choice-btn choice-more';
        moreBtn.textContent = '0. More';
        moreBtn.addEventListener('click', nextPage);
        list.appendChild(moreBtn);
      }
      container.appendChild(list);

      const header = paginated ? `${prompt} Page ${page + 1} of ${pageCount}.` : prompt;
      const tail = paginated ? ' 0. More.' : '';
      speak(`${header} ${pageLines.join('. ')}${tail}`.trim(), { priority: 'urgent' });
    }

    function nextPage() {
      page = (page + 1) % pageCount;
      render();
    }

    const handler = e => {
      if (e.key >= '1' && e.key <= '9') {
        const slot = Number(e.key) - 1; // 0-based within current page
        const idx = (paginated ? page * PAGE_SIZE : 0) + slot;
        const pageEnd = paginated ? Math.min(page * PAGE_SIZE + PAGE_SIZE, items.length) : items.length;
        if (idx < pageEnd) finish(idx);
      } else if (e.key === '0') {
        if (paginated) nextPage();
        else if (items.length >= 10) finish(9);
      } else if (e.key === 'Escape' && escapeCancels) {
        finish(-1);
      }
    };
    document.addEventListener('keydown', handler);
    function finish(idx) {
      document.removeEventListener('keydown', handler);
      // Silence the option-reading the moment a choice is made — the player
      // has decided, so don't keep listing the rest. (Whatever the caller
      // speaks next goes through the post-cancel guard, so it won't rush.)
      stopAll();
      resolve(idx);
    }

    render();
  });
}

export const Narrator = {
  speak, stopAll, earcon, playClip, setRate, nudgeRate, setVolume, nudgeVolume,
  bindGlobalKeys, presentChoices,
  get rate() { return prefs.rate; },
  get volume() { return prefs.volume; },
};
