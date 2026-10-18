"""Safarino (سفرینو) API — ride hailing for Iranian cities on the Uber model.

Env: DB_PATH (sqlite file), DEMO_OTP=1 (echo login codes until an SMS gateway is wired), COOKIE_SECURE=1 behind HTTPS.
"""
import json
import math
import os
import random
import re
import secrets
import sqlite3
import threading
import time
from contextlib import contextmanager
from datetime import datetime, timedelta
from typing import Annotated, Literal

from fastapi import Cookie, FastAPI, HTTPException, Response
from pydantic import BaseModel, Field, StringConstraints

DB_PATH = os.getenv("DB_PATH", "safarino.db")
DEMO_OTP = os.getenv("DEMO_OTP", "1") == "1"
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "0") == "1"

app = FastAPI(title="Safarino API", version="2.0.0")

CITIES = {
    "tehran": {"fa": "تهران", "en": "Tehran", "center": [35.7000, 51.3890], "min_fare": 45000, "places": [
        {"fa": "برج میلاد", "en": "Milad Tower", "at": [35.7448, 51.3753]},
        {"fa": "میدان آزادی", "en": "Azadi Square", "at": [35.6997, 51.3380]},
        {"fa": "تجریش", "en": "Tajrish", "at": [35.8043, 51.4337]},
        {"fa": "فرودگاه مهرآباد", "en": "Mehrabad Airport", "at": [35.6892, 51.3134]},
        {"fa": "دانشگاه تهران", "en": "University of Tehran", "at": [35.7036, 51.3960]},
        {"fa": "بازار بزرگ", "en": "Grand Bazaar", "at": [35.6751, 51.4205]},
    ]},
    "karaj": {"fa": "کرج", "en": "Karaj", "center": [35.8327, 50.9915], "min_fare": 35000, "places": [
        {"fa": "میدان آزادگان", "en": "Azadegan Sq.", "at": [35.8260, 50.9690]},
        {"fa": "گوهردشت", "en": "Gohardasht", "at": [35.8150, 50.9380]},
        {"fa": "عظیمیه", "en": "Azimieh", "at": [35.8500, 51.0000]},
    ]},
    "mashhad": {"fa": "مشهد", "en": "Mashhad", "center": [36.2880, 59.6157], "min_fare": 38000, "places": [
        {"fa": "حرم امام رضا", "en": "Imam Reza Shrine", "at": [36.2878, 59.6155]},
        {"fa": "فرودگاه هاشمی‌نژاد", "en": "Mashhad Airport", "at": [36.2352, 59.6410]},
        {"fa": "کوهسنگی", "en": "Kuhsangi Park", "at": [36.2780, 59.5760]},
    ]},
    "isfahan": {"fa": "اصفهان", "en": "Isfahan", "center": [32.6572, 51.6776], "min_fare": 38000, "places": [
        {"fa": "میدان نقش جهان", "en": "Naqsh-e Jahan Sq.", "at": [32.6575, 51.6776]},
        {"fa": "سی‌وسه‌پل", "en": "Si-o-se-pol", "at": [32.6443, 51.6676]},
        {"fa": "پل خواجو", "en": "Khaju Bridge", "at": [32.6366, 51.6800]},
    ]},
    "shiraz": {"fa": "شیراز", "en": "Shiraz", "center": [29.6100, 52.5380], "min_fare": 35000, "places": [
        {"fa": "حافظیه", "en": "Tomb of Hafez", "at": [29.6255, 52.5480]},
        {"fa": "باغ ارم", "en": "Eram Garden", "at": [29.6358, 52.5237]},
        {"fa": "دروازه قرآن", "en": "Quran Gate", "at": [29.6300, 52.5580]},
    ]},
    "tabriz": {"fa": "تبریز", "en": "Tabriz", "center": [38.0800, 46.2919], "min_fare": 35000, "places": [
        {"fa": "ائل‌گلی", "en": "El Goli", "at": [38.0240, 46.3650]},
        {"fa": "بازار تبریز", "en": "Tabriz Bazaar", "at": [38.0810, 46.2930]},
        {"fa": "ارگ علیشاه", "en": "Arg-e Alishah", "at": [38.0720, 46.2870]},
    ]},
}

# Commissions from the business plan: car 12→15%, VIP 18%, moto/courier 15%, corporate 15% + panel fee.
SERVICES = {
    "eco": {"fa": "اقتصادی", "en": "Economy", "base": 25000, "km": 9000, "min": 1500, "commission": 0.12, "seats": 4, "speed": 22},
    "plus": {"fa": "ویژه", "en": "Plus", "base": 40000, "km": 14000, "min": 2500, "commission": 0.18, "seats": 4, "speed": 24},
    "ladies": {"fa": "بانوان", "en": "Ladies", "base": 28000, "km": 9500, "min": 1600, "commission": 0.12, "seats": 4, "speed": 22},
    "moto": {"fa": "موتور", "en": "Moto", "base": 15000, "km": 6000, "min": 800, "commission": 0.15, "seats": 1, "speed": 30},
    "courier": {"fa": "پیک", "en": "Courier", "base": 18000, "km": 6500, "min": 800, "commission": 0.15, "seats": 0, "speed": 30},
}
SURGE_CAP = 1.5
FIRST_RIDE_OFF, FIRST_RIDE_MAX = 0.3, 50000
WELCOME, REFERRAL_GIFT = 100_000, 20_000
ORG_COMMISSION, PANEL_FEE = 0.15, 490_000
CANCEL_MIN, CANCEL_MAX = 5000, 15000
SESSION_TTL, OTP_TTL, OTP_RESEND, OTP_TRIES = 30 * 86400, 120, 60, 5

