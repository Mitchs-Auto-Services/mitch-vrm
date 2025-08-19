export default async function handler(req, res) {
  // Allow preflight for safety (CORS)
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  try {
    const { vrm } = req.body || {};
    if (!vrm) return res.status(400).json({ error: 'VRM required' });

    const dvlaRes = await fetch(
      'https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles',
      {
        method: 'POST',
        headers: {
          'x-api-key': process.env.DVLA_API_KEY, // set this in Vercel later
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ registrationNumber: vrm.replace(/\s/g, '') })
      }
    );

    const data = await dvlaRes.json();
    if (!dvlaRes.ok) return res.status(dvlaRes.status).json(data);

    res.setHeader('Access-Control-Allow-Origin', '*'); // you can lock this down later
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: 'Server error', details: e.message });
  }
}
