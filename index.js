const express = require('express');
const axios = require('axios');
const { randomUUID } = require('crypto');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN;
const PORT = process.env.PORT || 8080;

async function getAccessToken() {
  const res = await axios.post('https://accounts.zoho.com/oauth/v2/token', null, {
    params: { refresh_token: REFRESH_TOKEN, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'refresh_token' }
  });
  return res.data.access_token;
}

async function handleToolCall(name, args) {
  const token = await getAccessToken();
 if (name === 'search_candidates') {
  const { keyword, min_score, min_years, max_results = 20 } = args;
  const r = await axios.get('https://recruit.zoho.com/recruit/v2/Candidates', {
    headers: { Authorization: 'Zoho-oauthtoken ' + token },
    params: {
      per_page: 200,
      fields: 'First_Name,Last_Name,Email,VA_Skills_Score,Primary_Niche,Years_in_Secondary_Niche,Years_in_tertiary_Niche,Skill_Set,Candidate_Stage'
    }
  });
  let candidates = r.data.data || [];
  if (min_score) {
    candidates = candidates.filter(c => (c.VA_Skills_Score || 0) >= min_score);
  }
  if (min_years) {
    candidates = candidates.filter(c => {
      const years = (c.Years_in_Secondary_Niche || 0) + (c.Years_in_tertiary_Niche || 0);
      return years >= min_years;
    });
  }
  if (keyword) {
    const kw = keyword.toLowerCase();
    candidates = candidates.filter(c => (c.Skill_Set || '').toLowerCase().includes(kw));
  }
  candidates = candidates.slice(0, max_results);
  return { content: [{ type: 'text', text: JSON.stringify(candidates) }] };
}
  if (name === 'get_candidate') {
    const r = await axios.get('https://recruit.zoho.com/recruit/v2/Candidates/' + args.candidate_id, { headers: { Authorization: 'Zoho-oauthtoken ' + token } });
    return { content: [{ type: 'text', text: JSON.stringify(r.data.data?.[0] || {}) }] };
  }
  if (name === 'get_job_postings') {
    const r = await axios.get('https://recruit.zoho.com/recruit/v2/JobOpenings', { headers: { Authorization: 'Zoho-oauthtoken ' + token } });
    return { content: [{ type: 'text', text: JSON.stringify(r.data.data || []) }] };
  }
  throw new Error('Unknown tool: ' + name);
}

app.get('/.well-known/oauth-authorization-server', (req, res) => {
  const base = 'https://' + req.headers.host;
  res.json({ issuer: base, authorization_endpoint: base + '/oauth/authorize', token_endpoint: base + '/oauth/token', scopes_supported: ['recruit'], response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'] });
});

app.get('/oauth/authorize', (req, res) => {
  const p = new URLSearchParams({ scope: 'ZohoRecruit.modules.ALL', client_id: CLIENT_ID, response_type: 'code', redirect_uri: req.query.redirect_uri, access_type: 'offline', state: req.query.state || '' });
  res.redirect('https://accounts.zoho.com/oauth/v2/auth?' + p.toString());
});

app.post('/oauth/token', async (req, res) => {
  try {
    const { code, redirect_uri, grant_type, refresh_token } = req.body;
    const params = grant_type === 'refresh_token' ? { refresh_token: refresh_token || REFRESH_TOKEN, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'refresh_token' } : { code, redirect_uri, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'authorization_code' };
    const r = await axios.post('https://accounts.zoho.com/oauth/v2/token', null, { params });
    res.json({ access_token: r.data.access_token, refresh_token: r.data.refresh_token || REFRESH_TOKEN, token_type: 'Bearer', expires_in: 3600 });
  } catch (err) { res.status(400).json({ error: 'token_error', error_description: err.message }); }
});

app.get('/callback', (req, res) => { res.send('Connected! You can close this window.'); });

app.post('/mcp', async (req, res) => {
  const msg = req.body;
  const id = msg.id;
  if (msg.method === 'initialize') {
    return res.json({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'zoho-recruit', version: '1.0.0' } } });
  }
  if (msg.method === 'tools/list') {
    return res.json({ jsonrpc: '2.0', id, result: { tools: [
      { name: 'search_candidates', description: 'Search candidates by skill and experience', inputSchema: { type: 'object', properties: { skill: { type: 'string' }, min_years: { type: 'number' }, max_results: { type: 'number' } }, required: ['skill'] } },
      { name: 'get_candidate', description: 'Get candidate profile by ID', inputSchema: { type: 'object', properties: { candidate_id: { type: 'string' } }, required: ['candidate_id'] } },
      { name: 'get_job_postings', description: 'List open job postings', inputSchema: { type: 'object', properties: {} } }
      ] } });
  }
  if (msg.method === 'tools/call') {
    try {
      const result = await handleToolCall(msg.params.name, msg.params.arguments || {});
      return res.json({ jsonrpc: '2.0', id, result });
    } catch (err) { return res.json({ jsonrpc: '2.0', id, error: { code: -32000, message: err.message } }); }
  }
  res.json({ jsonrpc: '2.0', id, result: {} });
});

app.get('/mcp', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.write('data: {"jsonrpc":"2.0","method":"ping"}\n\n');
});

app.delete('/mcp', (req, res) => { res.status(200).end(); });

app.listen(PORT, () => console.log('Zoho Recruit MCP running on port ' + PORT));
