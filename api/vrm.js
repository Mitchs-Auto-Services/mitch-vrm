// File: /api/vrm.js
//
// Vercel serverless function that proxies to DVLA VES API.
// Requires an Environment Variable in Vercel: DVLA_API_KEY (LIVE key).
//
// Test quickly by POSTing JSON: { "vrm": "AB12CDE" }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  try {
    const { vrm } = req.body || {};
    if (!vrm || typeof vrm !== 'string' || vrm.replace(/\s+/g, '').length < 5) {
      return res.status(400).json({ error: 'Invalid or missing VRM.' });
    }

    // LIVE DVLA VES endpoint
    const DVLA_URL = 'https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles';

    const upstream = await fetch(DVLA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.DVLA_API_KEY
      },
      body: JSON.stringify({ registrationNumber: vrm.toUpperCase().replace(/\s+/g, '') }),
      // Avoid any caching weirdness
      cache: 'no-store'
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      // Bubble up DVLA error cleanly
      return res.status(upstream.status).json({ error: data?.message || data });
    }

    // Pass through DVLA payload to the client
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
