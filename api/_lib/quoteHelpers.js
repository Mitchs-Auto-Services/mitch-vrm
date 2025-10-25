// Calculation helpers for scrap and resale offers.

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { loadPricingSettings, hashSettingsSnapshot } from './pricingSettings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUOTES_DIR = path.resolve(__dirname, '../_data/quotes');
const REALISATIONS_DIR = path.resolve(__dirname, '../_data/realisations');

export const BODY_TYPE_BUCKETS = [
  { match: ['van'], bucket: 'van' },
  { match: ['estate'], bucket: 'estate' },
  { match: ['suv'], bucket: 'suv' },
  { match: ['mpv'], bucket: 'mpv' },
  { match: ['4x4'], bucket: '4x4' },
  { match: ['saloon'], bucket: 'saloon' },
  { match: ['hatchback'], bucket: 'hatchback' }
];

const DEFAULT_WEIGHT_BY_BUCKET = {
  van: 1500,
  estate: 1400,
  suv: 1500,
  mpv: 1500,
  '4x4': 1500,
  saloon: 1350,
  hatchback: 1200,
  other: 1250
};

const POPULARITY_LOOKUP = {
  ford: {
    fiesta: 'high',
    focus: 'high',
    mondeo: 'medium',
    transit: 'high'
  },
  vauxhall: {
    corsa: 'high',
    astra: 'high',
    insignia: 'medium'
  },
  volkswagen: {
    golf: 'high',
    polo: 'high',
    passat: 'medium'
  },
  toyota: {
    yaris: 'high',
    corolla: 'high',
    prius: 'medium'
  },
  honda: {
    civic: 'high',
    jazz: 'medium'
  },
  nissan: {
    qashqai: 'high',
    micra: 'medium',
    juke: 'medium'
  },
  bmw: {
    '3 series': 'medium',
    '1 series': 'medium'
  },
  mercedes: {
    'c-class': 'medium',
    'a-class': 'medium'
  },
  peugeot: {
    '208': 'medium',
    '308': 'medium',
    partner: 'medium'
  }
};

function safeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function ensureDirectory(targetPath) {
  return fs.mkdir(targetPath, { recursive: true });
}

export function bucketiseBodyType(bodyType = '') {
  const lower = String(bodyType || '').toLowerCase();
  for (const { match, bucket } of BODY_TYPE_BUCKETS) {
    if (match.some((token) => lower.includes(token))) {
      return bucket;
    }
  }
  return 'other';
}

export function estimateWeightKg(vehicle = {}, bucket) {
  const fromDvla = safeNumber(vehicle.massInKg);
  if (fromDvla > 0) return fromDvla;
  const resolvedBucket = bucket || bucketiseBodyType(vehicle.bodyType);
  return DEFAULT_WEIGHT_BY_BUCKET[resolvedBucket] || DEFAULT_WEIGHT_BY_BUCKET.other;
}

