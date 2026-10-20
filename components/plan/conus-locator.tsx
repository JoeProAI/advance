import {
  ATLAS_LAYOUT,
  conusBounds,
  projectInBounds,
  routeViewBounds,
  statePathsInBounds,
  viewWindowInRect,
} from "@/lib/geo/atlas";
import type { RoutedStop } from "@/lib/types";
import { cn } from "@/lib/utils";

function polyline(points: Array<{ x: number; y: number }>): string {
  return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

export function ConusLocator({
  stops,
  className,
}: {
  stops: RoutedStop[];
  className?: string;
}) {
  const insetRect = ATLAS_LAYOUT.inset;
  const world = conusBounds();
  const view = routeViewBounds(stops.map((stop) => stop.city));
  const insetStates = statePathsInBounds(world, insetRect);
  const points = stops.map((stop) => ({
    order: stop.order,
    ...projectInBounds(stop.city.lon, stop.city.lat, world, insetRect),
  }));
  const line = polyline(points);
  const windowRect = viewWindowInRect(view, world, insetRect);

  return (
    <figure className={cn("atlas-inset", className)} aria-hidden>
      <figcaption className="atlas-inset-kicker">CONUS</figcaption>
      <svg
        viewBox={`0 0 ${insetRect.w} ${insetRect.h}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        role="presentation"
      >
        <rect width={insetRect.w} height={insetRect.h} fill="var(--color-atlas-water)" />
        <g fillRule="evenodd">
          {insetStates.map((state) => (
            <path
              key={`inset-${state.name}`}
              d={state.d}
              fill="var(--color-atlas-land)"
              stroke="var(--color-atlas-state)"
              strokeWidth={0.4}
              strokeLinejoin="round"
            />
          ))}
        </g>
        {windowRect.w > 2 && windowRect.h > 2 ? (
          <rect
            x={windowRect.x}
            y={windowRect.y}
            width={windowRect.w}
            height={windowRect.h}
            fill="var(--color-accent)"
            fillOpacity={0.16}
            stroke="var(--color-accent)"
            strokeWidth={1}
          />
        ) : null}
        {points.length > 1 ? (
          <polyline
            points={line}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={1.4}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        {points.map((point) => (
          <circle key={`inset-${point.order}`} cx={point.x} cy={point.y} r={2.2} fill="var(--color-accent)" />
        ))}
      </svg>
    </figure>
  );
}
