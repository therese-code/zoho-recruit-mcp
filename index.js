const express = require('express');
const axios = require('axios');
const { randomUUID } = require('crypto');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
    const { skill, min_years, max_results = 20 } = args;
    const r = await axios.get('https://recruit.zoho.com/recruit/v2/Candidates/search', {
      headers: { Authorization: 'Zoho-oauthtoken ' + token },
      params: { criteria: '(Skill_Set:contains:' + skill + ')', per_page: max_results, fields: 'First_Name,Last_Name,Email,Skill_Set,Experience_in_Years,Current_Job_Title,Current_Employer' }
    });
    const candidates = (r.data.data || []).filter(c => parseFloat(c.Experience_in_Years) >= (min_years || 0));
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

// Note: no OAuth discovery/authorize/token routes are exposed here.
// This server authenticates to Zoho internally using the ZOHO_REFRESH_TOKEN
// env var (see getAccessToken above) on every tool call, so callers do not
// need to complete an interactive login. Advertising OAuth discovery here
// previously caused MCP clients to force a browser login that Self Client
// apps cannot actually complete.

// MCP Streamable HTTP endpoint
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
