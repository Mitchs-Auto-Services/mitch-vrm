// pages/api/addresses.js

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';

function normalisePostcode(value = '') {
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleaned) return '';
  return cleaned.replace(/([0-9][A-Z0-9]{2})$/, ' $1');
}

function escapeRegExp(value = '') {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const POSTCODE_PATTERN = /^[A-Z]{1,2}\d[A-Z0-9]?\s*\d[A-Z]{2}$/i;

function isEnglandResult(result = {}) {
  const address = result?.address || {};
  const regionHints = [
    address.state,
    address.state_district,
    address.region,
    address.country,
    result?.display_name
  ];
  const hasEnglandRegion = regionHints.some(
    (part) => typeof part === 'string' && part.toLowerCase().includes('england')
  );
  const isGreatBritain = (address.country_code || '').toLowerCase() === 'gb';
  return isGreatBritain && hasEnglandRegion;
}

function extractNumberFromDisplay(displayName = '', street = '') {
  if (!displayName) return '';
  const parts = displayName
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return '';

  const lowerStreet = street ? street.toLowerCase() : '';
  const candidateParts = [];

  for (let i = 0; i < parts.length && i < 4; i += 1) {
    candidateParts.push(parts[i]);
  }
  if (street) {
    parts.forEach((part) => {
      if (part.toLowerCase().includes(lowerStreet)) candidateParts.push(part);
    });
  }

  const seen = new Set();

  for (const part of candidateParts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);

    if (POSTCODE_PATTERN.test(trimmed) || !/\d/.test(trimmed)) continue;

    if (!street || lower.includes(lowerStreet)) return trimmed;

    const descriptorMatch = trimmed.match(
      /((?:no\.?|number|unit|flat|suite|apartment|block|building|house)\s*\d+[A-Za-z0-9]*(?:[-\/]\d+[A-Za-z0-9]*)?)/i
    );
    if (descriptorMatch) return descriptorMatch[1].trim();

    const directMatch = trimmed.match(/(\d+[A-Za-z0-9]*(?:[-\/]\d+[A-Za-z0-9]*)?)/);
    if (directMatch) return directMatch[1];
  }

  if (street) {
    const inlinePattern = new RegExp(
      `((?:no\\.?|number|unit|flat|suite|apartment|block|building|house)?\\s*\d+[A-Za-z0-9]*(?:[-\\/]\d+[A-Za-z0-9]*)?)\\s+${escapeRegExp(
        street
      )}`,
      'i'
    );
    const inlineMatch = displayName.match(inlinePattern);
    if (inlineMatch) return inlineMatch[1].trim();
  }

  return '';
}

function pickStreet(address = {}) {
  return (
    address.road ||
    address.residential ||
    address.pedestrian ||
    address.neighbourhood ||
    address.suburb ||
    ''
  );
}

function buildLine1(address = {}, displayName = '') {
  const street = pickStreet(address);
  const number =
    (address.house_number && `${address.house_number}`) ||
    (address.house_name && `${address.house_name}`) ||
    (address.building && `${address.building}`) ||
    extractNumberFromDisplay(displayName, street);

  const components = [];
  if (number) components.push(number.trim());
  if (street) {
    const lowerStreet = street.toLowerCase();
    const hasStreetInNumber = number && number.toLowerCase().includes(lowerStreet);
    if (!hasStreetInNumber) components.push(street.trim());
  }

  return {
    line1: components.join(' ').trim(),
    houseNumber: number ? number.trim() : '',
    street: street ? street.trim() : ''
  };
}

function pickCity(address = {}) {
  return (
    address.city ||
    address.town ||
    address.village ||
    address.hamlet ||
    address.county ||
    address.state_district ||
    address.state ||
    ''
  );
}

function pickLocality(address = {}, city = '') {
  const candidates = [
    address.neighbourhood,
    address.suburb,
    address.hamlet,
    address.village,
    address.town
  ].filter(Boolean);
  const unique = candidates.find((entry) => entry && entry !== city);
  return unique || '';
}

