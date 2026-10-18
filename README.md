# سفرینو · Safarino

Iranian ride-hailing app on the Uber model, built from the business plan in this folder (`18-business-plan-toolkit_uber_iran_filled.pdf`).

- **frontend/** — Next.js 16 (App Router, Tailwind v4, Motion, Leaflet). Persian (RTL) and English, light and dark mode, responsive.
- **backend/** — FastAPI + SQLite (stdlib `sqlite3`, file `backend/safarino.db`).

## What's in it

| Area | Rider | Driver / business |
|---|---|---|
| Account | Phone number + one-time code login and sign-up, welcome credit, referral gift for both sides, profile | Same account can also drive |
| Rides | Economy, Plus, Ladies (women drivers only), Moto, Courier. Capped surge pricing, first-ride discount, live map with road routes | Sign-up with car, plate and license. Online/offline, live requests, accept, then arrived → start → end |
| Money | Wallet top-up, transaction history, cash / wallet / business payment, tips | Earnings (cash rides count the share kept in hand), what's owed to Safarino, weekly chart |
| Safety | Emergency button (logs an urgent ticket, dials 110), public trip-tracking link to share, masked calling | Ratings both ways |
| Corporate | Business payment method | Organization with monthly budget, members, spend per member, monthly invoice (rides + panel fee) |
| Support | Help center: safety, transparent pricing table, cancellation policy, FAQ, online support tickets | |

Cancellation is free while the driver is still far. Once they're close, a capped fee (5–15k Toman) goes to the driver. If no real driver is online in the city, a simulated fleet takes the ride after 4 seconds, which keeps solo demos working. When a real driver is online, requests wait up to 20 seconds for them.

## Run

```bash
docker compose -p safarino up -d --build      # app :3018, API :8018/docs, DB in the "db" volume
```

Without Docker:

```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/uvicorn main:app --port 8018
cd frontend && npm i && BACKEND_URL=http://localhost:8018 npm run dev -- -p 3018
```

To try both sides, open the app in two browsers (or one normal window and one private window). Sign up with a different phone number in each; one registers as a driver in **Driver hub** and goes online.

## Test

```bash
cd backend && .venv/bin/pip install httpx && .venv/bin/python test_main.py   # auth, pricing, dispatch, fees, org, support
```

## Before going live

- `DEMO_OTP=1` (the default) sends the login code back in the API response. Connect an SMS gateway where `send_otp` prints the code, then set `DEMO_OTP=0`.
- Set `COOKIE_SECURE=1` behind HTTPS.
- Wallet top-up credits instantly. Route it through a Shaparak payment gateway (IPG) that verifies the payment.
- Drivers are approved automatically. Add document upload and review.
- One SQLite connection behind a global lock is fine for a pilot. Move to Postgres when traffic grows.
- Maps use OpenStreetMap tiles and the public OSRM demo router for road routes (falling back to an arc). Self-host both for production traffic.
- Docker builds need outbound network from the Docker VM. On this machine, Docker Desktop couldn't resolve DNS (the host uses a VPN DNS at `10.50.50.1`).
