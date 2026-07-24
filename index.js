const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN;
let accessToken = null;

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

app.listen(3000, () => console.log('Zoho Recruit MCP running on port 3000'));
