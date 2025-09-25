const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';

function normalisePostcode(value = '') {
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleaned) {
    return '';
  }
  return cleaned.replace(/([0-9][A-Z0-9]{2})$/, ' $1');
}

function escapeRegExp(value = '') {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const POSTCODE_PATTERN = /^[A-Z]{1,2}\d[A-Z0-9]?\s*\d[A-Z]{2}$/i;

function extractNumberFromDisplay(displayName = '', street = '') {
  if (!displayName) {
    return '';
  }

  const parts = displayName.split(',').map(part => part.trim()).filter(Boolean);
  if (!parts.length) {
    return '';
  }

  const lowerStreet = street ? street.toLowerCase() : '';
  const candidateParts = [];

  for (let index = 0; index < parts.length && index < 4; index += 1) {
    candidateParts.push(parts[index]);
  }

  if (street) {
    parts.forEach(part => {
      if (part.toLowerCase().includes(lowerStreet)) {
        candidateParts.push(part);
      }
    });
  }

  const seen = new Set();

  for (const part of candidateParts) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }

    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) {
      continue;
    }
    seen.add(lower);

    if (POSTCODE_PATTERN.test(trimmed) || !/\d/.test(trimmed)) {
      continue;
    }

    if (!street || lower.includes(lowerStreet)) {
      return trimmed;
    }

    const descriptorMatch = trimmed.match(/((?:no\.?|number|unit|flat|suite|apartment|block|building|house)\s*\d+[A-Za-z0-9]*(?:[-\/]\d+[A-Za-z0-9]*)?)/i);
    if (descriptorMatch) {
      return descriptorMatch[1].trim();
    }

    const directMatch = trimmed.match(/(\d+[A-Za-z0-9]*(?:[-\/]\d+[A-Za-z0-9]*)?)/);
    if (directMatch) {
      return directMatch[1];
    }
  }

  if (street) {
    const inlinePattern = new RegExp(`((?:no\.?|number|unit|flat|suite|apartment|block|building|house)?\s*\d+[A-Za-z0-9]*(?:[-\/]\d+[A-Za-z0-9]*)?)\\s+${escapeRegExp(street)}`, 'i');
    const inlineMatch = displayName.match(inlinePattern);
    if (inlineMatch) {
      return inlineMatch[1].trim();
    }
  }

  return '';
}

function buildLine1(address = {}, displayName = '') {
  const street = address.road || address.residential || address.neighbourhood || address.suburb || '';
  const number =
    (address.house_number && `${address.house_number}`) ||
    (address.house_name && `${address.house_name}`) ||
    (address.building && `${address.building}`) ||
    extractNumberFromDisplay(displayName, street);

  const components = [];

  if (number) {
    components.push(number.trim());
  }

  if (street) {
    const lowerStreet = street.toLowerCase();
    const hasStreetInNumber = number && number.toLowerCase().includes(lowerStreet);
    if (!hasStreetInNumber) {
      components.push(street.trim());
    }
  }

  return components.join(' ').trim();
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

function pickLine2(address = {}, city = '') {
  const candidates = [
    address.neighbourhood,
    address.suburb,
    address.hamlet,
    address.village,
    address.town,
    address.county
  ].filter(Boolean);

  const unique = candidates.find(entry => entry && entry !== city);
  return unique || '';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed. Use GET.' });
  }

  const { postcode: rawPostcode } = req.query || {};
  if (!rawPostcode || typeof rawPostcode !== 'string') {
    return res.status(400).json({ error: 'Missing postcode.' });
  }

  const formattedPostcode = normalisePostcode(rawPostcode);
  if (!formattedPostcode) {
    return res.status(400).json({ error: 'Invalid postcode format.' });
  }

  try {
    const url = new URL(NOMINATIM_ENDPOINT);
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('countrycodes', 'gb');
    url.searchParams.set('postalcode', formattedPostcode);
    url.searchParams.set('limit', '50');

    const upstream = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'MitchsAutoServicesBooking/1.0 (support@mitchsautoservices.co.uk)',
        'Accept': 'application/json'
      },
      cache: 'no-store'
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return res.status(upstream.status).json({ error: text || 'Address lookup failed.' });
    }

    const results = await upstream.json();
    if (!Array.isArray(results) || !results.length) {
      return res.status(200).json({ addresses: [] });
    }

    const seen = new Set();
    const addresses = results.map(result => {
      const address = result?.address || {};
      const displayName = result?.display_name || '';
      const line1 = buildLine1(address, displayName);
      const city = pickCity(address);
      const line2 = pickLine2(address, city);
      const postcode = (address.postcode || formattedPostcode).toUpperCase();
      const displayParts = [line1, line2 && line2 !== city ? line2 : '', city, postcode]
        .filter(part => part && part.length)
        .map(part => part.trim());

      const display = displayParts.length ? displayParts.join(', ') : result.display_name || postcode;

      return {
        id: String(result.place_id || `${line1}-${postcode}`),
        line1,
        line2,
        city,
        postcode,
        display
      };
    }).filter(entry => {
      const key = `${entry.display}`.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    return res.status(200).json({ addresses });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Address lookup failed.' });
  }
}
