const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const mod = await import('@vercel/blob');
    const modKeys = Object.keys(mod || {});
    const defaultKeys = mod && mod.default ? Object.keys(mod.default) : [];
    const found = {
      hasList: typeof mod.list === 'function' || (mod.default && typeof mod.default.list === 'function'),
      hasPut: typeof mod.put === 'function' || (mod.default && typeof mod.default.put === 'function')
    };
    return res.json({ modKeys, defaultKeys, found });
  } catch (err) {
    console.error('debug-blob error', err);
    return res.status(500).json({ error: err.message });
  }
}
