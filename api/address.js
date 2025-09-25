const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';

function normalisePostcode(value = '') {
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleaned) {
    return '';
  }
  return cleaned.replace(/([0-9][A-Z0-9]{2})$/, ' $1');
}

function buildLine1(address = {}) {
  const number = address.house_number ? `${address.house_number}` : '';
  const street = address.road || address.residential || address.neighbourhood || address.suburb || '';
  return [number, street].filter(Boolean).join(' ').trim();
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
      const line1 = buildLine1(address);
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
