"""End-to-end checks: python test_main.py  (needs `pip install httpx` for FastAPI's TestClient)."""
import os

os.environ["DB_PATH"] = ":memory:"
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from main import SURGE_CAP, LatLng, haversine_km, quote_fare, surge_for  # noqa: E402

clock = [1_900_000_000.0]
main.now = lambda: clock[0]


def tick(s):
    clock[0] += s


# --- pricing ---
assert 9 < haversine_km(LatLng(lat=35.6997, lng=51.3380), LatLng(lat=35.8043, lng=51.4337)) < 16
assert all(surge_for(h) <= SURGE_CAP for h in range(24))
q = quote_fare("tehran", "eco", 10, 12, first_ride=False)
assert q["fare"] % 1000 == 0 and q["discount"] == 0
assert quote_fare("tehran", "eco", 0.1, 12, False)["fare"] == main.CITIES["tehran"]["min_fare"]
d = quote_fare("tehran", "plus", 30, 12, first_ride=True)
assert 0 < d["discount"] <= main.FIRST_RIDE_MAX and d["fare"] < d["before_discount"]
assert quote_fare("tehran", "eco", 10, 18, False)["fare"] > q["fare"]  # rush hour costs more


# --- auth ---
def login(phone, name, ref=""):
    c = TestClient(main.app)
    r = c.post("/api/auth/otp", json={"phone": phone}).json()
    assert r["is_new"], r
    assert c.post("/api/auth/verify", json={"phone": phone, "code": r["dev_code"], "name": name, "referral": ref}).status_code == 200
    return c


anon = TestClient(main.app)
assert anon.get("/api/me").status_code == 401
assert anon.post("/api/auth/otp", json={"phone": "12345"}).status_code == 422
anon.post("/api/auth/otp", json={"phone": "09120000009"})
assert anon.post("/api/auth/otp", json={"phone": "09120000009"}).status_code == 429  # resend throttle
for _ in range(main.OTP_TRIES):
    assert anon.post("/api/auth/verify", json={"phone": "09120000009", "code": "xxxxx", "name": "X Y"}).status_code == 400
assert anon.post("/api/auth/verify", json={"phone": "09120000009", "code": "xxxxx"}).status_code == 429

rider = login("۰۹۱۲ ۱۱۱ ۲۲۳۳", "Rider One")  # Persian digits + spaces normalize
me = rider.get("/api/me").json()
assert me["phone"] == "09121112233" and me["wallet"] == main.WELCOME
friend = login("+989350000001", "Friend Two", me["referral"])
assert friend.get("/api/me").json()["wallet"] == main.WELCOME + main.REFERRAL_GIFT
start = main.WELCOME + main.REFERRAL_GIFT
assert rider.get("/api/wallet").json()["balance"] == start

# --- simulated ride, wallet payment ---
trip = {"city": "tehran", "pickup": {"lat": 35.70, "lng": 51.389}, "dropoff": {"lat": 35.7448, "lng": 51.3753}}
far = trip | {"dropoff": {"lat": 35.8043, "lng": 51.4337}}
assert all(x["discount"] > 0 for x in rider.post("/api/quote", json=trip).json())
r = rider.post("/api/rides", json=trip | {"service": "eco"}).json()
assert r["status"] == "searching"
assert rider.post("/api/rides", json=trip | {"service": "eco"}).status_code == 409  # one active ride
assert friend.get(f"/api/rides/{r['id']}").status_code == 404  # not yours
tick(5)
assert rider.get(f"/api/rides/{r['id']}").json()["status"] == "arriving"
tick(60)
done = rider.get(f"/api/rides/{r['id']}").json()
assert done["status"] == "completed"
rider.get(f"/api/rides/{r['id']}")  # re-read must not charge twice
assert rider.get("/api/wallet").json()["balance"] == start - done["fare"]
assert rider.post(f"/api/rides/{r['id']}/rate", json={"stars": 5, "tip": 5000}).status_code == 200
assert rider.post(f"/api/rides/{r['id']}/rate", json={"stars": 4}).status_code == 409
assert rider.get("/api/wallet").json()["balance"] == start - done["fare"] - 5000
assert all(x["discount"] == 0 for x in rider.post("/api/quote", json=trip).json())  # first-ride promo used

