// Sends a fake route to your deployment so you can check the map before the hardware is ready.
//   node tools/simulate.mjs https://your-app.vercel.app YOUR_INGEST_KEY [deviceId] [points] [intervalSec]
// Each point is sent as its own request, the way the tracker will send it.

const [base, key, id = 'trk01', count = '30', every = '2'] = process.argv.slice(2);
if (!base || !key) {
  console.log('usage: node tools/simulate.mjs <base-url> <ingest-key> [deviceId] [points] [intervalSec]');
  process.exit(1);
}

let lat = 30.9010, lon = 75.8573;          // starting point; change to anywhere you like
let heading = Math.random() * 360;

for (let i = 0; i < Number(count); i++) {
  heading += (Math.random() - 0.5) * 40;
  const step = 0.0004 + Math.random() * 0.0003;
  lat += step * Math.cos(heading * Math.PI / 180);
  lon += step * Math.sin(heading * Math.PI / 180);
  const spd = (20 + Math.random() * 25).toFixed(1);
  const bat = Math.max(5, 95 - Math.floor(i / 5));
  const ts = Math.floor(Date.now() / 1000);
  const line = `${id},${lat.toFixed(6)},${lon.toFixed(6)},${spd},${bat},${ts}`;

  const r = await fetch(`${base.replace(/\/$/, '')}/api/ingest?key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: line,
  });
  console.log(line, '→', r.status, await r.text());
  await new Promise((res) => setTimeout(res, Number(every) * 1000));
}
