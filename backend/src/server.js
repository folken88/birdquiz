import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import proxyRouter from './proxy.js';
import { DEMO_SPECIES } from './demoSpecies.js';
import { REGIONS } from './regions.js';
import {
  listTokens, listPlayers, loginPlayer,
  recordAnswer, getPlayerMasterySummary, pickSessionSpecies,
} from './db.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Reused eBird / xeno-canto / Wikipedia / geocoding proxy routes.
app.use('/api', proxyRouter);

// Demo-mode fallback species pool (used when EBIRD_API_KEY isn't set).
app.get('/api/demo-species', (_req, res) => res.json(DEMO_SPECIES));

// Supported regions for the picker (country → state/province, eBird codes).
app.get('/api/regions', (_req, res) => res.json(REGIONS));

// ── Tokens & players (casual name+token login, no password) ─────────────
app.get('/api/tokens', (_req, res) => res.json(listTokens()));

app.get('/api/players', (_req, res) => res.json(listPlayers()));

app.post('/api/players/login', (req, res) => {
  try {
    const { name, tokenId } = req.body;
    const result = loginPlayer(name, tokenId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ── Session building: weighted pick across a supplied species pool ──────
// Frontend supplies the species pool (from live eBird+taxonomy, or the
// /api/demo-species fallback) — this just does the due-for-review-weighted
// pick and mode assignment, so eBird-fetch logic isn't duplicated here.
app.post('/api/session', (req, res) => {
  const { player, speciesList, count, modes } = req.body;
  if (!player) return res.status(400).json({ error: 'player required' });
  if (!Array.isArray(speciesList) || !speciesList.length) return res.status(400).json({ error: 'speciesList required' });

  const modeList = Array.isArray(modes) && modes.length ? modes : ['sound', 'fieldmark', 'habitat'];
  const picks = pickSessionSpecies(player, speciesList, count || 10);
  const session = picks.map((sp, i) => ({ ...sp, mode: modeList[i % modeList.length] }));
  res.json({ session });
});

// ── Mastery ───────────────────────────────────────────────────────────────
app.post('/api/mastery/answer', (req, res) => {
  const { player, speciesCode, commonName, correct } = req.body;
  if (!player || !speciesCode || typeof correct !== 'boolean') {
    return res.status(400).json({ error: 'player, speciesCode, correct required' });
  }
  const result = recordAnswer(player, speciesCode, commonName, correct);
  res.json({ ok: true, ...result });
});

app.get('/api/mastery/summary', (req, res) => {
  const player = (req.query.player || '').trim();
  if (!player) return res.status(400).json({ error: 'player required' });
  res.json(getPlayerMasterySummary(player));
});

app.listen(PORT, () => console.log(`Bird Quiz backend running on :${PORT}`));
