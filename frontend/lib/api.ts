export type P = { lat: number; lng: number };
export type Place = { fa: string; en: string; at: [number, number] };
export type City = { fa: string; en: string; center: [number, number]; min_fare: number; places: Place[] };
export type Service = { fa: string; en: string; seats: number; base: number; km: number; min: number; commission: number };
export type Meta = {
  cities: Record<string, City>; services: Record<string, Service>; surge_now: number; surge_cap: number;
  first_ride: { off: number; max: number }; cancel: { min: number; max: number }; welcome: number; referral_gift: number;
  org: { commission: number; panel_fee: number }; plate_letters: string[];
};
export type Quote = {
  service: string; fare: number; before_discount: number; discount: number;
  surge: number; minutes: number; km: number; eta: number;
};
export type Status = "searching" | "arriving" | "arrived" | "on_trip" | "completed" | "canceled";
export type Driver = { fa: string; en: string; car_fa: string; car_en: string; plate: string; rating: number; trips: number };
export type Ride = {
  id: string; created: number; city: string; service: string; payment: "wallet" | "cash" | "org";
  pickup: P; dropoff: P; start: P; fare: number; km: number; minutes: number; eta: number; status: Status; progress: number;
  sim: boolean; driver: Driver | null; driver_id: number | null; stars: number | null; cancel_fee: number;
  rider?: { name: string; rating: number }; earning?: number;
};
export type Track = Pick<Ride, "id" | "city" | "service" | "status" | "progress" | "pickup" | "dropoff" | "start" | "eta" | "minutes" | "km" | "driver" | "created">;
export type Txn = { id: number; amount: number; kind: string; ride_id: string | null; created: number };
export type Wallet = { balance: number; points: number; referral: string; txns: Txn[] };
export type Me = {
  id: number; phone: string; name: string; wallet: number; points: number; referral: string; rating: number;
  driver: { car: string; color: string; plate: string; city: string; female: boolean; online: boolean } | null;
  org: { id: number; name: string; admin: boolean } | null;
};
export type DriverSummary = {
  online: boolean; city: string; today: number; week: number[]; trips: number; total: number; rating: number;
  balance: number; commission: number; hotspots: { fa: string; en: string; surge: number }[];
};
export type Org = {
  id: number; name: string; budget: number; spend: number; remaining: number; admin: boolean; commission: number;
  members?: { id: number; name: string; phone: string; spend: number; rides: number; admin: boolean }[];
  rides?: { id: string; status: Status; created: number; name: string; fare: number; service: string }[];
  invoice?: { rides: number; panel_fee: number; total: number };
};
export type Ticket = { id: number; ride_id: string | null; topic: string; body: string; status: "pending" | "urgent"; created: number };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** JSON call to the FastAPI backend (same origin via Next rewrites). A 401 sends the user to login. */
export async function api<T>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
  const r = await fetch("/api" + path, {
    method,
    cache: "no-store",
    ...(body !== undefined && { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  if (r.status === 401 && !location.pathname.startsWith("/login")) location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
  if (!r.ok) {
    const d = (await r.json().catch(() => ({}))).detail;
    throw new ApiError(r.status, typeof d === "string" ? d : r.statusText);
  }
  return r.json();
}

export const ascii = (s: string) => s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
export const faDigits = (s: string) => s.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]);

/** Road route via the public OSRM demo; falls back to a smooth arc when offline. */
export async function route(a: P, b: P): Promise<P[]> {
  try {
    const r = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`,
      { signal: AbortSignal.timeout(4000) },
    );
    const c: [number, number][] = (await r.json()).routes[0].geometry.coordinates;
    return c.map(([lng, lat]) => ({ lat, lng }));
  } catch {
    return arc(a, b);
  }
}

export function arc(a: P, b: P, steps = 32): P[] {
  const mid = { lat: (a.lat + b.lat) / 2 - (b.lng - a.lng) * 0.18, lng: (a.lng + b.lng) / 2 + (b.lat - a.lat) * 0.18 };
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps, u = 1 - t;
    return { lat: u * u * a.lat + 2 * u * t * mid.lat + t * t * b.lat, lng: u * u * a.lng + 2 * u * t * mid.lng + t * t * b.lng };
  });
}

/** Point + heading (deg, 0 = north) at fraction f along a polyline. */
export function along(path: P[], f: number): P & { deg: number } {
  const seg = path.slice(1).map((p, i) => Math.hypot(p.lat - path[i].lat, (p.lng - path[i].lng) * Math.cos((p.lat * Math.PI) / 180)));
  let d = Math.min(Math.max(f, 0), 1) * seg.reduce((s, x) => s + x, 0);
  for (let i = 0; i < seg.length; i++) {
    const a = path[i], b = path[i + 1];
    if (d <= seg[i] || i === seg.length - 1) {
      const k = seg[i] ? Math.min(d / seg[i], 1) : 0;
      const deg = (Math.atan2((b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180), b.lat - a.lat) * 180) / Math.PI;
      return { lat: a.lat + (b.lat - a.lat) * k, lng: a.lng + (b.lng - a.lng) * k, deg };
    }
    d -= seg[i];
  }
  return { ...path[0], deg: 0 };
}
