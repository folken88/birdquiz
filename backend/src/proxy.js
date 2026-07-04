// Reused from the old bird.folkengames.com app's server.js: eBird species/
// recent-observation lookups, xeno-canto recording + audio streaming proxy,
// Wikipedia thumbnails, and Nominatim geocoding. All sensitive keys stay
// server-side. New in this app: /api/birds/facts (Wikipedia summary extract,
// trimmed for spoken trivia).
import { Router } from 'express';

const EBIRD_KEY = process.env.EBIRD_API_KEY || '';
const XC_KEY = process.env.XC_API_KEY || '';

const cache = new Map();
const TTL = {
  species: 60 * 60 * 1000,
  recent: 30 * 60 * 1000,
  recording: 24 * 60 * 60 * 1000,
  image: 24 * 60 * 60 * 1000,
  geo: 24 * 60 * 60 * 1000,
  facts: 24 * 60 * 60 * 1000,
};

function cached(key, ttl, fn) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < ttl) return Promise.resolve(entry.data);
  return fn().then(data => { cache.set(key, { data, ts: Date.now() }); return data; });
}

async function fetchJSON(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': 'BirdQuiz/1.0 (folkengames.com/bird)', ...headers } });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json();
}

const US_STATES = {
  'alabama':'US-AL','alaska':'US-AK','arizona':'US-AZ','arkansas':'US-AR',
  'california':'US-CA','colorado':'US-CO','connecticut':'US-CT','delaware':'US-DE',
  'florida':'US-FL','georgia':'US-GA','hawaii':'US-HI','idaho':'US-ID',
  'illinois':'US-IL','indiana':'US-IN','iowa':'US-IA','kansas':'US-KS',
  'kentucky':'US-KY','louisiana':'US-LA','maine':'US-ME','maryland':'US-MD',
  'massachusetts':'US-MA','michigan':'US-MI','minnesota':'US-MN','mississippi':'US-MS',
  'missouri':'US-MO','montana':'US-MT','nebraska':'US-NE','nevada':'US-NV',
  'new hampshire':'US-NH','new jersey':'US-NJ','new mexico':'US-NM','new york':'US-NY',
  'north carolina':'US-NC','north dakota':'US-ND','ohio':'US-OH','oklahoma':'US-OK',
  'oregon':'US-OR','pennsylvania':'US-PA','rhode island':'US-RI','south carolina':'US-SC',
  'south dakota':'US-SD','tennessee':'US-TN','texas':'US-TX','utah':'US-UT',
  'vermont':'US-VT','virginia':'US-VA','washington':'US-WA','west virginia':'US-WV',
  'wisconsin':'US-WI','wyoming':'US-WY','district of columbia':'US-DC',
};
const CA_PROVINCES = {
  'alberta':'CA-AB','british columbia':'CA-BC','manitoba':'CA-MB','new brunswick':'CA-NB',
  'newfoundland and labrador':'CA-NL','northwest territories':'CA-NT','nova scotia':'CA-NS',
  'nunavut':'CA-NU','ontario':'CA-ON','prince edward island':'CA-PE','quebec':'CA-QC',
  'saskatchewan':'CA-SK','yukon':'CA-YT',
};
const AU_STATES = {
  'new south wales':'AU-NSW','victoria':'AU-VIC','queensland':'AU-QLD',
  'western australia':'AU-WA','south australia':'AU-SA','tasmania':'AU-TAS',
  'australian capital territory':'AU-ACT','northern territory':'AU-NT',
};
const GB_COUNTRIES = { 'england':'GB-ENG','scotland':'GB-SCT','wales':'GB-WLS','northern ireland':'GB-NIR' };

function nominatimToEbird(addr) {
  const cc = (addr.country_code || '').toUpperCase();
  const state = (addr.state || '').toLowerCase();
  if (cc === 'US' && US_STATES[state]) return US_STATES[state];
  if (cc === 'CA' && CA_PROVINCES[state]) return CA_PROVINCES[state];
  if (cc === 'AU' && AU_STATES[state]) return AU_STATES[state];
  if (cc === 'GB' && GB_COUNTRIES[state]) return GB_COUNTRIES[state];
  return cc || null;
}

