import fs from 'fs/promises';
import { requireAdminAuth } from '../_lib/adminAuth.js';
import {
  loadPricingSettings,
  savePricingSettings,
  resolveSettingsFilePath
} from '../_lib/pricingSettings.js';

async function getLastUpdated() {
  try {
    const stats = await fs.stat(resolveSettingsFilePath());
    return stats.mtime.toISOString();
  } catch (error) {
    return null;
  }
}

export default async function handler(req, res) {
  if (!requireAdminAuth(req, res)) return;

  if (req.method === 'GET') {
    const settings = await loadPricingSettings();
    const updatedAt = await getLastUpdated();
    return res.status(200).json({ settings, updatedAt });
  }

  if (req.method === 'POST') {
    try {
      const nextSettings = await savePricingSettings(req.body || {});
      const updatedAt = await getLastUpdated();
      return res.status(200).json({ settings: nextSettings, updatedAt });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Unable to save settings.' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method Not Allowed.' });
}
