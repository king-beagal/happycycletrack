import { redis, DEVICES_KEY, decode, viewAllowed } from '../lib/store.js';

// GET /api/devices → [{ id, lat, lon, ts, rx, seq }], most recently heard first.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!viewAllowed(req)) return res.status(401).json({ error: 'view key required' });

  const all = (await redis().hgetall(DEVICES_KEY)) || {};
  const devices = Object.entries(all)
    .map(([id, v]) => ({ id, ...decode(v) }))
    .sort((a, b) => b.rx - a.rx);
  return res.json({ devices });
}
