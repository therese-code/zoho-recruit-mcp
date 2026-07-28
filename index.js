const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN;
let accessToken = null;

// OAuth discovery endpoint
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  const base = `https://${req.headers.host}`;
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code']
  });
});

// OAuth authorize — redirect to Zoho
app.get('/oauth/authorize', (req, res) => {
  const params = new URLSearchParams({
    scope: 'ZohoRecruit.modules.ALL',
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: req.query.redirect_uri || `https://${req.headers.host}/callback`,
    access_type: 'offline'
  });
  res.redirect(`https://accounts.zoho.com/oauth/v2/auth?${params}`);
});

// OAuth token exchange
app.post('/oauth/token', async (req, res) => {
  try {
    const response = await axios.post(
      'https://accounts.zoho.com/oauth/v2/token',
      null,
      {
        params: {
          refresh_token: REFRESH_TOKEN,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          grant_type: 'refresh_token'
        }
      }
    );
    res.json({
      access_token: response.data.access_token,
      token_type: 'Bearer',
      expires_in: 3600
    });
  } catch (err) {
    res.status(400).json({ error: 'token_error', message: err.message });
  }
});

// Callback handler
app.get('/callback', (req, res) => {
  res.send('Connected successfully! You can close this window.');
});

async function getAccessToken() {
  const res = await axios.post('https://accounts.zoho.com/oauth/v2/token', null, {
    params: {
      refresh_token: REFRESH_TOKEN,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token'
    }
  });
  accessToken = res.data.access_token;
  return accessToken;
}

app.post('/search_candidates', async (req, res) => {
  const { skill, min_years, max_results = 20 } = req.body;
  await getAccessToken();
  const response = await axios.get(
    'https://recruit.zoho.com/recruit/v2/Candidates/search',
    {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      params: {
        criteria: `(Skill_Set:contains:${skill})`,
        per_page: max_results,
        fields: 'First_Name,Last_Name,Email,Skill_Set,Experience_in_Years,Current_Job_Title,Current_Employer'
      }
    }
  );
  const candidates = (response.data.data || []).filter(c =>
    parseFloat(c.Experience_in_Years) >= (min_years || 0)
  );
  res.json({ candidates });
});

app.post('/get_candidate', async (req, res) => {
  const { candidate_id } = req.body;
  await getAccessToken();
  const response = await axios.get(
    `https://recruit.zoho.com/recruit/v2/Candidates/${candidate_id}`,
    { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } }
  );
  res.json({ candidate: response.data.data?.[0] || {} });
});

app.post('/get_job_postings', async (req, res) => {
  await getAccessToken();
  const response = await axios.get(
    'https://recruit.zoho.com/recruit/v2/JobOpenings',
    { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } }
  );
  res.json({ jobs: response.data.data || [] });
});

app.get('/.well-known/mcp', (req, res) => {
  res.json({
    name: 'zoho-recruit',
    description: 'Search and retrieve candidates from Zoho Recruit',
    tools: [
      {
        name: 'search_candidates',
        description: 'Search candidates by skill and minimum years of experience',
        parameters: {
          skill: { type: 'string', description: 'Skill to search for e.g. HubSpot' },
          min_years: { type: 'number', description: 'Minimum years of experience' },
          max_results: { type: 'number', description: 'Max candidates to return' }
        }
      },
      {
        name: 'get_candidate',
        description: 'Get full profile of a specific candidate by ID',
        parameters: {
          candidate_id: { type: 'string', description: 'Zoho Recruit candidate ID' }
        }
      },
      {
        name: 'get_job_postings',
        description: 'List all open job postings in Zoho Recruit',
        parameters: {}
      }
    ]
  });
});

app.listen(process.env.PORT || 3000, () => console.log('Zoho Recruit MCP running'));