SIM_DRIVERS = [
    {"fa": "علی رضایی", "en": "Ali Rezaei", "female": False, "car_fa": "پژو ۲۰۶ سفید", "car_en": "White Peugeot 206"},
    {"fa": "محمد کریمی", "en": "Mohammad Karimi", "female": False, "car_fa": "سمند نقره‌ای", "car_en": "Silver Samand"},
    {"fa": "رضا احمدی", "en": "Reza Ahmadi", "female": False, "car_fa": "دنا مشکی", "car_en": "Black Dena"},
    {"fa": "سارا محمدی", "en": "Sara Mohammadi", "female": True, "car_fa": "تیبا سفید", "car_en": "White Tiba"},
    {"fa": "مریم حسینی", "en": "Maryam Hosseini", "female": True, "car_fa": "پژو ۲۰۷ آبی", "car_en": "Blue Peugeot 207"},
]
SIM_LETTERS = "بجدسصطقلمنوی"  # no "ه": it reads like the digit "۵"
PLATE_LETTERS = ["الف", "ب", "پ", "ت", "ث", "ج", "د", "ز", "س", "ش", "ص", "ط", "ع", "ف", "ق", "ک", "گ", "ل", "م", "ن", "و", "ه", "ی"]

# Ride lifecycle. Simulated drivers follow SIM seconds per phase; real drivers advance it themselves.
SIM = {"searching": 4, "arriving": 14, "arrived": 4, "on_trip": 22}
WAIT_REAL = 20  # a request waits this long for a real online driver before the simulated fleet takes it
NEXT = {"arriving": "arrived", "arrived": "on_trip", "on_trip": "completed"}
ACTIVE = ("searching", "arriving", "arrived", "on_trip")


def now() -> float:  # indirection so tests can drive the clock
    return time.time()


def local() -> datetime:
    return datetime.fromtimestamp(now())


SCHEMA = """
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, phone TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  wallet INTEGER NOT NULL DEFAULT 0, points INTEGER NOT NULL DEFAULT 0, referral TEXT UNIQUE NOT NULL,
  org_id INTEGER, created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS otps(phone TEXT PRIMARY KEY, code TEXT NOT NULL, expires REAL NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0, sent REAL NOT NULL);
CREATE TABLE IF NOT EXISTS drivers(user_id INTEGER PRIMARY KEY, car TEXT NOT NULL, color TEXT NOT NULL,
  plate TEXT NOT NULL, license TEXT NOT NULL, female INTEGER NOT NULL, city TEXT NOT NULL,
  online INTEGER NOT NULL DEFAULT 0, created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS rides(id TEXT PRIMARY KEY, rider_id INTEGER NOT NULL, driver_id INTEGER,
  org_id INTEGER, status TEXT NOT NULL, created REAL NOT NULL, data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS rides_rider ON rides(rider_id, created);
CREATE INDEX IF NOT EXISTS rides_status ON rides(status);
CREATE TABLE IF NOT EXISTS txns(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, amount INTEGER NOT NULL,
  kind TEXT NOT NULL, ride_id TEXT, created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS orgs(id INTEGER PRIMARY KEY, name TEXT NOT NULL, budget INTEGER NOT NULL,
  admin_id INTEGER NOT NULL, created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS tickets(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, ride_id TEXT,
  topic TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL, created REAL NOT NULL);
"""
db = sqlite3.connect(DB_PATH, check_same_thread=False, isolation_level=None)
db.row_factory = sqlite3.Row
db.executescript(SCHEMA)
_lock = threading.Lock()


@contextmanager
def tx():
    """One serialized transaction per request.
    ponytail: global lock on a single connection; move to Postgres + a pool when traffic grows."""
    with _lock:
        db.execute("BEGIN IMMEDIATE")
        try:
            yield
        except BaseException:
            db.execute("ROLLBACK")
            raise
        db.execute("COMMIT")


def one(sql, *a):
    r = db.execute(sql, a).fetchone()
    return dict(r) if r else None


def rows(sql, *a):
    return [dict(r) for r in db.execute(sql, a).fetchall()]


def val(sql, *a):
    r = db.execute(sql, a).fetchone()
    return r[0] if r else None


# ---------- models ----------
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=60)]
Budget = Annotated[int, Field(ge=100_000, le=10_000_000_000)]


class LatLng(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class QuoteIn(BaseModel):
    city: str
    pickup: LatLng
    dropoff: LatLng


class RideIn(QuoteIn):
    service: str
    payment: Literal["wallet", "cash", "org"] = "wallet"


class RateIn(BaseModel):
    stars: int = Field(ge=1, le=5)
    tip: int = Field(0, ge=0, le=200000)
    comment: str = Field("", max_length=500)


class StarsIn(BaseModel):
    stars: int = Field(ge=1, le=5)


class TopUpIn(BaseModel):
    amount: int = Field(gt=0, le=10_000_000)


class PhoneIn(BaseModel):
    phone: str = Field(max_length=20)


class VerifyIn(PhoneIn):
    code: str = Field(max_length=10)
    name: str = Field("", max_length=60)
    referral: str = Field("", max_length=20)


class NameIn(BaseModel):
    name: Name


class DriverIn(BaseModel):
    car: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=40)]
    color: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=20)]
    plate: str = Field(max_length=20)
    license: str = Field(max_length=20)
    female: bool = False
    city: str


