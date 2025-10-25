import { fetchVehicleByReg } from './_lib/dvla.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  try {
    const { vrm } = req.body || {};
    const vehicle = await fetchVehicleByReg(vrm);
    return res.status(200).json(vehicle);
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message || 'Server error' });
  }
}
