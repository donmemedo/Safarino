"use client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { P } from "@/lib/api";
import type { Theme } from "@/lib/prefs";

// OSM tiles need no API key; dark mode is a CSS filter on the tile pane (globals.css).
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const carSvg = (body: string) =>
  `<svg width="20" height="38" viewBox="0 0 20 38"><rect x="1" y="1" width="18" height="36" rx="7" fill="${body}" stroke="#0008" stroke-width="1"/><rect x="3.5" y="9" width="13" height="7" rx="2.5" fill="#111" opacity=".8"/><rect x="3.5" y="25" width="13" height="5" rx="2" fill="#111" opacity=".55"/></svg>`;
const icon = (html: string, className = "") => L.divIcon({ className, html, iconSize: [0, 0] });
const carIcon = (deg: number, mine: boolean) =>
  icon(`<div class="car ${mine ? "mine" : ""}" style="--r:${deg}deg">${carSvg(mine ? "#ffd60a" : "#f5f5f7")}</div>`, "glide");

type Props = {
  theme: Theme;
  center: P;
  pickup: P | null;
  dropoff: P | null;
  path: P[] | null;
  dashed?: boolean;
  car: (P & { deg: number }) | null;
  idleCars: boolean;
  fit: P[] | null;
  onTap?: (p: P) => void;
  onPickup?: (p: P) => void;
  /** "panel": leave room for the floating panel / bottom sheet; "none": small embedded map. */
  pad?: "panel" | "none";
};

export default function MapView(p: Props) {
  const el = useRef<HTMLDivElement>(null);
  const r = useRef<{ map: L.Map; a?: L.Marker; b?: L.Marker; line?: L.LayerGroup; car?: L.Marker; idle: L.LayerGroup } | null>(null);
  const cb = useRef(p);
  cb.current = p;

  useEffect(() => {
    const map = L.map(el.current!, { zoomControl: false, attributionControl: true }).setView([p.center.lat, p.center.lng], 14);
    map.attributionControl.setPrefix(false).setPosition("topright");
    L.tileLayer(TILES, { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
    map.on("click", (e) => cb.current.onTap?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    r.current = { map, idle: L.layerGroup().addTo(map) };
    return () => {
      map.remove();
      r.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => void r.current?.map.flyTo([p.center.lat, p.center.lng], 14, { duration: 1.2 }), [p.center]);

  // Pickup (draggable) & dropoff pins
  useEffect(() => {
    const m = r.current!;
    m.a?.remove();
    m.b?.remove();
    if (p.pickup) {
      m.a = L.marker([p.pickup.lat, p.pickup.lng], { icon: icon('<div class="pin pin-a"></div>'), draggable: !!p.onPickup, zIndexOffset: 500 }).addTo(m.map);
      m.a.on("dragend", () => {
        const ll = m.a!.getLatLng();
        cb.current.onPickup?.({ lat: ll.lat, lng: ll.lng });
      });
    }
    if (p.dropoff) m.b = L.marker([p.dropoff.lat, p.dropoff.lng], { icon: icon('<div class="pin pin-b"></div>'), zIndexOffset: 500 }).addTo(m.map);
  }, [p.pickup, p.dropoff, !!p.onPickup]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = r.current!;
    m.line?.remove();
    if (!p.path) return;
    const ll = p.path.map((x) => [x.lat, x.lng] as [number, number]);
    m.line = L.layerGroup([
      L.polyline(ll, { color: "#ffd60a", weight: 12, opacity: 0.35, lineCap: "round" }),
      L.polyline(ll, { color: p.theme === "dark" ? "#f5f5f7" : "#111", weight: 4.5, lineCap: "round", className: p.dashed ? "route-anim" : "" }),
    ]).addTo(m.map);
  }, [p.path, p.dashed, p.theme]);

  useEffect(() => {
    if (p.fit?.length) r.current?.map.flyToBounds(L.latLngBounds(p.fit.map((x) => [x.lat, x.lng])), { ...(p.pad === "none" ? { padding: [30, 30] } : padding()), duration: 1, maxZoom: 16 });
  }, [p.fit]);

  useEffect(() => {
    const m = r.current!;
    if (!p.car) {
      m.car?.remove();
      m.car = undefined;
    } else if (!m.car) {
      m.car = L.marker([p.car.lat, p.car.lng], { icon: carIcon(p.car.deg, true), zIndexOffset: 1000 }).addTo(m.map);
    } else {
      m.car.setLatLng([p.car.lat, p.car.lng]);
      m.car.getElement()?.querySelector<HTMLElement>(".car")?.style.setProperty("--r", `${p.car.deg}deg`);
    }
  }, [p.car]);

  // Ambient nearby cars drifting around the city center
  useEffect(() => {
    const m = r.current!;
    m.idle.clearLayers();
    if (!p.idleCars) return;
    const cars = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      const pos = { lat: p.center.lat + Math.sin(a) * 0.012 * (1 + (i % 3) * 0.4), lng: p.center.lng + Math.cos(a) * 0.016 * (1 + (i % 2) * 0.5), deg: (i * 47) % 360 };
      return { pos, mk: L.marker([pos.lat, pos.lng], { icon: carIcon(pos.deg, false), interactive: false }).addTo(m.idle) };
    });
    const id = setInterval(() => {
      for (const c of cars) {
        c.pos.deg += (Math.random() - 0.5) * 50;
        const rad = (c.pos.deg * Math.PI) / 180;
        c.pos.lat += Math.cos(rad) * 0.0009;
        c.pos.lng += Math.sin(rad) * 0.0011;
        c.mk.setLatLng([c.pos.lat, c.pos.lng]);
        c.mk.getElement()?.querySelector<HTMLElement>(".car")?.style.setProperty("--r", `${c.pos.deg}deg`);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [p.idleCars, p.center]);

  return <div ref={el} dir="ltr" className="absolute inset-0 z-0" />;
}

/** Keep the route clear of the floating panel: side panel on desktop, bottom sheet on mobile. */
function padding(): L.FitBoundsOptions {
  const w = window.innerWidth, h = window.innerHeight, rtl = document.dir === "rtl";
  if (w >= 768) return rtl ? { paddingTopLeft: [60, 100], paddingBottomRight: [470, 60] } : { paddingTopLeft: [470, 100], paddingBottomRight: [60, 60] };
  return { paddingTopLeft: [40, 90], paddingBottomRight: [40, h * 0.5] };
}
