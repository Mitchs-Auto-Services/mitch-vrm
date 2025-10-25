import { fetchVehicleByReg, normaliseReg } from './_lib/dvla.js';
import {
  buildQuoteBreakdown,
  loadSettings,
  logQuote
} from './_lib/quoteHelpers.js';

function parseRequestBody(body = {}) {
  const reg = normaliseReg(body.reg || body.vrm || '');
  const mileage = Number(body.mileage);
  if (!reg) {
    const err = new Error('Registration is required.');
    err.statusCode = 400;
    throw err;
  }
  if (!Number.isFinite(mileage) || mileage < 0) {
    const err = new Error('Mileage must be a non-negative number.');
    err.statusCode = 400;
    throw err;
  }
  return { reg, mileage };
}

function shapeVehicleDetails(vehicle = {}) {
  return {
    make: vehicle.make || '',
    model: vehicle.model || vehicle.mark || '',
    yearOfManufacture: vehicle.yearOfManufacture || null,
    bodyType: vehicle.bodyType || '',
    fuelType: vehicle.fuelType || '',
    massInKg: vehicle.massInKg || vehicle.revenueWeight || null
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  try {
    const { reg, mileage } = parseRequestBody(req.body || {});
    let vehicle;
    try {
      vehicle = await fetchVehicleByReg(reg);
    } catch (err) {
      if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
        return res.status(err.statusCode).json({ error: err.message || 'Vehicle lookup failed.' });
      }
      return res.status(502).json({ error: 'DVLA lookup failed.' });
    }

    const vehicleDetails = shapeVehicleDetails(vehicle);
    const settings = await loadSettings();
    const breakdown = buildQuoteBreakdown({ vehicle: vehicleDetails, mileage, settings });

    await logQuote({
      reg,
      mileage,
      bucket: breakdown.bucket,
      weightKg: breakdown.weightKg,
      scrapPriceGBP: breakdown.scrapPriceGBP,
      resalePriceGBP: breakdown.resalePriceGBP,
      settingsSnapshotHash: breakdown.settingsSnapshotHash
    });

    return res.status(200).json({
      reg,
      mileage,
      vehicleDetails,
      scrapPriceGBP: breakdown.scrapPriceGBP,
      resalePriceGBP: breakdown.resalePriceGBP,
      confidence: 'medium',
      breakdown: {
        estimatedWeightKg: breakdown.weightKg,
        ratePerTonneApplied: breakdown.ratePerTonne,
        partsBufferApplied: breakdown.partsBuffer,
        catalystAppliedGBP: breakdown.catalyst,
        collectionFeeGBP: settings.collectionFeeGBP,
        processingReserveGBP: settings.processingReserveGBP,
        ageYears: breakdown.age,
        expectedMileageForAge: breakdown.expectedMileage,
        mileagePenaltyApplied: breakdown.penalty,
        popularityTier: breakdown.popularityTier,
        bodyTypeBucket: breakdown.bucket,
        conditionFactorApplied: breakdown.conditionFactor,
        minimumMarginGBP: settings.minimumMarginGBP
      }
    });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message || 'Quote request failed.' });
  }
}
