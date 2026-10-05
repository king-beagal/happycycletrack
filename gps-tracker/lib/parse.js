// Wire format (one point per line, several lines = a batch):
//
//   id,lat,lon,speed,battery,unixtime
//   trk01,30.900965,75.857277,12.4,87,1759678200
//
// id       1–32 chars: letters, digits, _ or -
// lat/lon  decimal degrees (WGS84), at least 5 decimals recommended
// speed    km/h            (optional, may be empty)
// battery  percent 0–100   (optional, may be empty)
// unixtime UTC seconds from the GPS (optional; empty, 0 or implausible → server time)
//
// JSON is also accepted: one object, an array, or {"points":[...]} with
// keys id, lat, lon, spd, bat, ts.

export const ID_RE = /^[A-Za-z0-9_-]{1,32}$/;

const num = (v) => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

export function normalise(p, nowSec) {
  const id = String(p.id ?? '').trim();
  if (!ID_RE.test(id)) return { error: 'bad id' };
  const lat = num(p.lat), lon = num(p.lon);
  if (lat === null || lon === null || Number.isNaN(lat) || Number.isNaN(lon) ||
      lat < -90 || lat > 90 || lon < -180 || lon > 180) return { error: 'bad lat/lon' };
  if (lat === 0 && lon === 0) return { error: 'no fix (0,0)' };

  const spd = num(p.spd), bat = num(p.bat);
  let ts = num(p.ts);
  // GPS time missing, not yet synced, or wildly ahead → use arrival time.
  const fromServer = !(ts > 1_600_000_000 && ts < nowSec + 86_400);
  if (fromServer) ts = nowSec;

  return {
    point: {
      id,
      lat: Math.round(lat * 1e7) / 1e7,
      lon: Math.round(lon * 1e7) / 1e7,
      spd: Number.isNaN(spd) ? null : spd,
      bat: Number.isNaN(bat) || bat === null ? null : Math.max(0, Math.min(100, Math.round(bat))),
      ts: Math.round(ts),
      srv: fromServer || undefined, // marks timestamps the server filled in
    },
  };
}

function fromLine(line) {
  const [id, lat, lon, spd, bat, ts] = line.split(',').map((s) => s.trim());
  return { id, lat, lon, spd, bat, ts };
}

// Turns whatever the HTTP layer handed us into raw point objects.
export function extract(body, query = {}) {
  if (query.d) return String(query.d).split(/[;\n]/).filter(Boolean).map(fromLine); // GET ?d=...

  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    const t = body.trim();
    if (t.startsWith('{') || t.startsWith('[')) {
      try { return extract(JSON.parse(t)); } catch { /* fall through to CSV */ }
    }
    return t.split(/\r?\n|;/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map(fromLine);
  }
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object') {
    if (Array.isArray(body.points)) return body.points;
    if ('lat' in body) return [body];
    // Modem sent CSV as application/x-www-form-urlencoded: each line became a key.
    const text = Object.entries(body).map(([k, v]) => (v ? `${k}=${v}` : k)).join('\n');
    return extract(text);
  }
  return [];
}

export function parsePoints(body, query, nowSec = Math.floor(Date.now() / 1000)) {
  const points = [], errors = [];
  extract(body, query).forEach((raw, i) => {
    const r = normalise(raw, nowSec);
    if (r.error) errors.push(`line ${i + 1}: ${r.error}`);
    else points.push(r.point);
  });
  return { points, errors };
}
