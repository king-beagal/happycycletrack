# GPS Tracker (Vercel)

Receives GPS points from the tracker over HTTPS, stores them with timestamps, and shows a
live map (current position pin + path so far) with a downloadable `.txt` log underneath.

```
api/ingest.js    device → server   (POST or GET, protected by INGEST_KEY)
api/points.js    page ← points     (incremental: only new points each poll)
api/devices.js   page ← device list
public/index.html  the map + log page
tools/simulate.mjs fake route sender for testing without hardware
```

Vercel can't host an MQTT broker, so the device sends **HTTPS requests** instead
(the EC200U has a built-in HTTP(S) client: `AT+QHTTP...`).

---

## 1. Deploy

1. Put this folder in a GitHub repo and import it at **vercel.com → Add New → Project**
   (framework preset: **Other**, no build command).
   Or from this folder: `npx vercel`.
2. **Add a database:** project → **Storage** → create/connect an **Upstash Redis** database.
   Vercel adds its URL and token to the project automatically
   (`KV_REST_API_URL` / `KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`; both work).
3. **Environment variables:** project → Settings → Environment Variables

   | Name | Required | Purpose |
   |---|---|---|
   | `INGEST_KEY` | yes | Secret the device must send. Use a long random string. |
   | `VIEW_KEY` | no | If set, the page needs `?key=VIEW_KEY` in its address. |
   | `MAX_POINTS` | no | Points kept per device (default 20000; oldest are dropped). |

4. **Redeploy** so the new variables take effect.
5. Test without hardware:
   ```
   node tools/simulate.mjs https://YOUR-APP.vercel.app YOUR_INGEST_KEY trk01 30 2
   ```
   Open `https://YOUR-APP.vercel.app` and watch the pin move.

---

## 2. Data format (what the device sends)

One point per line; several lines in one request = a batch.

```
id,lat,lon,speed,battery,unixtime
trk01,30.900965,75.857277,12.4,87,1759678200
```

| Field | Meaning |
|---|---|
| `id` | Device name, 1–32 chars: letters, digits, `_` `-` |
| `lat`, `lon` | Decimal degrees, 6 decimals (≈ 10 cm) |
| `speed` | km/h, optional (leave empty: `trk01,30.9,75.8,,87,1759678200`) |
| `battery` | %, optional |
| `unixtime` | UTC seconds from the GPS. Empty or `0` → server uses arrival time (shown in orange in the log) |

Points at exactly `0,0` (no fix) are rejected. The server replies `OK <n>` or `ERR <reason>`.

**Endpoint:** `POST https://YOUR-APP.vercel.app/api/ingest?key=INGEST_KEY`
with the lines as a `text/plain` body. JSON (`{"id","lat","lon","spd","bat","ts"}`, an array of those,
or `{"points":[...]}`) is accepted too.

**Simplest possible (GET):**
`https://YOUR-APP.vercel.app/api/ingest?key=INGEST_KEY&d=trk01,30.900965,75.857277,12.4,87,1759678200`
(separate batched points with `;`).

**Batching:** send fixes every 30 s in one POST every 5–10 min, one per line; each point keeps its own GPS time,
so the path is exact even though uploads are spaced out. About 45 bytes per point.

---

## 3. EC200U commands (STM32 sends these over UART)

Vercel only serves **HTTPS** (plain HTTP gets a redirect the modem won't follow), so SSL must be configured once.

```
AT+QICSGP=1,1,"jionet","","",1          // APN: Jio "jionet", Airtel "airtelgprs.com", Vi "www"
AT+QIACT=1                              // activate data; keep it active between sends
AT+QHTTPCFG="contextid",1
AT+QHTTPCFG="contenttype",1             // 1 = text/plain
AT+QHTTPCFG="sslctxid",1
AT+QSSLCFG="sslversion",1,4             // all TLS versions
AT+QSSLCFG="ciphersuite",1,0xFFFF
AT+QSSLCFG="seclevel",1,0               // no certificate check (simplest); see note below
AT+QSSLCFG="sni",1,1                    // Vercel needs SNI enabled
```

Each send:
```
AT+QHTTPURL=<url length>,80      → CONNECT, then write: https://YOUR-APP.vercel.app/api/ingest?key=KEY
AT+QHTTPPOST=<body length>,80,80 → CONNECT, then write the CSV line(s)
                                 ← +QHTTPPOST: 0,200,<len>     (200 = stored)
AT+QHTTPREAD=80                  ← OK 1
```
The URL only needs setting once per power-up if it doesn't change.

Notes:
- Exact parameter support varies by EC200U firmware; check Quectel's *EC200U HTTP(S)* and *SSL* application notes for your version.
- `seclevel 0` encrypts but doesn't verify the server. For stronger security, upload the CA certificate to the modem and use `seclevel 1`.
- If `+QHTTPPOST` returns a non-200 code, keep the points and resend them in the next batch.

---

## 4. The page

- Map: pulsing pin = latest position, grey dot = start, green line = path.
  **Follow** keeps the latest point in view; dragging the map turns it off. **Fit path** zooms to the whole route.
- Device dropdown appears when more than one tracker is reporting. The address bar remembers it (`?device=trk01`).
- Log: newest first; click a row to show that point on the map. **Download .txt** saves every stored point:
  ```
  # time (UTC+05:30), latitude, longitude, speed_kmh, battery_pct
  2026-10-05 21:30:00, 30.9009650, 75.8572770, 12.4, 87
  ```
- Updates every 10 s while the tab is visible.

**Database usage:** each device upload ≈ 4 Redis commands; each page refresh ≈ 3 (so one open tab ≈ 26k/day).
Check your Upstash plan's limits; raise `POLL_MS` in `public/index.html` if needed.

**Clearing data:** delete the `trk:*` keys in the Upstash console (Data Browser).
