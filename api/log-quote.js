import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '_data', 'quotes');
const LOG_FILE = path.join(DATA_DIR, 'log.jsonl');

async function appendLog(entry) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const serialised = `${JSON.stringify(entry)}\n`;
  await fs.appendFile(LOG_FILE, serialised, 'utf8');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
    return;
  }

  try {
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const payload = rawBody ? JSON.parse(rawBody) : {};

    if (!payload || typeof payload !== 'object') {
      res.status(400).json({ error: 'Invalid payload.' });
      return;
    }

    const normalisedMileage = Number(payload.mileage);
    const entry = {
      timestamp: new Date().toISOString(),
      action: payload.action || 'quote',
      type: payload.type || '',
      vrm: (payload.vrm || '').toString().toUpperCase(),
      mileage: Number.isFinite(normalisedMileage) && normalisedMileage >= 0 ? normalisedMileage : null,
      fulfilment: payload.fulfilment || '',
      conditionNotes: payload.conditionNotes || '',
      vehicle: payload.vehicle || {},
      features: payload.features || {},
      scrap: payload.scrap || {},
      sell: payload.sell || null
    };

    await appendLog(entry);
    res.status(204).end();
  } catch (error) {
    console.error('Quote log failed', error);
    res.status(500).json({ error: 'Unable to record quote.' });
  }
}
