import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, 'birdquiz.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS tokens (
    token_id     TEXT PRIMARY KEY,
    label        TEXT NOT NULL,
    bird_species TEXT,
    image_path   TEXT NOT NULL,
    sort_order   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS players (
    name       TEXT PRIMARY KEY,
    token_id   TEXT NOT NULL REFERENCES tokens(token_id),
    created_at TEXT NOT NULL,
    last_seen  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mastery (
    player_name  TEXT NOT NULL REFERENCES players(name),
    species_code TEXT NOT NULL,
    common_name  TEXT,
    seen         INTEGER NOT NULL DEFAULT 0,
    correct      INTEGER NOT NULL DEFAULT 0,
    streak       INTEGER NOT NULL DEFAULT 0,
    last_seen    TEXT,
    due_score    REAL NOT NULL DEFAULT 1.0,
    PRIMARY KEY (player_name, species_code)
  );
`);

// Placeholder animal tokens (staged from the Foundry media share) — real
// per-bird-species token art replaces these later by updating image_path,
// no schema change needed.
const PLACEHOLDER_TOKENS = [
  ['axolotl', 'Axolotl', 'axolotl.webp'],
  ['gibbon', 'Gibbon', 'gibbon.webp'],
  ['guenon', 'Guenon Monkey', 'guenon.webp'],
  ['siamang', 'Siamang', 'siamang.webp'],
  ['crested-macaque', 'Crested Macaque', 'crested-macaque.webp'],
  ['jungle-monkey', 'Jungle Monkey', 'jungle-monkey.webp'],
  ['wild-boar', 'Wild Boar', 'wild-boar.webp'],
  ['yak', 'Yak', 'yak.webp'],
  ['lioness', 'Lioness', 'lioness.webp'],
  ['monk-seal', 'Monk Seal', 'monk-seal.webp'],
  ['hawk', 'Hawk', 'hawk.webp'],
  ['great-white-shark', 'Great White Shark', 'great-white-shark.webp'],
  ['humpback-whale', 'Humpback Whale', 'humpback-whale.webp'],
  ['crocodile', 'Crocodile', 'crocodile.webp'],
  ['thylacine', 'Thylacine', 'thylacine.webp'],
  ['silly-goat', 'Silly Goat', 'silly-goat.webp'],
];

const seedToken = db.prepare(`
  INSERT INTO tokens (token_id, label, bird_species, image_path, sort_order)
  VALUES (?, ?, NULL, ?, ?)
  ON CONFLICT(token_id) DO NOTHING
`);
const seedTx = db.transaction(() => {
  PLACEHOLDER_TOKENS.forEach(([id, label, file], i) => {
    seedToken.run(id, label, `/tokens/${file}`, i);
  });
});
seedTx();

// ── Tokens ──────────────────────────────────────────────────────────────
export function listTokens() {
  return db.prepare('SELECT * FROM tokens ORDER BY sort_order').all();
}

// ── Players (name is the identity; token is a swappable attribute) ──────
export function listPlayers() {
  return db.prepare(`
    SELECT p.name, p.token_id, p.last_seen, t.label AS token_label, t.image_path AS token_image
    FROM players p JOIN tokens t ON t.token_id = p.token_id
    ORDER BY p.last_seen DESC
  `).all();
}

export function loginPlayer(name, tokenId) {
  name = String(name).trim().slice(0, 32);
  if (!name) throw new Error('name required');
  const token = db.prepare('SELECT * FROM tokens WHERE token_id = ?').get(tokenId);
  if (!token) throw new Error('invalid token');

  const now = new Date().toISOString();
  const existing = db.prepare('SELECT * FROM players WHERE name = ?').get(name);
  if (existing) {
    db.prepare('UPDATE players SET token_id = ?, last_seen = ? WHERE name = ?').run(tokenId, now, name);
  } else {
    db.prepare('INSERT INTO players (name, token_id, created_at, last_seen) VALUES (?, ?, ?, ?)').run(name, tokenId, now, now);
  }
  return { name, tokenId, token, isNew: !existing };
}

// ── Mastery / spaced-repetition-lite ─────────────────────────────────────
const getMasteryRow = db.prepare('SELECT * FROM mastery WHERE player_name = ? AND species_code = ?');
const upsertMastery = db.prepare(`
  INSERT INTO mastery (player_name, species_code, common_name, seen, correct, streak, last_seen, due_score)
  VALUES (@player_name, @species_code, @common_name, @seen, @correct, @streak, @last_seen, @due_score)
  ON CONFLICT(player_name, species_code) DO UPDATE SET
    common_name = excluded.common_name,
    seen        = excluded.seen,
    correct     = excluded.correct,
    streak      = excluded.streak,
    last_seen   = excluded.last_seen,
    due_score   = excluded.due_score
`);

export function recordAnswer(playerName, speciesCode, commonName, correct) {
  const row = getMasteryRow.get(playerName, speciesCode);
  const now = new Date().toISOString();
  const seen = (row?.seen || 0) + 1;
  const correctCount = (row?.correct || 0) + (correct ? 1 : 0);
  const streak = correct ? (row?.streak || 0) + 1 : 0;
  const prevDue = row?.due_score ?? 1.0;
  // Correct answers push a species further out (less due); misses pull it
  // back in soon. Not a full SM-2 — just enough to resurface what's shaky.
  const due_score = correct
    ? Math.max(prevDue * 0.45, 0.15)
    : Math.min(prevDue * 1.9 + 0.4, 6);

  upsertMastery.run({
    player_name: playerName,
    species_code: speciesCode,
    common_name: commonName || row?.common_name || null,
    seen, correct: correctCount, streak,
    last_seen: now,
    due_score,
  });
  return { seen, correct: correctCount, streak, due_score };
}

export function getMastery(playerName, speciesCode) {
  return getMasteryRow.get(playerName, speciesCode) || null;
}

export function getPlayerMasterySummary(playerName) {
  return db.prepare(`
    SELECT species_code, common_name, seen, correct, streak, due_score
    FROM mastery WHERE player_name = ? ORDER BY due_score DESC
  `).all(playerName);
}

/**
 * Weighted-random sample (Efraimidis–Spirakis A-Res) without replacement.
 * Species the player misses more (higher due_score) are more likely to be
 * picked; species never seen default to weight 1.0 so they surface too.
 */
export function pickSessionSpecies(playerName, speciesList, count) {
  const weighted = speciesList.map(sp => {
    const row = getMasteryRow.get(playerName, sp.code);
    const weight = row?.due_score ?? 1.0;
    const key = Math.random() ** (1 / weight);
    return { ...sp, key };
  });
  weighted.sort((a, b) => b.key - a.key);
  return weighted.slice(0, Math.min(count, weighted.length)).map(({ key, ...sp }) => sp);
}

export default db;
