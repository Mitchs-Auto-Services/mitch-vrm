import { requireAdminAuth } from './_lib/adminAuth.js';
import { logRealisationEntry } from './_lib/quoteHelpers.js';

function parseBody(body = {}) {
  const reg = String(body.reg || '').toUpperCase().replace(/\s+/g, '');
  if (!reg) {
    const err = new Error('Registration is required.');
    err.statusCode = 400;
    throw err;
  }

  const toNumber = (value) => {
    if (value === undefined || value === null || value === '') return undefined;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      const err = new Error('Numeric fields must be numbers.');
      err.statusCode = 400;
      throw err;
    }
    return numeric;
  };

  return {
    reg,
    realisedMetalGBP: toNumber(body.realisedMetalGBP),
    realisedPartsGBP: toNumber(body.realisedPartsGBP),
    collectionCostGBP: toNumber(body.collectionCostGBP),
    notes: body.notes ? String(body.notes) : ''
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed.' });
  }

  if (!requireAdminAuth(req, res)) return;

  try {
    const entry = parseBody(req.body || {});
    await logRealisationEntry(entry);
    return res.status(200).json({ ok: true });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ error: error.message || 'Unable to record realisation.' });
  }
}
