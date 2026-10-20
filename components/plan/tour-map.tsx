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
  const plateRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [frame, setFrame] = useState<{ w: number; h: number } | undefined>();
  const [avoid, setAvoid] = useState<{ x: number; y: number; w: number; h: number } | undefined>();

  // Measure the plate and the CONUS card so the route is fitted to the real
  // box and every leg stays clear of the card.
  useEffect(() => {
    const plate = plateRef.current;
    const shell = shellRef.current;
    if (!plate || !shell || typeof ResizeObserver === "undefined") {
      return;
    }
    const measure = () => {
      const box = plate.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) {
        return;
      }
      setFrame({ w: box.width, h: box.height });
      const card = shell.querySelector<HTMLElement>(".atlas-inset")?.getBoundingClientRect();
      if (!card || card.width === 0) {
        setAvoid(undefined);
        return;
      }
      const x = card.left - box.left;
      const y = card.top - box.top;
      const overlaps = x < box.width && y < box.height && x + card.width > 0 && y + card.height > 0;
      setAvoid(overlaps ? { x, y, w: card.width, h: card.height } : undefined);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(plate);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [stopKey]);

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
          // Keep the underlay's padding clear of the CONUS card too.
          const card = hostRef.current?.closest(".atlas-shell")?.querySelector<HTMLElement>(".atlas-inset");
          const extraRight = card ? Math.min(card.offsetWidth, 220) : 0;
          const extraBottom = card ? Math.min(card.offsetHeight, 160) : 0;
          map.fitBounds(bounds, {
            padding: { top: 56, left: 56, right: 56 + extraRight, bottom: 56 + extraBottom },
            duration: 0,
            maxZoom: 6.2,
          });
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
    <div className="atlas-shell" ref={shellRef}>
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
        <div className="atlas-plate-map" ref={plateRef}>
          <div ref={hostRef} className="absolute inset-0 z-0" style={{ opacity: tilesReady ? 1 : 0 }} aria-hidden />
          <RouteAtlas
            stops={stops}
            showBase
            showLocator={false}
            dimBase={tilesReady}
            selectedOrder={selectedOrder}
            onSelect={onSelect}
            frame={frame}
            avoid={avoid}
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
