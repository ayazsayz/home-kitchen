"use client";
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { useI18n } from "./I18n";

export type LatLng = { lat: number; lng: number };

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    google?: any;
    __hkMapsReady?: () => void;
  }
}

let googleLoading: Promise<void> | null = null;
function loadGoogle(key: string) {
  if (window.google?.maps?.Map) return Promise.resolve();
  if (!googleLoading) {
    googleLoading = new Promise((resolve, reject) => {
      window.__hkMapsReady = () => resolve();
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&callback=__hkMapsReady`;
      s.async = true;
      s.onerror = () => reject(new Error("Google Maps failed to load"));
      document.head.appendChild(s);
    });
  }
  return googleLoading;
}

/**
 * "Move the map under the pin" location picker.
 * Uses Google Maps when an API key is set, otherwise OpenStreetMap (free, no key).
 */
export default function MapPicker({
  center,
  value,
  onChange,
  googleKey,
}: {
  center: LatLng;
  value: LatLng | null;
  onChange: (v: LatLng) => void;
  googleKey?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const api = useRef<{ setCenter: (p: LatLng) => void } | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [locating, setLocating] = useState(false);
  const { t } = useI18n();
  const [error, setError] = useState("");

  useEffect(() => {
    let cleanup = () => {};
    let cancelled = false;
    const start = value ?? center;
    const zoom = value ? 17 : 12;
    const emit = (p: LatLng) => onChangeRef.current({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) });

    (async () => {
      if (!box.current) return;
      if (googleKey) {
        try {
          await loadGoogle(googleKey);
          if (cancelled || !box.current) return;
          const g = window.google.maps;
          const map = new g.Map(box.current, {
            center: start, zoom, disableDefaultUI: true, zoomControl: true, gestureHandling: "greedy", clickableIcons: false,
          });
          const l = map.addListener("dragend", () => emit(map.getCenter().toJSON()));
          api.current = { setCenter: (p) => { map.setCenter(p); map.setZoom(17); } };
          cleanup = () => g.event.removeListener(l);
          return;
        } catch {
          // fall back to OpenStreetMap below
        }
      }
      const L = (await import("leaflet")).default;
      if (cancelled || !box.current) return;
      const map = L.map(box.current, { zoomControl: true, attributionControl: true }).setView([start.lat, start.lng], zoom);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      map.on("dragend", () => emit(map.getCenter()));
      api.current = { setCenter: (p) => map.setView([p.lat, p.lng], 17) };
      cleanup = () => map.remove();
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleKey]);

  function locate() {
    setError("");
    if (!navigator.geolocation) return setError(t("noGeo"));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p = { lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) };
        api.current?.setCenter(p);
        onChangeRef.current(p);
      },
      () => {
        setLocating(false);
        setError(t("geoFail"));
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative h-64 overflow-hidden rounded-xl border border-line" dir="ltr">
        <div ref={box} className="absolute inset-0 z-0" data-testid="map" />
        {/* Fixed pin in the centre: the customer moves the map under it. */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[500] -translate-x-1/2 -translate-y-full text-4xl drop-shadow" aria-hidden>
          📍
        </div>
        {!value && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 z-[500] text-center">
            <span className="rounded-full bg-ink/80 px-3 py-1 text-xs text-white">{t("dragMap")}</span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost py-2 text-sm" onClick={locate} disabled={locating}>
          {locating ? t("finding") : t("useLocation")}
        </button>
        {value && <span className="text-sm text-ok">{t("pinned")}</span>}
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
