// Helper to call the DVLA vehicle enquiry API via server-side fetch.
// Both the VRM lookup and quote endpoint reuse this logic.

const DVLA_ENDPOINT = 'https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles';

function normaliseReg(value = '') {
  return value.toUpperCase().replace(/\s+/g, '');
}

export function getApiKey() {
  return process.env.DVLA_API_KEY || 'ZQHFV22Ym6ao1CfyyqEol2oxzpoWQM2w59rAkPro';
}

export async function fetchVehicleByReg(reg) {
  const cleaned = normaliseReg(reg);
  if (!cleaned || cleaned.length < 5) {
    const err = new Error('Invalid registration');
    err.statusCode = 400;
    throw err;
  }

  const response = await fetch(DVLA_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey()
    },
    body: JSON.stringify({ registrationNumber: cleaned }),
    cache: 'no-store'
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const err = new Error((data && data.message) || 'DVLA lookup failed');
    err.statusCode = response.status;
    throw err;
  }

  return data;
}

export { normaliseReg };
