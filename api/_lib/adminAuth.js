// Shared helpers for protecting admin routes with a simple password gate.

const PASSWORD = process.env.ADMIN_PASSWORD || process.env.PRICE_ADMIN_PASSWORD;

function decodeBasicAuth(header = '') {
  if (!header || typeof header !== 'string') return null;
  const match = header.match(/^Basic\s+(.*)$/i);
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) return null;
    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1)
    };
  } catch (error) {
    return null;
  }
}

export function isPasswordConfigured() {
  return Boolean(PASSWORD);
}

export function requireAdminAuth(req, res) {
  if (!isPasswordConfigured()) {
    // No password configured; block requests for safety.
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
    res.status(503).json({ error: 'Admin password not configured.' });
    return false;
  }

  const credentials = decodeBasicAuth(req.headers.authorization || '');
  if (!credentials || credentials.password !== PASSWORD) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
    res.status(401).json({ error: 'Authentication required.' });
    return false;
  }

  return true;
}
