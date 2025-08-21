// File: /api/vrm.js
export default async function handler(req, res) {
  // (CORS headers are harmless even on same-origin)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { vrm } = req.body || {};
    if (!vrm) return res.status(400).json({ error: 'Missing VRM' });

    // LIVE DVLA endpoint (this one returns real data for real plates)
    const DVLA_URL = 'https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles';
    const API_KEY = process.env.DVLA_API_KEY || ''; // <-- you’ll set this in Vercel

    if (!API_KEY) return res.status(500).json({ error: 'Missing DVLA_API_KEY env var' });

    const dvlaRes = await fetch(DVLA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      },
      body: JSON.stringify({ registrationNumber: String(vrm).trim().toUpperCase() })
    });

    // Try to read body even when !ok so we can bubble up a useful message
    const data = await dvlaRes.json().catch(() => ({}));

    if (!dvlaRes.ok) {
      return res.status(dvlaRes.status).json({
        error: data?.message || data || 'DVLA API error'
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
