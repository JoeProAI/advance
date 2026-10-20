"use client";

import { ConusLocator } from "@/components/plan/conus-locator";
import {
  ATLAS_HEIGHT,
  ATLAS_LAYOUT,
  ATLAS_WIDTH,
  projectInBounds,
  routeViewBounds,
  statePathsInBounds,
} from "@/lib/geo/atlas";
import type { RoutedStop } from "@/lib/types";
import { cn } from "@/lib/utils";

type RouteAtlasProps = {
  stops: RoutedStop[];
  showBase?: boolean;
  dimBase?: boolean;
  showLocator?: boolean;
  className?: string;
  selectedOrder?: number | null;
  onSelect?: (stop: RoutedStop) => void;
};

function polyline(points: Array<{ x: number; y: number }>): string {
  return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

export function RouteAtlas({
  stops,
  showBase = true,
  dimBase = false,
  showLocator = true,
  className,
  selectedOrder,
  onSelect,
}: RouteAtlasProps) {
  const mapRect = ATLAS_LAYOUT.map;
  const view = routeViewBounds(stops.map((stop) => stop.city));
  const clipId = `atlas-map-${stops.map((stop) => stop.order).join("") || "empty"}`;
  const states = statePathsInBounds(view, mapRect);

  const points = stops.map((stop) => ({
    stop,
    ...projectInBounds(stop.city.lon, stop.city.lat, view, mapRect),
  }));
  const line = polyline(points);
  const landFill = dimBase ? "var(--color-atlas-land-dim)" : "var(--color-atlas-land)";
  const waterFill = dimBase ? "var(--color-atlas-water-dim)" : "var(--color-atlas-water)";
  const lineColor = dimBase ? "var(--color-atlas-state-dim)" : "var(--color-atlas-state)";

  return (
    <div className={cn("atlas-frame", className)}>
      <svg
        className="atlas-map"
        viewBox={`0 0 ${ATLAS_WIDTH} ${ATLAS_HEIGHT}`}
        width="100%"
        height="100%"
        role="img"
        aria-label={
          stops.length === 0
            ? "Closed atlas plate of the contiguous United States"
            : `Tour route across ${stops.map((stop) => stop.city.name).join(", ")}`
        }
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={mapRect.x} y={mapRect.y} width={mapRect.w} height={mapRect.h} />
          </clipPath>
        </defs>
        <rect width={ATLAS_WIDTH} height={ATLAS_HEIGHT} fill={waterFill} />

        {showBase ? (
          <g clipPath={`url(#${clipId})`} fillRule="evenodd">
            {states.map((state) => (
              <path
                key={state.name}
                d={state.d}
                fill={landFill}
                stroke={lineColor}
                strokeWidth={1}
                strokeLinejoin="round"
              />
            ))}
          </g>
        ) : null}

        <g clipPath={`url(#${clipId})`}>
          {points.length > 1 ? (
            <>
              <polyline
                points={line}
                fill="none"
                stroke="var(--color-atlas-route-ink)"
                strokeWidth={8}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <polyline
                points={line}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth={2.4}
                strokeDasharray="7 5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </>
          ) : null}
          {points.map((point) => (
            <a
              key={`${point.stop.order}-${point.stop.city.name}`}
              href={`#stop-${point.stop.order}`}
              className="atlas-marker"
              onClick={(event) => {
                if (!onSelect) {
                  return;
                }
                event.preventDefault();
                onSelect(point.stop);
              }}
            >
              <circle
                cx={point.x}
                cy={point.y}
                r={selectedOrder === point.stop.order ? 13 : 11}
                fill="var(--color-accent)"
                stroke="var(--color-atlas-route-ink)"
                strokeWidth={2}
              />
              <text
                x={point.x}
                y={point.y + 4}
                textAnchor="middle"
                fill="var(--color-ink)"
                className="atlas-type"
                fontWeight={700}
              >
                {String(point.stop.order).padStart(2, "0")}
              </text>
              <title>{`${point.stop.city.name}, ${point.stop.city.region}`}</title>
            </a>
          ))}
        </g>
      </svg>
      {showBase && showLocator ? <ConusLocator stops={stops} /> : null}
    </div>
  );
}