class OnlineIn(BaseModel):
    online: bool


class OrgIn(BaseModel):
    name: Name
    budget: Budget


class BudgetIn(BaseModel):
    budget: Budget


class TicketIn(BaseModel):
    topic: Literal["ride", "payment", "safety", "driver", "account", "other"]
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=1000)]
    ride_id: str | None = Field(None, max_length=32)


# ---------- helpers ----------
_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def ascii_digits(s: str) -> str:
    return s.translate(_DIGITS)


def norm_phone(s: str) -> str:
    p = re.sub(r"^(\+98|0098|98)(?=9)", "0", re.sub(r"[\s\-()]", "", ascii_digits(s)))
    if not re.fullmatch(r"09[0-9]{9}", p):
        raise HTTPException(422, "invalid phone")
    return p


def mask(phone: str) -> str:
    return phone[:4] + "***" + phone[-4:]


def haversine_km(a: LatLng, b: LatLng) -> float:
    p1, p2 = math.radians(a.lat), math.radians(b.lat)
    dp, dl = p2 - p1, math.radians(b.lng - a.lng)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def road_km(q: QuoteIn) -> float:
    return haversine_km(q.pickup, q.dropoff) * 1.3  # straight line → street distance


def surge_for(hour: int) -> float:
    if hour in (7, 8, 17, 18, 19):
        return min(1.35, SURGE_CAP)
    if hour >= 23 or hour < 5:
        return 1.15
    return 1.0


def quote_fare(city: str, service: str, km: float, hour: int, first_ride: bool) -> dict:
    s, c = SERVICES[service], CITIES[city]
    minutes = max(3, round(km / s["speed"] * 60))
    surge = surge_for(hour)
    raw = max(c["min_fare"], (s["base"] + km * s["km"] + minutes * s["min"]) * surge)
    discount = min(raw * FIRST_RIDE_OFF, FIRST_RIDE_MAX) if first_ride else 0
    fare = round((raw - discount) / 1000) * 1000  # Toman, rounded to 1,000
    return {"service": service, "fare": fare, "before_discount": round(raw / 1000) * 1000,
            "discount": round(discount / 1000) * 1000, "surge": surge, "minutes": minutes,
            "km": round(km, 1), "eta": random.randint(2, 7)}


def cancel_fee(r: dict) -> int:
    """Free while searching or while the driver is still far; a capped fee once they are close or waiting."""
    if r["status"] == "arrived" or (r["status"] == "arriving" and r["progress"] > 0.5):
        return max(CANCEL_MIN, min(CANCEL_MAX, round(r["fare"] * 0.1 / 1000) * 1000))
    return 0


def check(city: str, service: str | None = None):
    if city not in CITIES:
        raise HTTPException(404, "unknown city")
    if service is not None and service not in SERVICES:
        raise HTTPException(404, "unknown service")


def month_start() -> float:
    return local().replace(day=1, hour=0, minute=0, second=0, microsecond=0).timestamp()


def credit(uid: int, amount: int, kind: str, ride_id: str | None = None):
    db.execute("UPDATE users SET wallet = wallet + ? WHERE id=?", (amount, uid))
    db.execute("INSERT INTO txns(user_id, amount, kind, ride_id, created) VALUES (?,?,?,?,?)", (uid, amount, kind, ride_id, now()))


def rating_of(col: str, uid: int, field: str) -> float:
    v = val(f"SELECT AVG(json_extract(data, '$.{field}')) FROM rides WHERE {col}=? AND json_extract(data, '$.{field}') IS NOT NULL", uid)
    return round(v, 2) if v else 5.0


def auth(sid: str | None) -> dict:
    u = sid and one("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token=? AND s.created > ?",
                    sid, now() - SESSION_TTL)
    if not u:
        raise HTTPException(401, "login required")
    return u


def me_out(u: dict) -> dict:
    u = one("SELECT * FROM users WHERE id=?", u["id"])
    d = one("SELECT car, color, plate, city, female, online FROM drivers WHERE user_id=?", u["id"])
    o = u["org_id"] and one("SELECT id, name, admin_id FROM orgs WHERE id=?", u["org_id"])
    return {**{k: u[k] for k in ("id", "phone", "name", "wallet", "points", "referral")},
            "rating": rating_of("rider_id", u["id"], "rider_stars"),
            "driver": d and {**d, "female": bool(d["female"]), "online": bool(d["online"])},
            "org": o and {"id": o["id"], "name": o["name"], "admin": o["admin_id"] == u["id"]}}


# ---------- rides ----------
RIDE_COLS = ("id", "rider_id", "driver_id", "org_id", "status", "created")


def load(rid: str) -> dict:
    row = one("SELECT * FROM rides WHERE id=?", rid)
    if not row:
        raise HTTPException(404, "ride not found")
    return json.loads(row.pop("data")) | row


def save(r: dict):
    data = json.dumps({k: v for k, v in r.items() if k not in RIDE_COLS})
    db.execute("UPDATE rides SET status=?, driver_id=?, data=? WHERE id=?", (r["status"], r["driver_id"], data, r["id"]))