function pickCounty(address = {}, city = '') {
  const candidates = [address.county, address.state_district, address.state].filter(Boolean);
  const unique = candidates.find((entry) => entry && entry !== city);
  return unique || '';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed. Use GET.' });
  }

  const { postcode: rawPostcode, limit: rawLimit } = req.query || {};
  if (!rawPostcode || typeof rawPostcode !== 'string') {
    return res.status(400).json({ error: 'Missing postcode.' });
  }

  const formattedPostcode = normalisePostcode(rawPostcode);
  if (!formattedPostcode) {
    return res.status(400).json({ error: 'Invalid postcode format.' });
  }

  const limit = Math.max(1, Math.min(parseInt(rawLimit || '100', 10) || 50, 100));

  try {
    const url = new URL(NOMINATIM_ENDPOINT);
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('countrycodes', 'gb');
    url.searchParams.set('postalcode', formattedPostcode);
    url.searchParams.set('limit', String(limit));

    const upstream = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'MitchsAutoServicesBooking/1.0 (support@mitchsautoservices.co.uk)',
        Accept: 'application/json'
      },
      cache: 'no-store'
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return res.status(upstream.status).json({ error: text || 'Address lookup failed.' });
    }

    const results = await upstream.json();
    if (!Array.isArray(results) || !results.length) {
      // IMPORTANT: return items: [] (what the dropdown expects)
      return res.status(200).json({ items: [] });
    }

    const seen = new Set();
    const addresses = results
      .filter(isEnglandResult)
      .map((result) => {
        const address = result?.address || {};
        const displayName = result?.display_name || '';
        const { line1, houseNumber, street } = buildLine1(address, displayName);
        const city = pickCity(address);
        const locality = pickLocality(address, city);
        const county = pickCounty(address, city);
        const postcode = (address.postcode || formattedPostcode).toUpperCase();

        // Build a clean display string
        const displayParts = [line1, city, county, postcode]
          .filter((part) => part && part.length)
          .map((part) => part.trim());

        const seenParts = new Set();
        const orderedParts = displayParts.filter((part) => {
          const key = part.toLowerCase();
          if (seenParts.has(key)) return false;
          seenParts.add(key);
          return true;
        });

        const display = orderedParts.length
          ? orderedParts.join(', ')
          : result.display_name || postcode;

        return {
          // internal representation
          id: String(result.place_id || `${line1}-${postcode}`),
          line1,
          line2: locality,
          city,
          postcode,
          houseNumber,
          street,
          locality,
          county,
          display
        };
      })
      .filter((entry) => {
        const key = `${entry.display}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return Boolean(entry.display);
      })
      .sort((a, b) => {
        const parseNumber = (value) => {
          if (!value) return Number.POSITIVE_INFINITY;
          const match = `${value}`.match(/\d+/);
          return match ? parseInt(match[0], 10) : Number.POSITIVE_INFINITY;
        };
        const aNum = parseNumber(a.houseNumber);
        const bNum = parseNumber(b.houseNumber);
        if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) {
          return aNum - bNum;
        }
        return a.display.localeCompare(b.display, 'en-GB', { numeric: true, sensitivity: 'base' });
      });

    // 🔑 NORMALISE FOR THE DROPDOWN
    // The dropdown can show `houseNumber` as the visible text while keeping full address.
    const items = addresses.map((a) => ({
      id: a.id,
      value: a.id,
      // What the dropdown can show if you want full text:
      label: a.display,
      // What you can show in the visible option text if you only want numbers:
      houseNumber: a.houseNumber || '',
      // Extra fields to auto-fill other inputs if you want
      line1: a.line1,
      town: a.city,
      postcode: a.postcode
    }));

    return res.status(200).json({ items });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Address lookup failed.' });
  }
}
