import { redis, ptsKey, decode, viewAllowed } from '../lib/store.js';
import { ID_RE } from '../lib/parse.js';

// GET /api/points?device=trk01&after=<seq>
// Returns points with seq > after (all stored points when after is 0 or missing).
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!viewAllowed(req)) return res.status(401).json({ error: 'view key required' });

  const id = String(req.query.device || '');
  if (!ID_RE.test(id)) return res.status(400).json({ error: 'bad device id' });
  const after = Math.max(0, parseInt(req.query.after, 10) || 0);

  const db = redis();
  const first = await db.lindex(ptsKey(id), 0);
  if (!first) return res.json({ device: id, points: [] });

  const firstSeq = decode(first).seq;
  const start = Math.max(0, after - firstSeq + 1);
  const raw = await db.lrange(ptsKey(id), start, -1);
  return res.json({ device: id, firstSeq, points: raw.map(decode) });
}