def free_drivers(city: str, female_only: bool, exclude: int) -> list[dict]:
    return rows("""SELECT d.*, u.name FROM drivers d JOIN users u ON u.id = d.user_id
        WHERE d.online=1 AND d.city=? AND d.user_id != ? AND (d.female=1 OR ?=0) AND d.user_id NOT IN
        (SELECT driver_id FROM rides WHERE driver_id IS NOT NULL AND status IN ('arriving','arrived','on_trip'))""",
                city, exclude, int(female_only))


def sim_driver(r: dict) -> dict:
    rnd = random.Random(r["id"])
    d = rnd.choice([x for x in SIM_DRIVERS if x["female"]] if r["service"] == "ladies" else SIM_DRIVERS)
    plate = f"{rnd.randint(11, 99)} {rnd.choice(SIM_LETTERS)} {rnd.randint(111, 999)} - {rnd.randint(10, 99)}"
    return {**{k: d[k] for k in ("fa", "en", "car_fa", "car_en")}, "plate": plate,
            "rating": round(rnd.uniform(4.6, 5.0), 2), "trips": rnd.randint(300, 4000)}


def real_driver(d: dict) -> dict:
    car = f"{d['car']} {d['color']}"
    return {"fa": d["name"], "en": d["name"], "car_fa": car, "car_en": car, "plate": d["plate"],
            "rating": rating_of("driver_id", d["user_id"], "stars"),
            "trips": val("SELECT COUNT(*) FROM rides WHERE driver_id=? AND status='completed'", d["user_id"])}


def assign(r: dict, driver: dict, at: float, driver_id: int | None = None):
    r.update(status="arriving", since=at, sim=driver_id is None, driver=driver, driver_id=driver_id, progress=0)


