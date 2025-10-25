// Utility helpers for loading, validating, and saving pricing settings.
// Update scrap rate, multipliers, and buffers weekly via the admin page.

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = path.resolve(__dirname, '../pricing.settings.json');

export const defaultSettings = Object.freeze({
  scrapRatePerTonneGBP: 160,
  bodyTypeRateAdjustments: {
    van: 1,
    estate: 1,
    suv: 1,
    mpv: 1,
    '4x4': 1,
    saloon: 1,
    hatchback: 1,
    other: 1
  },
  partsBufferTableGBP: {
    low: 50,
    medium: 100,
    high: 150
  },
  defaultPartsPopularity: 'medium',
  collectionFeeGBP: 0,
  processingReserveGBP: 30,
  roundingStepGBP: 25,
  minimumMarginGBP: 75,
  conditionFactor: 0.95,
  expectedMilesPerYear: 12000,
  resaleRetailTypicalGBP: {
    car: 12000,
    van: 10000
  },
  applyCatalystUplift: false,
  catalystUpliftGBP: 0
});

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function sanitiseBodyTypeMultipliers(input = {}) {
  const targetKeys = Object.keys(defaultSettings.bodyTypeRateAdjustments);
  const result = {};
  for (const key of targetKeys) {
    const raw = input[key];
    const numeric = Number(raw);
    result[key] = isFiniteNumber(numeric) ? clamp(numeric, 0.5, 1.5) : defaultSettings.bodyTypeRateAdjustments[key];
  }
  return result;
}

function sanitisePartsBufferTable(input = {}) {
  const tiers = Object.keys(defaultSettings.partsBufferTableGBP);
  const result = {};
  for (const tier of tiers) {
    const raw = input[tier];
    const numeric = Number(raw);
    result[tier] = isFiniteNumber(numeric) ? clamp(numeric, 0, 500) : defaultSettings.partsBufferTableGBP[tier];
  }
  return result;
}

function sanitiseRetailTypical(input = {}) {
  const categories = Object.keys(defaultSettings.resaleRetailTypicalGBP);
  const result = {};
  for (const category of categories) {
    const raw = input[category];
    const numeric = Number(raw);
    result[category] = isFiniteNumber(numeric) ? clamp(numeric, 0, 50000) : defaultSettings.resaleRetailTypicalGBP[category];
  }
  return result;
}

function resolveBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(lowered)) return true;
    if (['false', '0', 'no', 'off'].includes(lowered)) return false;
  }
  return fallback;
}

export function normaliseSettings(partial = {}) {
  return {
    scrapRatePerTonneGBP: isFiniteNumber(partial.scrapRatePerTonneGBP)
      ? Math.max(0, Number(partial.scrapRatePerTonneGBP))
      : defaultSettings.scrapRatePerTonneGBP,
    bodyTypeRateAdjustments: sanitiseBodyTypeMultipliers(partial.bodyTypeRateAdjustments),
    partsBufferTableGBP: sanitisePartsBufferTable(partial.partsBufferTableGBP),
    defaultPartsPopularity:
      typeof partial.defaultPartsPopularity === 'string' &&
      ['low', 'medium', 'high'].includes(partial.defaultPartsPopularity.toLowerCase())
        ? partial.defaultPartsPopularity.toLowerCase()
        : defaultSettings.defaultPartsPopularity,
    collectionFeeGBP: isFiniteNumber(partial.collectionFeeGBP)
      ? Math.max(0, Number(partial.collectionFeeGBP))
      : defaultSettings.collectionFeeGBP,
    processingReserveGBP: isFiniteNumber(partial.processingReserveGBP)
      ? Math.max(0, Number(partial.processingReserveGBP))
      : defaultSettings.processingReserveGBP,
    roundingStepGBP: isFiniteNumber(partial.roundingStepGBP)
      ? Math.max(1, Number(partial.roundingStepGBP))
      : defaultSettings.roundingStepGBP,
    minimumMarginGBP: isFiniteNumber(partial.minimumMarginGBP)
      ? Math.max(0, Number(partial.minimumMarginGBP))
      : defaultSettings.minimumMarginGBP,
    conditionFactor: isFiniteNumber(partial.conditionFactor)
      ? clamp(Number(partial.conditionFactor), 0.8, 1.05)
      : defaultSettings.conditionFactor,
    expectedMilesPerYear: isFiniteNumber(partial.expectedMilesPerYear)
      ? Math.max(1000, Number(partial.expectedMilesPerYear))
      : defaultSettings.expectedMilesPerYear,
    resaleRetailTypicalGBP: sanitiseRetailTypical(partial.resaleRetailTypicalGBP),
    applyCatalystUplift: resolveBoolean(partial.applyCatalystUplift, defaultSettings.applyCatalystUplift),
    catalystUpliftGBP: isFiniteNumber(partial.catalystUpliftGBP)
      ? Math.max(0, Number(partial.catalystUpliftGBP))
      : defaultSettings.catalystUpliftGBP
  };
}

export async function loadPricingSettings() {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return normaliseSettings(parsed);
  } catch (error) {
    return { ...defaultSettings };
  }
}

export async function savePricingSettings(nextSettings = {}) {
  const normalised = normaliseSettings(nextSettings);
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(normalised, null, 2), 'utf8');
  return normalised;
}

export function hashSettingsSnapshot(settings) {
  const serialised = JSON.stringify(normaliseSettings(settings));
  return crypto.createHash('sha256').update(serialised).digest('hex');
}

export function resolveSettingsFilePath() {
  return SETTINGS_PATH;
}