const router = Router();

router.get('/geo/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  try {
    const key = `geo:${q.toLowerCase()}`;
    const results = await cached(key, TTL.geo, async () => {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=6`;
      const data = await fetchJSON(url);
      return data.map(item => ({
        displayName: item.display_name,
        shortName: item.name || item.display_name.split(',')[0].trim(),
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        regionCode: nominatimToEbird(item.address || {}),
        countryCode: (item.address?.country_code || '').toUpperCase(),
      })).filter(r => r.regionCode);
    });
    res.json(results);
  } catch (err) {
    console.error('Geo search error:', err.message);
    res.status(500).json({ error: 'Geocoding failed' });
  }
});

router.get('/birds/species', async (req, res) => {
  if (!EBIRD_KEY) return res.status(503).json({ error: 'no_api_key', message: 'eBird API key not configured — running in demo mode.' });
  const region = (req.query.region || '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (!region) return res.status(400).json({ error: 'region required' });
  try {
    const key = `species:${region}`;
    const data = await cached(key, TTL.species, () =>
      fetchJSON(`https://api.ebird.org/v2/product/spplist/${region}`, { 'X-eBirdApiToken': EBIRD_KEY })
    );
    res.json(data);
  } catch (err) {
    console.error('eBird species error:', err.message);
    res.status(500).json({ error: 'eBird request failed', message: err.message });
  }
});

router.get('/birds/taxonomy', async (req, res) => {
  if (!EBIRD_KEY) return res.status(503).json({ error: 'no_api_key' });
  const codes = (req.query.codes || '').replace(/[^a-z0-9,]/g, '');
  if (!codes) return res.status(400).json({ error: 'codes required' });
  try {
    const key = `tax:${codes}`;
    const data = await cached(key, TTL.species, () =>
      fetchJSON(`https://api.ebird.org/v2/ref/taxonomy/ebird?species=${codes}&fmt=json`, { 'X-eBirdApiToken': EBIRD_KEY })
    );
    res.json(data);
  } catch (err) {
    console.error('eBird taxonomy error:', err.message);
    res.status(500).json({ error: 'eBird taxonomy failed', message: err.message });
  }
});

// Recording lookup: xeno-canto v3 when a key is configured (better-curated,
// song/call typed), falling back to iNaturalist's keyless public API
// (research-grade observations with openly licensed sounds) so demo mode
// still gets real bird audio with zero keys configured.
async function findXCRecording(sciName, comName) {
  if (!XC_KEY) return null;
  const xcBase = 'https://xeno-canto.org/api/3/recordings';
  let queries = [];
  if (sciName) {
    const parts = sciName.split(' ');
    if (parts.length >= 2) {
      queries.push(`gen:"${parts[0]}" sp:"${parts[1]}" q:A type:song`);
      queries.push(`gen:"${parts[0]}" sp:"${parts[1]}" q:A`);
    }
  }
  if (comName) queries.push(`en:"${comName}" q:A`);
  for (const q of queries) {
    const url = `${xcBase}?query=${encodeURIComponent(q)}&key=${XC_KEY}&per_page=10`;
    const data = await fetchJSON(url).catch(() => null);
    if (!data?.recordings?.length) continue;
    const pool = data.recordings.slice(0, Math.min(5, data.recordings.length));
    const r = pool[Math.floor(Math.random() * pool.length)];
    return {
      id: r.id, fileUrl: `/api/birds/audio/${r.id}`, type: r.type, quality: r.q,
      location: [r.loc, r.cnt].filter(Boolean).join(', '), recorder: r.rec, license: r.lic,
      xcUrl: `https://xeno-canto.org/${r.id}`,
    };
  }
  return null;
}