def settle(r: dict):
    """Charge the rider and pay the driver exactly once."""
    r["progress"] = 1
    if r.get("settled"):
        return
    r.update(settled=True, done_at=now())
    if r["payment"] == "wallet":
        credit(r["rider_id"], -r["fare"], "ride", r["id"])
    db.execute("UPDATE users SET points = points + ? WHERE id=?", (r["fare"] // 10000, r["rider_id"]))
    if r["driver_id"]:
        cut = round(r["fare"] * r["commission"])
        credit(r["driver_id"], -cut if r["payment"] == "cash" else r["fare"] - cut, "earning", r["id"])


def advance(r: dict) -> dict:
    """Bring a ride up to date with the clock (simulated phases, real-driver progress estimate)."""
    if r["status"] not in ACTIVE:
        return r
    t = now()
    while r["status"] in ACTIVE:
        el = t - r["since"]
        if r["status"] == "searching":
            wait = WAIT_REAL if free_drivers(r["city"], r["service"] == "ladies", r["rider_id"]) else SIM["searching"]
            if el < wait:
                r["progress"] = round(el / wait, 3)
                break
            assign(r, sim_driver(r), r["since"] + wait)
        elif not r["sim"]:
            expect = {"arriving": r["eta"] * 60, "arrived": 1, "on_trip": r["minutes"] * 60}[r["status"]]
            r["progress"] = 1 if r["status"] == "arrived" else min(0.95, round(el / expect, 3))
            break
        elif el < SIM[r["status"]]:
            r["progress"] = round(el / SIM[r["status"]], 3)
            break
        else:
            r["since"] += SIM[r["status"]]
            r["status"] = NEXT[r["status"]]
    if r["status"] == "completed":
        settle(r)
    save(r)
    return r


def ride_out(r: dict) -> dict:
    out = {k: v for k, v in r.items() if k != "settled"}
    out["cancel_fee"] = cancel_fee(r) if r["status"] in ("arriving", "arrived") else r.get("cancel_fee", 0)
    return out


def my_ride(rid: str, u: dict) -> dict:
    r = advance(load(rid))
    if u["id"] not in (r["rider_id"], r["driver_id"]):
        raise HTTPException(404, "ride not found")
    return r


def first_ride(uid: int) -> bool:
    return not val("SELECT 1 FROM rides WHERE rider_id=? AND status='completed' LIMIT 1", uid)


def org_spend(org_id: int) -> int:
    return val("SELECT COALESCE(SUM(json_extract(data, '$.fare')), 0) FROM rides WHERE org_id=? AND status != 'canceled' AND created >= ?",
               org_id, month_start())


# ---------- public ----------
@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/meta")
def meta():
    return {"cities": CITIES,
            "services": {k: {x: v[x] for x in ("fa", "en", "seats", "base", "km", "min", "commission")} for k, v in SERVICES.items()},
            "surge_now": surge_for(local().hour), "surge_cap": SURGE_CAP,
            "first_ride": {"off": FIRST_RIDE_OFF, "max": FIRST_RIDE_MAX}, "cancel": {"min": CANCEL_MIN, "max": CANCEL_MAX},
            "welcome": WELCOME, "referral_gift": REFERRAL_GIFT, "org": {"commission": ORG_COMMISSION, "panel_fee": PANEL_FEE},
            "plate_letters": PLATE_LETTERS}


@app.get("/api/track/{rid}")
def track(rid: str):
    """Shared trip link for family: live status and driver, no money or rider details."""
    with tx():
        r = advance(load(rid))
    keys = ("id", "city", "service", "status", "progress", "pickup", "dropoff", "start", "eta", "minutes", "km", "driver", "created")
    return {k: r.get(k) for k in keys}


# ---------- auth ----------
@app.post("/api/auth/otp")
def send_otp(body: PhoneIn):
    phone = norm_phone(body.phone)
    with tx():
        prev = one("SELECT sent FROM otps WHERE phone=?", phone)
        if prev and now() - prev["sent"] < OTP_RESEND:
            raise HTTPException(429, "wait before requesting another code")
        code = f"{secrets.randbelow(100000):05d}"
        db.execute("INSERT OR REPLACE INTO otps(phone, code, expires, tries, sent) VALUES (?,?,?,0,?)",
                   (phone, code, now() + OTP_TTL, now()))
        is_new = not one("SELECT 1 FROM users WHERE phone=?", phone)
    # ponytail: no SMS gateway yet; send `code` via an SMS provider (e.g. Kavenegar) and set DEMO_OTP=0
    print(f"[otp] {phone}: {code}", flush=True)
    return {"sent": True, "is_new": is_new, "ttl": OTP_TTL, "resend": OTP_RESEND, **({"dev_code": code} if DEMO_OTP else {})}


@app.post("/api/auth/verify")
def verify_otp(body: VerifyIn, response: Response):
    phone, code, wrong = norm_phone(body.phone), ascii_digits(body.code).strip(), False
    with tx():
        o = one("SELECT * FROM otps WHERE phone=?", phone)
        if not o or o["expires"] < now():
            raise HTTPException(410, "code expired")
        if o["tries"] >= OTP_TRIES:
            raise HTTPException(429, "too many attempts")
        if not secrets.compare_digest(o["code"], code):
            db.execute("UPDATE otps SET tries = tries + 1 WHERE phone=?", (phone,))
            wrong = True
        else:
            u = one("SELECT * FROM users WHERE phone=?", phone)
            referral_applied = False
            if not u:
                name = body.name.strip()
                if not 2 <= len(name) <= 60:
                    raise HTTPException(422, "name required")
                ref = "SF" + secrets.token_hex(3).upper()
                while one("SELECT 1 FROM users WHERE referral=?", ref):
                    ref = "SF" + secrets.token_hex(3).upper()
                uid = db.execute("INSERT INTO users(phone, name, referral, created) VALUES (?,?,?,?)",
                                 (phone, name, ref, now())).lastrowid
                credit(uid, WELCOME, "welcome")
                inviter = body.referral.strip() and one("SELECT id FROM users WHERE referral=?", body.referral.strip().upper())
                if inviter:
                    credit(uid, REFERRAL_GIFT, "referral")
                    credit(inviter["id"], REFERRAL_GIFT, "referral")
                    referral_applied = True
                u = one("SELECT * FROM users WHERE id=?", uid)
            db.execute("DELETE FROM otps WHERE phone=?", (phone,))
            token = secrets.token_urlsafe(32)
            db.execute("INSERT INTO sessions(token, user_id, created) VALUES (?,?,?)", (token, u["id"], now()))
            out = me_out(u) | {"referral_applied": referral_applied}
    if wrong:
        raise HTTPException(400, "wrong code")
    response.set_cookie("sid", token, max_age=SESSION_TTL, httponly=True, samesite="lax", secure=COOKIE_SECURE, path="/")
    return out


@app.post("/api/auth/logout")
def logout(response: Response, sid: str | None = Cookie(None)):
    with tx():
        db.execute("DELETE FROM sessions WHERE token=?", (sid,))
    response.delete_cookie("sid", path="/")
    return {"ok": True}


@app.get("/api/me")
def me(sid: str | None = Cookie(None)):
    with tx():
        return me_out(auth(sid))


@app.post("/api/me")
def update_me(body: NameIn, sid: str | None = Cookie(None)):
    with tx():
        u = auth(sid)
        db.execute("UPDATE users SET name=? WHERE id=?", (body.name, u["id"]))
        return me_out(u)


# ---------- rider ----------
@app.post("/api/quote")
def quote(q: QuoteIn, sid: str | None = Cookie(None)):
    check(q.city)
    with tx():
        first = first_ride(auth(sid)["id"])
    km, hour = road_km(q), local().hour
    return [quote_fare(q.city, s, km, hour, first) for s in SERVICES]


@app.post("/api/rides")
def create_ride(body: RideIn, sid: str | None = Cookie(None)):
    check(body.city, body.service)
    with tx():
        u = auth(sid)
        for x in rows("SELECT id FROM rides WHERE rider_id=? AND status IN ('searching','arriving','arrived','on_trip')", u["id"]):
            if advance(load(x["id"]))["status"] in ACTIVE:
                raise HTTPException(409, "active ride exists")
        q = quote_fare(body.city, body.service, road_km(body), local().hour, first_ride(u["id"]))
        commission, org_id = SERVICES[body.service]["commission"], None
        if body.payment == "wallet" and u["wallet"] < q["fare"]:
            raise HTTPException(402, "insufficient wallet balance")
        if body.payment == "org":
            if not u["org_id"]:
                raise HTTPException(403, "not in an organization")
            o = one("SELECT * FROM orgs WHERE id=?", u["org_id"])
            if o["budget"] - org_spend(o["id"]) < q["fare"]:
                raise HTTPException(402, "organization budget exceeded")
            commission, org_id = ORG_COMMISSION, o["id"]
        rid = secrets.token_hex(8)  # also the unguessable share-link token
        rnd, p = random.Random(rid), body.pickup
        data = {"city": body.city, "service": body.service, "payment": body.payment, "pickup": p.model_dump(),
                "dropoff": body.dropoff.model_dump(), "commission": commission, "since": now(), "sim": True, "progress": 0,
                "driver": None, "stars": None, "tip": 0, "comment": "", "rider_stars": None,
                "start": {"lat": p.lat + rnd.uniform(-.012, .012), "lng": p.lng + rnd.uniform(-.012, .012)},
                **{k: q[k] for k in ("fare", "discount", "km", "minutes", "eta", "surge")}}
        db.execute("INSERT INTO rides VALUES (?,?,?,?,?,?,?)", (rid, u["id"], None, org_id, "searching", now(), json.dumps(data)))
        return ride_out(load(rid))


@app.get("/api/rides")
def list_rides(sid: str | None = Cookie(None)):
    with tx():
        u = auth(sid)
        ids = rows("SELECT id FROM rides WHERE rider_id=? ORDER BY created DESC LIMIT 50", u["id"])
        return [ride_out(advance(load(x["id"]))) for x in ids]


@app.get("/api/rides/{rid}")
def get_ride(rid: str, sid: str | None = Cookie(None)):
    with tx():
        return ride_out(my_ride(rid, auth(sid)))


@app.post("/api/rides/{rid}/cancel")
def cancel_ride(rid: str, sid: str | None = Cookie(None)):
    with tx():
        u = auth(sid)
        r = my_ride(rid, u)
        if r["rider_id"] != u["id"] or r["status"] not in ("searching", "arriving", "arrived"):
            raise HTTPException(409, "cannot cancel now")
        fee = cancel_fee(r)
        if fee:
            credit(u["id"], -fee, "cancel_fee", rid)
            if r["driver_id"]:
                credit(r["driver_id"], fee, "cancel_comp", rid)
        r.update(status="canceled", cancel_fee=fee)
        save(r)
        return ride_out(r)


@app.post("/api/rides/{rid}/rate")
def rate_ride(rid: str, body: RateIn, sid: str | None = Cookie(None)):
    with tx():
        u = auth(sid)
        r = my_ride(rid, u)
        if r["rider_id"] != u["id"] or r["status"] != "completed" or r["stars"] is not None:
            raise HTTPException(409, "cannot rate this ride")
        if body.tip:
            if u["wallet"] < body.tip:
                raise HTTPException(402, "insufficient wallet balance")
            credit(u["id"], -body.tip, "tip", rid)
            if r["driver_id"]:
                credit(r["driver_id"], body.tip, "tip_in", rid)
        r.update(stars=body.stars, tip=body.tip, comment=body.comment.strip())
        save(r)
        return ride_out(r)


@app.post("/api/rides/{rid}/sos")
def sos(rid: str, sid: str | None = Cookie(None)):
    with tx():
        u = auth(sid)
        r = my_ride(rid, u)
        body = f"SOS · {r['status']} · {r['pickup']['lat']:.5f},{r['pickup']['lng']:.5f}"
        db.execute("INSERT INTO tickets(user_id, ride_id, topic, body, status, created) VALUES (?,?,?,?,?,?)",
                   (u["id"], rid, "safety", body, "urgent", now()))
    return {"ok": True, "emergency": "110"}


# ---------- wallet ----------
def wallet_out(u: dict) -> dict:
    u = one("SELECT * FROM users WHERE id=?", u["id"])
    return {"balance": u["wallet"], "points": u["points"], "referral": u["referral"],
            "txns": rows("SELECT id, amount, kind, ride_id, created FROM txns WHERE user_id=? ORDER BY id DESC LIMIT 50", u["id"])}


@app.get("/api/wallet")
def wallet(sid: str | None = Cookie(None)):
    with tx():
        return wallet_out(auth(sid))


@app.post("/api/wallet/topup")
def topup(body: TopUpIn, sid: str | None = Cookie(None)):
    # ponytail: credits instantly; route through a Shaparak payment gateway with callback verification before real money
    with tx():
        u = auth(sid)
        credit(u["id"], body.amount, "topup")
        return wallet_out(u)


# ---------- driver ----------
def driver_of(u: dict) -> dict:
    d = one("SELECT * FROM drivers WHERE user_id=?", u["id"])
    if not d:
        raise HTTPException(403, "not a driver")
    return d


def active_as_driver(uid: int) -> dict | None:
    x = one("SELECT id FROM rides WHERE driver_id=? AND status IN ('arriving','arrived','on_trip')", uid)
    return x and load(x["id"])


def driver_view(r: dict) -> dict:
    rider = one("SELECT name FROM users WHERE id=?", r["rider_id"])
    return ride_out(r) | {"rider": {"name": rider["name"], "rating": rating_of("rider_id", r["rider_id"], "rider_stars")},
                          "earning": r["fare"] - round(r["fare"] * r["commission"])}


@app.post("/api/driver/register")
def driver_register(body: DriverIn, sid: str | None = Cookie(None)):
    check(body.city)
    plate, lic = ascii_digits(body.plate).strip(), ascii_digits(body.license).strip()
    if not re.fullmatch(rf"[0-9]{{2}} ({'|'.join(PLATE_LETTERS)}) [0-9]{{3}} - [0-9]{{2}}", plate):
        raise HTTPException(422, "invalid plate")
    if not re.fullmatch(r"[0-9]{10}", lic):
        raise HTTPException(422, "invalid license")
    with tx():
        u = auth(sid)
        if active_as_driver(u["id"]):
            raise HTTPException(409, "finish the active ride first")
        # ponytail: auto-approved; add document upload + manual review before launch
        db.execute("""INSERT INTO drivers(user_id, car, color, plate, license, female, city, online, created)
            VALUES (?,?,?,?,?,?,?,0,?) ON CONFLICT(user_id) DO UPDATE SET car=excluded.car, color=excluded.color,
            plate=excluded.plate, license=excluded.license, female=excluded.female, city=excluded.city""",
                   (u["id"], body.car, body.color, plate, lic, int(body.female), body.city, now()))
        return me_out(u)


@app.post("/api/driver/online")
def driver_online(body: OnlineIn, sid: str | None = Cookie(None)):
    with tx():
        u = auth(sid)
        driver_of(u)
        if not body.online and active_as_driver(u["id"]):
            raise HTTPException(409, "finish the active ride first")
        db.execute("UPDATE drivers SET online=? WHERE user_id=?", (int(body.online), u["id"]))
        return {"online": body.online}


@app.get("/api/driver/summary")
def driver_summary(sid: str | None = Cookie(None)):
    with tx():
        u = auth(sid)
        d = driver_of(u)
        day0 = local().replace(hour=0, minute=0, second=0, microsecond=0)
        bounds = [(day0 + timedelta(days=i - 6)).timestamp() for i in range(8)]  # 7 day windows ending today
        # Earnings = driver share of completed fares (cash included, collected in hand) + tips + cancel compensation.
        share = """SELECT COALESCE(SUM(json_extract(data, '$.fare') - ROUND(json_extract(data, '$.fare') * json_extract(data, '$.commission'))), 0)
            FROM rides WHERE driver_id=? AND status='completed' AND json_extract(data, '$.done_at') >= ? AND json_extract(data, '$.done_at') < ?"""
        extra = "SELECT COALESCE(SUM(amount), 0) FROM txns WHERE user_id=? AND kind IN ('tip_in', 'cancel_comp') AND created >= ? AND created < ?"
        week = [int(val(share, u["id"], a, b) + val(extra, u["id"], a, b)) for a, b in zip(bounds, bounds[1:])]
        done = "SELECT COUNT(*) FROM rides WHERE driver_id=? AND status='completed'"
        hour = local().hour
        rnd = random.Random(f"{d['city']}{day0.date()}{hour}")
        return {"online": bool(d["online"]), "city": d["city"], "today": week[-1], "week": week,
                "trips": val(done + " AND json_extract(data, '$.done_at') >= ?", u["id"], bounds[6]), "total": val(done, u["id"]),
                "rating": rating_of("driver_id", u["id"], "stars"), "balance": u["wallet"], "commission": SERVICES["eco"]["commission"],
                # ponytail: demand heat is a time-of-day estimate; compute it from live request density once volume exists
                "hotspots": [{"fa": p["fa"], "en": p["en"], "surge": round(min(SURGE_CAP, surge_for(hour) * rnd.uniform(1.0, 1.3)), 2)}
                             for p in CITIES[d["city"]]["places"][:4]]}


@app.get("/api/driver/requests")
def driver_requests(sid: str | None = Cookie(None)):
    with tx():
        u = auth(sid)
        d = driver_of(u)
        if not d["online"] or active_as_driver(u["id"]):
            return []
        out = []
        for x in rows("SELECT id FROM rides WHERE status='searching' AND rider_id != ? ORDER BY created", u["id"]):
            r = advance(load(x["id"]))
            if r["status"] == "searching" and r["city"] == d["city"] and (r["service"] != "ladies" or d["female"]):
                out.append(driver_view(r))
        return out


@app.get("/api/driver/active")
def driver_active(sid: str | None = Cookie(None)):
    with tx():
        u = auth(sid)
        driver_of(u)
        r = active_as_driver(u["id"])
        return r and driver_view(advance(r))


@app.post("/api/driver/rides/{rid}/accept")
def driver_accept(rid: str, sid: str | None = Cookie(None)):
    with tx():
        u = auth(sid)
        d = driver_of(u)
        if not d["online"] or active_as_driver(u["id"]):
            raise HTTPException(409, "not available")
        r = advance(load(rid))
        if r["status"] != "searching" or r["city"] != d["city"] or r["rider_id"] == u["id"] or (r["service"] == "ladies" and not d["female"]):
            raise HTTPException(409, "ride no longer available")
        assign(r, real_driver(d | {"name": u["name"]}), now(), u["id"])
        save(r)
        return driver_view(r)


@app.post("/api/driver/rides/{rid}/advance")
def driver_step(rid: str, sid: str | None = Cookie(None)):
    with tx():
        u = auth(sid)
        r = advance(load(rid))
        if r["driver_id"] != u["id"] or r["status"] not in NEXT:
            raise HTTPException(409, "invalid step")
        r.update(status=NEXT[r["status"]], since=now(), progress=0)
        if r["status"] == "completed":
            settle(r)
        save(r)
        return driver_view(r)


@app.post("/api/driver/rides/{rid}/rate")
def driver_rate_rider(rid: str, body: StarsIn, sid: str | None = Cookie(None)):
    with tx():
        u = auth(sid)
        r = load(rid)
        if r["driver_id"] != u["id"] or r["status"] != "completed" or r.get("rider_stars") is not None:
            raise HTTPException(409, "cannot rate this ride")
        r["rider_stars"] = body.stars
        save(r)
    return {"ok": True}


# ---------- corporate ----------
def my_org(u: dict, admin: bool = False) -> dict:
    o = u["org_id"] and one("SELECT * FROM orgs WHERE id=?", u["org_id"])
    if not o:
        raise HTTPException(404, "no organization")
    if admin and o["admin_id"] != u["id"]:
        raise HTTPException(403, "admin only")
    return o


def org_out(o: dict, u: dict) -> dict:
    spend = org_spend(o["id"])
    out = {"id": o["id"], "name": o["name"], "budget": o["budget"], "spend": spend, "remaining": max(0, o["budget"] - spend),
           "admin": o["admin_id"] == u["id"], "commission": ORG_COMMISSION}
    if not out["admin"]:
        return out
    members = rows("""SELECT u.id, u.name, u.phone,
        COALESCE(SUM(CASE WHEN r.status != 'canceled' THEN json_extract(r.data, '$.fare') END), 0) AS spend,
        COALESCE(SUM(CASE WHEN r.status = 'completed' THEN 1 END), 0) AS rides
        FROM users u LEFT JOIN rides r ON r.rider_id = u.id AND r.org_id = ? AND r.created >= ?
        WHERE u.org_id = ? GROUP BY u.id ORDER BY spend DESC""", o["id"], month_start(), o["id"])
    recent = rows("""SELECT r.id, r.status, r.created, u.name, json_extract(r.data, '$.fare') AS fare,
        json_extract(r.data, '$.service') AS service FROM rides r JOIN users u ON u.id = r.rider_id
        WHERE r.org_id=? ORDER BY r.created DESC LIMIT 20""", o["id"])
    return out | {"members": [m | {"phone": mask(m["phone"]), "admin": m["id"] == o["admin_id"]} for m in members],
                  "rides": recent, "invoice": {"rides": spend, "panel_fee": PANEL_FEE, "total": spend + PANEL_FEE}}


@app.post("/api/org")
def create_org(body: OrgIn, sid: str | None = Cookie(None)):
    with tx():
        u = auth(sid)
        if u["org_id"]:
            raise HTTPException(409, "already in an organization")
        oid = db.execute("INSERT INTO orgs(name, budget, admin_id, created) VALUES (?,?,?,?)",
                         (body.name, body.budget, u["id"], now())).lastrowid
        db.execute("UPDATE users SET org_id=? WHERE id=?", (oid, u["id"]))
        return org_out(one("SELECT * FROM orgs WHERE id=?", oid), u)


@app.get("/api/org")
def get_org(sid: str | None = Cookie(None)):
    with tx():
        u = auth(sid)
        return org_out(my_org(u), u)


@app.post("/api/org/budget")
def set_budget(body: BudgetIn, sid: str | None = Cookie(None)):
    with tx():
        u = auth(sid)
        o = my_org(u, admin=True)
        db.execute("UPDATE orgs SET budget=? WHERE id=?", (body.budget, o["id"]))
        return org_out(o | {"budget": body.budget}, u)


@app.post("/api/org/members")
def add_member(body: PhoneIn, sid: str | None = Cookie(None)):
    phone = norm_phone(body.phone)
    with tx():
        u = auth(sid)
        o = my_org(u, admin=True)
        m = one("SELECT id, org_id FROM users WHERE phone=?", phone)
        if not m:
            raise HTTPException(404, "user not found")
        if m["org_id"]:
            raise HTTPException(409, "already in an organization")
        db.execute("UPDATE users SET org_id=? WHERE id=?", (o["id"], m["id"]))
        return org_out(o, u)


@app.delete("/api/org/members/{uid}")
def remove_member(uid: int, sid: str | None = Cookie(None)):
    with tx():
        u = auth(sid)
        o = my_org(u, admin=True)
        if uid == o["admin_id"]:
            raise HTTPException(409, "admin cannot be removed")
        db.execute("UPDATE users SET org_id=NULL WHERE id=? AND org_id=?", (uid, o["id"]))
        return org_out(o, u)


# ---------- support ----------
def tickets_of(u: dict) -> list[dict]:
    return rows("SELECT id, ride_id, topic, body, status, created FROM tickets WHERE user_id=? ORDER BY id DESC", u["id"])


@app.get("/api/tickets")
def list_tickets(sid: str | None = Cookie(None)):
    with tx():
        return tickets_of(auth(sid))


@app.post("/api/tickets")
def new_ticket(body: TicketIn, sid: str | None = Cookie(None)):
    with tx():
        u = auth(sid)
        if body.ride_id:
            my_ride(body.ride_id, u)
        db.execute("INSERT INTO tickets(user_id, ride_id, topic, body, status, created) VALUES (?,?,?,?,?,?)",
                   (u["id"], body.ride_id, body.topic, body.body, "pending", now()))
        return tickets_of(u)
