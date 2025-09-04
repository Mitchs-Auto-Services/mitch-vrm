// /api/vrm.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { vrm } = req.body || {};
    if (!vrm) return res.status(400).json({ error: 'Missing vrm' });

    const dvlaRes = await fetch('https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.DVLA_API_KEY
      },
      body: JSON.stringify({ registrationNumber: vrm })
    });

    const data = await dvlaRes.json().catch(() => ({}));
    if (!dvlaRes.ok) {
      return res.status(dvlaRes.status).json({ error: data?.message || data || 'DVLA error' });
    }
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