async function findINatRecording(sciName, comName) {
  const name = sciName || comName;
  if (!name) return null;
  const url = 'https://api.inaturalist.org/v1/observations?' + new URLSearchParams({
    taxon_name: name, sounds: 'true', quality_grade: 'research', per_page: '10',
  });
  const data = await fetchJSON(url).catch(() => null);
  if (!data?.results?.length) return null;
  // Only openly licensed sounds (license_code unset = all rights reserved).
  const sounds = data.results.flatMap(obs =>
    (obs.sounds || [])
      .filter(s => s.license_code && s.file_url)
      .map(s => ({ sound: s, obs }))
  );
  if (!sounds.length) return null;
  const { sound, obs } = sounds[Math.floor(Math.random() * Math.min(5, sounds.length))];
  return {
    id: `inat-${sound.id}`, fileUrl: sound.file_url, type: 'recording', quality: obs.quality_grade,
    location: obs.place_guess || '', recorder: obs.user?.login || '', license: sound.license_code,
    xcUrl: obs.uri || `https://www.inaturalist.org/observations/${obs.id}`,
  };
}

function findRecording(sciName, comName) {
  const cacheKey = `rec:${(sciName || comName).toLowerCase()}`;
  return cached(cacheKey, TTL.recording, async () =>
    (await findXCRecording(sciName, comName)) || (await findINatRecording(sciName, comName))
  );
}

function findImage(name) {
  const key = `wiki:${name.toLowerCase()}`;
  return cached(key, TTL.image, async () => {
    for (const variant of [name, name.toLowerCase()]) {
      const url = `https://en.wikipedia.org/w/api.php?` + new URLSearchParams({
        action: 'query', titles: variant, prop: 'pageimages', format: 'json',
        pithumbsize: '700', piprop: 'thumbnail', redirects: '1',
      });
      const data = await fetchJSON(url);
      const page = Object.values(data.query?.pages || {})[0];
      if (page?.thumbnail?.source) return { url: page.thumbnail.source, width: page.thumbnail.width, title: page.title };
    }
    return null;
  });
}

// Batched Wikipedia thumbnail lookup — api.php takes up to 50 titles per
// request, and single requests get rate-limited hard (429 with a ~1 minute
// Retry-After) when fired per-species. Returns Map of lowercased input
// name → image object (or null), and seeds the per-name cache.
async function imagesForNames(names) {
  const result = new Map();
  const missing = [];
  for (const name of names) {
    const entry = cache.get(`wiki:${name.toLowerCase()}`);
    if (entry && Date.now() - entry.ts < TTL.image) result.set(name.toLowerCase(), entry.data);
    else missing.push(name);
  }
  for (let i = 0; i < missing.length; i += 50) {
    const chunk = missing.slice(i, i + 50);
    const url = `https://en.wikipedia.org/w/api.php?` + new URLSearchParams({
      action: 'query', titles: chunk.join('|'), prop: 'pageimages', format: 'json',
      pithumbsize: '700', piprop: 'thumbnail', redirects: '1',
    });
    const data = await fetchJSON(url);
    // Walk title renames backwards (normalization, then redirects) so each
    // returned page maps to the name the caller asked about.
    const rename = new Map();
    for (const n of data.query?.normalized || []) rename.set(n.to, n.from);
    for (const r of data.query?.redirects || []) {
      rename.set(r.to, rename.get(r.from) ?? r.from);
    }
    const byInput = new Map();
    for (const page of Object.values(data.query?.pages || {})) {
      const orig = rename.get(page.title) ?? page.title;
      if (page.thumbnail?.source) {
        byInput.set(orig.toLowerCase(), { url: page.thumbnail.source, width: page.thumbnail.width, title: page.title });
      }
    }
    for (const name of chunk) {
      const img = byInput.get(name.toLowerCase()) ?? null;
      cache.set(`wiki:${name.toLowerCase()}`, { data: img, ts: Date.now() });
      result.set(name.toLowerCase(), img);
    }
  }
  return result;
}

router.get('/birds/recording', async (req, res) => {
  const sciName = (req.query.sciName || '').trim();
  const comName = (req.query.comName || '').trim();
  if (!sciName && !comName) return res.status(400).json({ error: 'sciName or comName required' });
  try {
    const rec = await findRecording(sciName, comName);
    if (!rec) return res.status(404).json({ error: 'no recording found' });
    res.json(rec);
  } catch (err) {
    console.error('Recording error:', err.message);
    res.status(500).json({ error: 'Recording fetch failed', message: err.message });
  }
});

