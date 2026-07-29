const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN;
const PORT = process.env.PORT || 8080;
async function getAccessToken() {
  const res = await axios.post('https://accounts.zoho.com/oauth/v2/token', null, { params: { refresh_token: REFRESH_TOKEN, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'refresh_token' } });
  return res.data.access_token;
}
app.get('/.well-known/oauth-authorization-server', (req, res) => { const base = 'https://' + req.headers.host; res.json({ issuer: base, authorization_endpoint: base + '/oauth/authorize', token_endpoint: base + '/oauth/token', scopes_supported: ['recruit'], response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'] }); });
app.get('/oauth/authorize', (req, res) => { const p = new URLSearchParams({ scope: 'ZohoRecruit.modules.ALL', client_id: CLIENT_ID, response_type: 'code', redirect_uri: req.query.redirect_uri, access_type: 'offline', state: req.query.state || '' }); res.redirect('https://accounts.zoho.com/oauth/v2/auth?' + p.toString()); });
app.post('/oauth/token', async (req, res) => { try { const { code, redirect_uri, grant_type, refresh_token } = req.body; const params = grant_type === 'refresh_token' ? { refresh_token: refresh_token || REFRESH_TOKEN, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'refresh_token' } : { code, redirect_uri, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'authorization_code' }; const r = await axios.post('https://accounts.zoho.com/oauth/v2/token', null, { params }); res.json({ access_token: r.data.access_token, refresh_token: r.data.refresh_token || REFRESH_TOKEN, token_type: 'Bearer', expires_in: 3600 }); } catch (err) { res.status(400).json({ error: 'token_error', error_description: err.message }); } });
app.get('/callback', (req, res) => { res.send('Connected! You can close this window.'); });
app.get('/.well-known/mcp.json', (req, res) => { res.json({ name: 'zoho-recruit', description: 'Search candidates from Zoho Recruit', tools: [{ name: 'search_candidates', description: 'Search candidates by skill and experience', parameters: { skill: { type: 'string' }, min_years: { type: 'number' }, max_results: { type: 'number' } } }, { name: 'get_candidate', description: 'Get candidate profile by ID', parameters: { candidate_id: { type: 'string' } } }, { name: 'get_job_postings', description: 'List open job postings', parameters: {} }] }); });
app.get('/.well-known/mcp', (req, res) => { res.redirect('/.well-known/mcp.json'); });
app.post('/search_candidates', async (req, res) => { try { const { skill, min_years, max_results = 20 } = req.body; const token = await getAccessToken(); const r = await axios.get('https://recruit.zoho.com/recruit/v2/Candidates/search', { headers: { Authorization: 'Zoho-oauthtoken ' + token }, params: { criteria: '(Skill_Set:contains:' + skill + ')', per_page: max_results, fields: 'First_Name,Last_Name,Email,Skill_Set,Experience_in_Years,Current_Job_Title,Current_Employer' } }); const candidates = (r.data.data || []).filter(c => parseFloat(c.Experience_in_Years) >= (min_years || 0)); res.json({ candidates }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/get_candidate', async (req, res) => { try { const token = await getAccessToken(); const r = await axios.get('https://recruit.zoho.com/recruit/v2/Candidates/' + req.body.candidate_id, { headers: { Authorization: 'Zoho-oauthtoken ' + token } }); res.json({ candidate: r.data.data?.[0] || {} }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/get_job_postings', async (req, res) => { try { const token = await getAccessToken(); const r = await axios.get('https://recruit.zoho.com/recruit/v2/JobOpenings', { headers: { Authorization: 'Zoho-oauthtoken ' + token } }); res.json({ jobs: r.data.data || [] }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.listen(PORT, () => console.log('Zoho Recruit MCP running on port ' + PORT));
