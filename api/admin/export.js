import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { requireAdminAuth } from '../_lib/adminAuth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = path.resolve(__dirname, '../_data');

const EXPORT_CONFIG = {
  quotes: {
    file: path.join(DATA_ROOT, 'quotes/quotes.csv'),
    filename: 'quotes.csv'
  },
  realisations: {
    file: path.join(DATA_ROOT, 'realisations/realisations.csv'),
    filename: 'realisations.csv'
  }
};

export default async function handler(req, res) {
  if (!requireAdminAuth(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed.' });
  }

  const { type } = req.query || {};
  const key = String(type || '').toLowerCase();
  const config = EXPORT_CONFIG[key];
  if (!config) {
    return res.status(400).json({ error: 'Unknown export type.' });
  }

  const headers = {
    quotes: 'timestamp,reg,mileage,bodyType,weightKg,scrapPriceGBP,resalePriceGBP,settingsHash',
    realisations: 'timestamp,reg,realisedMetalGBP,realisedPartsGBP,collectionCostGBP,notes'
  };

  try {
    const csv = await fs.readFile(config.file, 'utf8');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${config.filename}"`);
    return res.status(200).send(csv);
  } catch (error) {
    const fallback = headers[key] || '';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${config.filename}"`);
    return res.status(200).send(fallback);
  }
}
