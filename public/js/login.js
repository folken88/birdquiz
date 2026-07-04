import { Narrator } from './narrator.js';
import { Api } from './api.js';

/**
 * Renders the login screen into `container` and resolves with
 * { name, tokenId } once the player has logged in (existing player
 * resumes their mastery progress + last token; new player picks a fresh
 * token). Name is the real identity — token is a swappable attribute, so
 * re-picking a different token later never orphans progress.
 */
export async function initLogin(container, onLoggedIn) {
  const [players, tokens] = await Promise.all([Api.players(), Api.tokens()]);

  container.innerHTML = `
    <div class="screen login-screen">
      <h1>Bird Quiz</h1>
      <p class="subtitle">An audio-first bird identification &amp; knowledge game</p>
      <div id="login-choices"></div>
      <div id="login-name-step" class="hidden">
        <label for="login-name-input">Your name</label>
        <input id="login-name-input" type="text" maxlength="32" autocomplete="off" />
      </div>
    </div>
  `;

  const choicesEl = container.querySelector('#login-choices');
  const nameStepEl = container.querySelector('#login-name-step');
  const nameInputEl = container.querySelector('#login-name-input');

  const entries = players.map(p => ({ kind: 'existing', player: p }));
  entries.push({ kind: 'new' });

  const idx = await Narrator.presentChoices(
    choicesEl,
    entries,
    (e) => e.kind === 'new' ? 'New player' : `${e.player.name}, playing as ${e.player.token_label}`,
    { prompt: 'Welcome to Bird Quiz. Choose your name, or new player.' }
  );

  const chosen = entries[idx];
  if (chosen.kind === 'existing') {
    return doLogin(chosen.player.name, chosen.player.token_id);
  }
  return newPlayerFlow();

  async function newPlayerFlow() {
    choicesEl.innerHTML = '';
    nameStepEl.classList.remove('hidden');
    nameInputEl.focus();
    Narrator.speak('Type your name, then press Enter.', { priority: 'urgent' });

    const name = await new Promise(resolve => {
      nameInputEl.addEventListener('keydown', e => {
        if (e.key === 'Enter' && nameInputEl.value.trim()) resolve(nameInputEl.value.trim());
      });
    });
    nameStepEl.classList.add('hidden');

    const tokenIdx = await Narrator.presentChoices(
      choicesEl,
      tokens,
      t => t.label,
      { prompt: `Thanks, ${name}. Pick your token.` }
    );
    return doLogin(name, tokens[tokenIdx].token_id);
  }

  async function doLogin(name, tokenId) {
    const result = await Api.login(name, tokenId);
    Narrator.earcon('start');
    Narrator.speak(`Welcome, ${name}!`, { priority: 'urgent' });
    onLoggedIn({ name, tokenId: result.tokenId });
  }
}
