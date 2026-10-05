import { redis, MAX_POINTS, DEVICES_KEY, ptsKey, seqKey } from '../lib/store.js';
import { parsePoints } from '../lib/parse.js';

// POST /api/ingest?key=INGEST_KEY   body: CSV lines (see lib/parse.js)
// GET  /api/ingest?key=INGEST_KEY&d=trk01,30.9,75.85,12.4,87,1759678200
// Replies with plain text so a modem can check it easily: "OK <n>" or "ERR <reason>".
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).send('ERR method');

  const expected = process.env.INGEST_KEY;
  if (!expected) return res.status(500).send('ERR INGEST_KEY not set on server');
  if (req.query.key !== expected && req.headers['x-key'] !== expected) return res.status(401).send('ERR key');

  const { points, errors } = parsePoints(req.body, req.query);
  if (!points.length) return res.status(400).send(`ERR ${errors[0] || 'no points'}`);

  const byDevice = new Map();
  for (const p of points) {
    if (!byDevice.has(p.id)) byDevice.set(p.id, []);
    byDevice.get(p.id).push(p);
  }

  const db = redis();
  const rx = Date.now();
  for (const [id, list] of byDevice) {
    // Sequence numbers let the page fetch only what's new, even after old points are trimmed.
    const last = await db.incrby(seqKey(id), list.length);
    let seq = last - list.length;
    const items = list.map(({ id: _drop, ...p }) => JSON.stringify({ ...p, seq: ++seq, rx }));
    await db.rpush(ptsKey(id), ...items);
    await db.ltrim(ptsKey(id), -MAX_POINTS, -1);
    const latest = list.reduce((a, b) => (b.ts >= a.ts ? b : a));
    await db.hset(DEVICES_KEY, { [id]: JSON.stringify({ lat: latest.lat, lon: latest.lon, ts: latest.ts, rx, seq: last }) });
  }

  const warn = errors.length ? ` (${errors.length} skipped)` : '';
  return res.status(200).send(`OK ${points.length}${warn}`);
}