function normaliseModelName(model = '') {
  return String(model || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyPopularity(make = '', model = '', defaultTier) {
  const makeKey = String(make || '').toLowerCase();
  const tierMap = POPULARITY_LOOKUP[makeKey];
  const modelKey = normaliseModelName(model);
  if (tierMap) {
    for (const [candidate, tier] of Object.entries(tierMap)) {
      if (modelKey.includes(candidate)) {
        return tier;
      }
    }
  }
  return defaultTier;
}

export function roundToStep(value, step) {
  if (step <= 0) return Math.max(0, Math.round(value));
  const rounded = Math.round(value / step) * step;
  return Math.max(0, rounded);
}

export function buildQuoteBreakdown({
  vehicle,
  mileage,
  settings,
  now = new Date()
}) {
  const bucket = bucketiseBodyType(vehicle.bodyType);
  const weightKg = estimateWeightKg(vehicle, bucket);
  const ratePerTonne = settings.scrapRatePerTonneGBP * (settings.bodyTypeRateAdjustments[bucket] || 1);
  const popularityTier = classifyPopularity(vehicle.make, vehicle.model, settings.defaultPartsPopularity);
  const partsBuffer = settings.partsBufferTableGBP[popularityTier] ?? settings.partsBufferTableGBP[settings.defaultPartsPopularity];
  const catalystEligible =
    settings.applyCatalystUplift &&
    String(vehicle.fuelType || '').toLowerCase().includes('petrol') &&
    Number(vehicle.yearOfManufacture || 0) >= 2001;
  const catalyst = catalystEligible ? settings.catalystUpliftGBP : 0;

  const core = (weightKg / 1000) * ratePerTonne;
  const scrapRaw =
    core +
    partsBuffer +
    catalyst -
    settings.collectionFeeGBP -
    settings.processingReserveGBP;

  const scrapPriceGBP = roundToStep(scrapRaw, settings.roundingStepGBP);

  const currentYear = now.getUTCFullYear();
  const year = Number(vehicle.yearOfManufacture) || currentYear - 6;
  const age = Math.max(0, currentYear - year);
  const vehicleClass = bucket === 'van' ? 'van' : 'car';
  const retailTypical = settings.resaleRetailTypicalGBP[vehicleClass] || settings.resaleRetailTypicalGBP.car;

  let baseline = retailTypical * 0.12;
  if (age <= 1) baseline = retailTypical * 0.6;
  else if (age <= 4) baseline = retailTypical * 0.45;
  else if (age <= 9) baseline = retailTypical * 0.25;

  const expectedMileage = Math.max(settings.expectedMilesPerYear, settings.expectedMilesPerYear * Math.max(1, age));
  const penalty = mileage > expectedMileage ? ((mileage - expectedMileage) / 10000) * 0.05 : 0;
  const resaleRaw = baseline * (1 - penalty) * settings.conditionFactor;
  let resalePriceGBP = roundToStep(resaleRaw, settings.roundingStepGBP);
  const minResale = scrapPriceGBP + settings.minimumMarginGBP;
  if (resalePriceGBP < minResale) {
    resalePriceGBP = roundToStep(minResale, settings.roundingStepGBP);
  }

  return {
    bucket,
    weightKg,
    ratePerTonne,
    popularityTier,
    partsBuffer,
    catalyst,
    scrapPriceGBP,
    age,
    expectedMileage,
    penalty,
    resalePriceGBP,
    conditionFactor: settings.conditionFactor,
    settingsSnapshotHash: hashSettingsSnapshot(settings)
  };
}

function toCsvRow(fields = []) {
  return fields
    .map((field) => {
      const value = field ?? '';
      if (typeof value === 'number') return value;
      const stringValue = String(value);
      if (/[",\n]/.test(stringValue)) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    })
    .join(',');
}

export async function logQuote({
  reg,
  mileage,
  bucket,
  weightKg,
  scrapPriceGBP,
  resalePriceGBP,
  settingsSnapshotHash
}) {
  await ensureDirectory(QUOTES_DIR);
  const timestamp = new Date().toISOString();
  const row = toCsvRow([
    timestamp,
    (reg || '').toUpperCase(),
    mileage,
    bucket,
    weightKg,
    scrapPriceGBP,
    resalePriceGBP,
    settingsSnapshotHash
  ]);
  await fs.appendFile(path.join(QUOTES_DIR, 'quotes.csv'), `${row}\n`, 'utf8');
}

export async function logRealisationEntry(entry) {
  await ensureDirectory(REALISATIONS_DIR);
  const timestamp = new Date().toISOString();
  const row = toCsvRow([
    timestamp,
    (entry.reg || '').toUpperCase(),
    entry.realisedMetalGBP ?? '',
    entry.realisedPartsGBP ?? '',
    entry.collectionCostGBP ?? '',
    entry.notes ?? ''
  ]);
  await fs.appendFile(path.join(REALISATIONS_DIR, 'realisations.csv'), `${row}\n`, 'utf8');
}

export async function loadSettings() {
  return loadPricingSettings();
}
