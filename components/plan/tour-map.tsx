"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ConusLocator } from "@/components/plan/conus-locator";
import { RouteAtlas } from "@/components/plan/route-atlas";
import type { RoutedStop } from "@/lib/types";

type TourMapProps = {
  stops: RoutedStop[];
  selectedOrder?: number | null;
  onSelect?: (stop: RoutedStop) => void;
};

const TILE_STYLE = "https://tiles.openfreemap.org/styles/dark";

function tilesDisabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return new URLSearchParams(window.location.search).get("atlas") === "offline";
}

export function TourMap({ stops, selectedOrder, onSelect }: TourMapProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapId = useId();
  const stopKey = stops.map((stop) => `${stop.order}:${stop.city.name}`).join("|");
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const tilesReady = readyFor === stopKey;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || stops.length === 0 || tilesDisabled()) {
      return;
    }
    let cancelled = false;
    let map: import("maplibre-gl").Map | undefined;

    const start = async () => {
      try {
        const maplibre = await import("maplibre-gl");
        maplibre.setWorkerUrl("/maplibre-gl-worker.mjs");
        await import("maplibre-gl/dist/maplibre-gl.css");
        if (cancelled || !hostRef.current) {
          return;
        }
        const first = stops[0]!.city;
        map = new maplibre.Map({
          container: hostRef.current,
          style: TILE_STYLE,
          center: [first.lon, first.lat],
          zoom: 4,
          attributionControl: false,
          interactive: false,
        });
        map.on("load", () => {
          if (cancelled || !map) {
            return;
          }
          const bounds = new maplibre.LngLatBounds();
          for (const stop of stops) {
            bounds.extend([stop.city.lon, stop.city.lat]);
          }
          map.fitBounds(bounds, { padding: 56, duration: 0, maxZoom: 6.2 });
          setReadyFor(stopKey);
        });
      } catch {
        if (!cancelled) {
          setReadyFor((current) => (current === stopKey ? null : current));
        }
      }
    };

    void start();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [mapId, stopKey, stops]);

  if (stops.length === 0) {
    return (
      <div className="atlas-shell grid place-items-center text-sm text-[var(--color-muted)]">
        The atlas stays closed until cities land.
      </div>
    );
  }

  return (
    <div className="atlas-shell">
      <div className="atlas-legend-wrap">
        <ol className="atlas-legend" aria-label="Tour stops">
          {stops.map((stop) => (
            <li key={`${stop.order}-${stop.city.name}`}>
              <button
                type="button"
                className={selectedOrder === stop.order ? "legend-row is-selected" : "legend-row"}
                onClick={() => onSelect?.(stop)}
              >
                <span className="text-[var(--color-accent)]">{String(stop.order).padStart(2, "0")}</span>
                {stop.city.name}, {stop.city.region}
              </button>
            </li>
          ))}
        </ol>
      </div>
      <div className="atlas-plate">
        <div className="atlas-plate-map">
          <div ref={hostRef} className="absolute inset-0 z-0" style={{ opacity: tilesReady ? 1 : 0 }} aria-hidden />
          <RouteAtlas
            stops={stops}
            showBase
            showLocator={false}
            dimBase={tilesReady}
            selectedOrder={selectedOrder}
            onSelect={onSelect}
            className="absolute inset-0 z-[2] block h-full w-full"
          />
          <p className="ticket-kicker pointer-events-none absolute top-3 right-3 z-[3] bg-[var(--color-bg)] px-2 py-1 text-[var(--color-accent)]">
            Plate · {tilesReady ? "OpenFreeMap underlay" : "offline CONUS"}
          </p>
        </div>
      </div>
      <ConusLocator stops={stops} />
    </div>
  );
}
