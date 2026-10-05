import { Redis } from '@upstash/redis';

let client;

// Works with both env-var names Vercel's Upstash integration may inject.
export function redis() {
  if (globalThis.__TEST_REDIS__) return globalThis.__TEST_REDIS__; // local tests only
  if (client) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error('Redis not configured: connect Upstash Redis to the project (Vercel > Storage).');
  }
  client = new Redis({ url, token });
  return client;
}

export const MAX_POINTS = Number(process.env.MAX_POINTS || 20000);
export const DEVICES_KEY = 'trk:devices';
export const ptsKey = (id) => `trk:pts:${id}`;
export const seqKey = (id) => `trk:seq:${id}`;

// Upstash auto-parses JSON values; a plain string means it didn't.
export const decode = (m) => (typeof m === 'string' ? JSON.parse(m) : m);

// If VIEW_KEY is set, the page's read APIs need ?key=VIEW_KEY.
export function viewAllowed(req) {
  const k = process.env.VIEW_KEY;
  return !k || req.query.key === k || req.headers['x-view-key'] === k;
}
