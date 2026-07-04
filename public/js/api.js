async function j(url, opts) {
  const res = await fetch(url, opts);
  const isJson = (res.headers.get('content-type') || '').includes('json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    const err = new Error(data?.message || data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}
function post(url, body) {
  return j(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

export const Api = {
  tokens: () => j('/api/tokens'),
  players: () => j('/api/players'),
  login: (name, tokenId) => post('/api/players/login', { name, tokenId }),

  demoSpecies: () => j('/api/demo-species'),
  geoSearch: q => j(`/api/geo/search?q=${encodeURIComponent(q)}`),
  species: region => j(`/api/birds/species?region=${encodeURIComponent(region)}`),
  taxonomy: codes => j(`/api/birds/taxonomy?codes=${encodeURIComponent(codes)}`),
  recording: (sciName, comName) => j(`/api/birds/recording?sciName=${encodeURIComponent(sciName || '')}&comName=${encodeURIComponent(comName || '')}`),
  mediaCheck: species => post('/api/birds/media-check', { species }),
  image: name => j(`/api/birds/image?name=${encodeURIComponent(name)}`),
  facts: name => j(`/api/birds/facts?name=${encodeURIComponent(name)}`),

  session: (player, speciesList, count, modes) => post('/api/session', { player, speciesList, count, modes }),
  answer: (player, speciesCode, commonName, correct) => post('/api/mastery/answer', { player, speciesCode, commonName, correct }),
  masterySummary: player => j(`/api/mastery/summary?player=${encodeURIComponent(player)}`),
};
