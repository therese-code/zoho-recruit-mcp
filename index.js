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
  const res = await axios.post('https://accounts.zoho.com/oauth/v2/token', null, {
    params: {
      refresh_token: REFRESH_TOKEN,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token'
    }
  });
  return res.data.access_token;
}

app.get('/.well-known/oauth-authorization-server', (req, res) => {
  const base = `https://${req.headers.host}`;
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    scopes_supported: ['recruit'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256']
  });
});

app.get('/oauth/authorize', (req, res) => {
  const { redirect_uri, state } = req.query;
  const params = new URLSearchParams({
    scope: 'ZohoRecruit.modules.ALL',
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirect_uri,
    access_type: 'offline',
    state: state || ''
  });
  res.redirect(`https://accounts.zoho.com/oauth/v2/auth?${params.toString()}`);
});

app.post('/oauth/token', async (req, res) => {
  try {
    const { code, redirect_uri, grant_type, refresh_token } = req.body;
    let params = {};
    if (grant_type === 'refresh_token') {
      params = {
        refresh_token: refresh_token || REFRESH_TOKEN,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'refresh_token'
      };
    } else {
      params = {
        code,
        redirect_uri,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code'
      };
    }
    const response = await axios.post('https://accounts.zoho.com/oauth/v2/token', null, { params });
    res.json({
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token || REFRESH_TOKEN,
      token_type: 'Bearer',
      expires_in: 3600
    });
  } catch (err) {
    res.status(400).json({ error: 'token_error', error_description: err.message });
  }
});

app.get('/callback', (req, res) => {
  res.send('Connected! You can close this window.');
});
