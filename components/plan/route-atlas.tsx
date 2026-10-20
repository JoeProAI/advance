"use client";

import { ConusLocator } from "@/components/plan/conus-locator";
import {
  ATLAS_HEIGHT,
  ATLAS_LAYOUT,
  ATLAS_WIDTH,
  fitRouteView,
  projectInBounds,
  statePathsInBounds,
  type AtlasRect,
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
  /** Measured CSS size of the drawing box, so the view matches its aspect and nothing is cropped. */
  frame?: { w: number; h: number };
  /** Card drawn over the map (CONUS locator), in the same CSS pixels as `frame`. */
  avoid?: AtlasRect;
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
  frame,
  avoid,
}: RouteAtlasProps) {
  const measured = frame && frame.w > 0 && frame.h > 0 ? frame : undefined;
  const vbW = ATLAS_WIDTH;
  const vbH = measured ? Math.round((ATLAS_WIDTH * measured.h) / measured.w) : ATLAS_HEIGHT;
  const scale = measured ? ATLAS_WIDTH / measured.w : 1;
  const mapRect: AtlasRect = measured ? { x: 0, y: 0, w: vbW, h: vbH } : ATLAS_LAYOUT.map;
  const avoidRect: AtlasRect | undefined =
    measured && avoid
      ? { x: avoid.x * scale, y: avoid.y * scale, w: avoid.w * scale, h: avoid.h * scale }
      : undefined;
  const view = fitRouteView(
    stops.map((stop) => stop.city),
    mapRect,
    avoidRect,
  );
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
        viewBox={`0 0 ${vbW} ${vbH}`}
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
        <rect width={vbW} height={vbH} fill={waterFill} />

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