// ── Batch media eligibility: a species may only appear as a quiz question
// if it has at least one recording AND at least one picture. Returns the
// media alongside the verdict so the frontend never has to re-fetch it.
router.post('/birds/media-check', async (req, res) => {
  const species = Array.isArray(req.body?.species) ? req.body.species.slice(0, 60) : null;
  if (!species?.length) return res.status(400).json({ error: 'species array required' });
  // Retry on thrown errors (rate limits, network blips) — only a clean
  // null means "this bird really has no media". A transient upstream
  // failure must not silently disqualify a bird.
  const withRetry = async (fn) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await fn(); } catch {
        await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    return null;
  };

  // All images in one batched Wikipedia call; recordings individually
  // through a small worker pool (iNaturalist/xeno-canto have no batch API).
  const names = species.map(sp => (sp.commonName || '').trim()).filter(Boolean);
  const imageMap = (await withRetry(() => imagesForNames(names))) || new Map();

  const CONCURRENCY = 4;
  const results = new Array(species.length);
  let next = 0;
  async function worker() {
    while (next < species.length) {
      const i = next++;
      const sp = species[i];
      const commonName = (sp.commonName || '').trim();
      const sciName = (sp.sciName || '').trim();
      const recording = await withRetry(() => findRecording(sciName, commonName));
      const image = imageMap.get(commonName.toLowerCase()) || null;
      results[i] = {
        code: sp.code, commonName, sciName,
        eligible: Boolean(recording && image),
        recording: recording || null,
        image,
      };
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  res.json({ species: results });
});

router.get('/birds/audio/:id', async (req, res) => {
  const xcId = req.params.id;
  if (!xcId || !/^\d+$/.test(xcId)) return res.status(400).json({ error: 'invalid recording id' });
  try {
    let url = `https://xeno-canto.org/${xcId}/download`;
    if (XC_KEY) url += `?key=${XC_KEY}`;
    const upstream = await fetch(url, { headers: { 'User-Agent': 'BirdQuiz/1.0 (folkengames.com/bird)' }, redirect: 'follow' });
    if (!upstream.ok) return res.status(upstream.status).json({ error: 'audio fetch failed' });
    const contentType = upstream.headers.get('content-type') || 'audio/mpeg';
    const contentLength = upstream.headers.get('content-length');
    res.set('Content-Type', contentType);
    if (contentLength) res.set('Content-Length', contentLength);
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Accept-Ranges', 'bytes');
    const reader = upstream.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { res.end(); return; }
        if (!res.write(value)) await new Promise(resolve => res.once('drain', resolve));
      }
    };
    res.on('close', () => { if (!res.writableFinished) reader.cancel().catch(() => {}); });
    pump().catch(err => {
      console.error(`Audio proxy error: ${err.message}`);
      if (!res.headersSent) res.status(500).end(); else res.destroy();
    });
  } catch (err) {
    console.error(`Audio proxy error: ${err.message}`);
    if (!res.headersSent) res.status(500).json({ error: 'audio proxy failed' });
  }
});

router.get('/birds/image', async (req, res) => {
  const name = (req.query.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const img = await findImage(name);
    if (!img) return res.status(404).json({ error: 'no image found' });
    res.json(img);
  } catch (err) {
    console.error('Wikipedia image error:', err.message);
    res.status(500).json({ error: 'Image fetch failed' });
  }
});

// ── Wikipedia summary extract, trimmed for spoken habitat/range trivia ────
router.get('/birds/facts', async (req, res) => {
  const name = (req.query.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const key = `facts:${name.toLowerCase()}`;
    const fact = await cached(key, TTL.facts, async () => {
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`;
      const data = await fetchJSON(url).catch(() => null);
      const extract = data?.extract;
      if (!extract) return null;
      // Keep it short and spoken-friendly — first two sentences, trimmed.
      const sentences = extract.match(/[^.!?]+[.!?]/g) || [extract];
      return { name, extract: sentences.slice(0, 2).join(' ').trim() };
    });
    if (!fact) return res.status(404).json({ error: 'no facts found' });
    res.json(fact);
  } catch (err) {
    console.error('Wikipedia facts error:', err.message);
    res.status(500).json({ error: 'Facts fetch failed' });
  }
});

export default router;