t = anon.get(f"/api/track/{r['id']}").json()  # public share link hides money
assert t["status"] == "completed" and "fare" not in t and "payment" not in t

# --- cancellation: free while searching, capped fee once the driver is close ---
r2 = rider.post("/api/rides", json=trip | {"service": "eco", "payment": "cash"}).json()
assert rider.post(f"/api/rides/{r2['id']}/cancel").json()["cancel_fee"] == 0
r3 = rider.post("/api/rides", json=trip | {"service": "eco", "payment": "cash"}).json()
tick(4 + 14 + 1)  # driver has arrived
before = rider.get("/api/wallet").json()["balance"]
c = rider.post(f"/api/rides/{r3['id']}/cancel").json()
assert c["status"] == "canceled" and main.CANCEL_MIN <= c["cancel_fee"] <= main.CANCEL_MAX
assert rider.get("/api/wallet").json()["balance"] == before - c["cancel_fee"]

# --- real driver dispatch ---
drv = login("09370000002", "Driver Three")
car = {"car": "Peugeot 206", "color": "white", "plate": "۱۲ ب ۳۴۵ - ۶۷", "license": "1234567890", "city": "tehran"}
assert drv.post("/api/driver/register", json=car | {"plate": "12 X 345 - 67"}).status_code == 422
assert drv.post("/api/driver/register", json=car).json()["driver"]["plate"] == "12 ب 345 - 67"
drv.post("/api/driver/online", json={"online": True})
r4 = rider.post("/api/rides", json=trip | {"service": "eco", "payment": "cash"}).json()
lady = friend.post("/api/rides", json=trip | {"service": "ladies", "payment": "cash"}).json()
tick(10)  # past the simulated-fleet cutoff, but a real driver is online so the request waits
assert [x["id"] for x in drv.get("/api/driver/requests").json()] == [r4["id"]]  # male driver doesn't get Ladies
a = drv.post(f"/api/driver/rides/{r4['id']}/accept").json()
assert a["status"] == "arriving" and a["driver"]["fa"] == "Driver Three" and not a["sim"]
assert drv.post(f"/api/driver/rides/{lady['id']}/accept").status_code == 409
assert drv.post("/api/driver/online", json={"online": False}).status_code == 409
for step in ("arrived", "on_trip", "completed"):
    assert drv.post(f"/api/driver/rides/{r4['id']}/advance").json()["status"] == step
cut = round(a["fare"] * main.SERVICES["eco"]["commission"])
s = drv.get("/api/driver/summary").json()
assert s["trips"] == 1 and s["today"] == a["fare"] - cut  # driver keeps the cash share...
assert s["balance"] == main.WELCOME - cut  # ...and owes Safarino the commission
assert drv.post(f"/api/driver/rides/{r4['id']}/rate", json={"stars": 4}).status_code == 200
assert rider.get("/api/me").json()["rating"] == 4
drv.post("/api/driver/online", json={"online": False})
friend.post(f"/api/rides/{lady['id']}/cancel")

# --- corporate ---
assert rider.post("/api/org", json={"name": "Darvag", "budget": 1_000_000}).json()["admin"]
assert rider.post("/api/org/members", json={"phone": "09999999999"}).status_code == 404
rider.post("/api/org/members", json={"phone": "09350000001"})
r5 = friend.post("/api/rides", json=trip | {"service": "eco", "payment": "org"}).json()
assert r5["commission"] == main.ORG_COMMISSION
tick(60)
assert friend.get(f"/api/rides/{r5['id']}").json()["status"] == "completed"
o = rider.get("/api/org").json()
assert o["spend"] == r5["fare"] and o["invoice"]["total"] == r5["fare"] + main.PANEL_FEE and len(o["members"]) == 2
assert "members" not in friend.get("/api/org").json()  # members see only their budget
rider.post("/api/org/budget", json={"budget": 100_000})
assert friend.post("/api/rides", json=far | {"service": "plus", "payment": "org"}).status_code == 402

# --- support ---
assert len(rider.post("/api/tickets", json={"topic": "payment", "body": "Charged twice"}).json()) == 1
assert rider.post(f"/api/rides/{r['id']}/sos").json()["emergency"] == "110"
assert rider.get("/api/tickets").json()[0]["status"] == "urgent"
assert rider.post("/api/auth/logout").status_code == 200 and rider.get("/api/me").status_code == 401
print("ok")
