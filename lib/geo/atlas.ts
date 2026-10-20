/** Offline CONUS atlas: Albers projection + local US state polygons. */
import { US_STATE_SHAPES, type LonLat } from "@/lib/geo/states";

export const ATLAS_WIDTH = 800;
export const ATLAS_HEIGHT = 520;

/** Simplified contiguous-US ring, lon/lat, clockwise from the northwest. */
export const CONUS_RING: Array<[number, number]> = [
  [-124.7, 48.4],
  [-124.2, 46.2],
  [-124.1, 42.0],
  [-124.4, 40.4],
  [-123.8, 38.9],
  [-122.5, 37.8],
  [-122.4, 36.6],
  [-121.9, 36.3],
  [-120.9, 35.4],
  [-120.6, 34.5],
  [-119.2, 34.1],
  [-117.2, 32.55],
  [-114.7, 32.7],
  [-111.08, 31.33],
  [-108.2, 31.33],
  [-106.5, 31.8],
  [-104.5, 29.8],
  [-103.1, 29.0],
  [-101.4, 29.6],
  [-97.4, 25.9],
  [-97.1, 26.0],
  [-96.4, 28.4],
  [-94.1, 29.7],
  [-89.4, 28.9],
  [-89.1, 30.2],
  [-87.5, 30.2],
  [-85.5, 30.1],
  [-84.9, 29.7],
  [-83.8, 28.0],
  [-82.7, 27.5],
  [-81.9, 26.4],
  [-80.4, 25.2],
  [-80.05, 26.8],
  [-80.3, 28.5],
  [-81.3, 30.4],
  [-81.4, 31.4],
  [-80.8, 32.1],
  [-79.0, 33.3],
  [-78.5, 33.9],
  [-76.0, 35.0],
  [-75.6, 35.5],
  [-75.7, 37.5],
  [-75.1, 38.0],
  [-75.0, 38.9],
  [-74.0, 40.5],
  [-71.9, 41.2],
  [-70.6, 41.6],
  [-70.0, 41.8],
  [-70.7, 42.2],
  [-70.8, 43.1],
  [-69.8, 43.7],
  [-67.0, 44.8],
  [-67.1, 45.2],
  [-67.8, 47.2],
  [-69.2, 47.4],
  [-70.0, 46.7],
  [-71.4, 45.3],
  [-74.3, 45.0],
  [-76.4, 44.3],
  [-79.2, 43.4],
  [-82.4, 43.0],
  [-83.1, 42.0],
  [-83.9, 43.5],
  [-84.8, 45.9],
  [-87.4, 46.4],
  [-89.6, 47.9],
  [-94.6, 48.8],
  [-95.2, 49.3],
  [-107.0, 49.0],
  [-116.0, 49.0],
  [-123.0, 49.0],
  [-124.7, 48.4],
];

const DEG = Math.PI / 180;
const PHI0 = 37.5 * DEG;
const LAMBDA0 = -96 * DEG;
const PHI1 = 29.5 * DEG;
const PHI2 = 45.5 * DEG;
const N = (Math.sin(PHI1) + Math.sin(PHI2)) / 2;
const C = Math.cos(PHI1) ** 2 + 2 * N * Math.sin(PHI1);
const RHO0 = Math.sqrt(C - 2 * N * Math.sin(PHI0)) / N;

export type AtlasPoint = { x: number; y: number };

function albers(lon: number, lat: number): AtlasPoint {
  const phi = lat * DEG;
  const lambda = lon * DEG;
  const rho = Math.sqrt(Math.max(0, C - 2 * N * Math.sin(phi))) / N;
  const theta = N * (lambda - LAMBDA0);
  return {
    x: rho * Math.sin(theta),
    y: RHO0 - rho * Math.cos(theta),
  };
}

function ringBounds(ring: Array<[number, number]>): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [lon, lat] of ring) {
    const point = albers(lon, lat);
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, maxX, minY, maxY };
}

const BOUNDS = ringBounds(CONUS_RING);
const PAD = 28;

export type AtlasBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export type AtlasRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export const ATLAS_LAYOUT = {
  map: { x: 0, y: 0, w: ATLAS_WIDTH, h: ATLAS_HEIGHT } satisfies AtlasRect,
  legend: { x: 10, y: 36, w: 178, h: 250 } satisfies AtlasRect,
  /** Local viewBox for the HTML CONUS locator overlay (never sliced with the map). */
  inset: { x: 0, y: 0, w: 176, h: 116 } satisfies AtlasRect,
};

export function conusBounds(): AtlasBounds {
  return BOUNDS;
}

export function projectRaw(raw: AtlasPoint, bounds: AtlasBounds, rect: AtlasRect): AtlasPoint {
  const spanX = bounds.maxX - bounds.minX || 1;
  const spanY = bounds.maxY - bounds.minY || 1;
  return {
    x: rect.x + ((raw.x - bounds.minX) / spanX) * rect.w,
    y: rect.y + ((bounds.maxY - raw.y) / spanY) * rect.h,
  };
}

export function projectInBounds(
  lon: number,
  lat: number,
  bounds: AtlasBounds,
  rect: AtlasRect,
): AtlasPoint {
  return projectRaw(albers(lon, lat), bounds, rect);
}

/** Route window drawn on the full-CONUS inset. */
export function viewWindowInRect(view: AtlasBounds, world: AtlasBounds, rect: AtlasRect): AtlasRect {
  const a = projectRaw({ x: view.minX, y: view.minY }, world, rect);
  const b = projectRaw({ x: view.maxX, y: view.maxY }, world, rect);
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  return {
    x: Math.max(rect.x, x),
    y: Math.max(rect.y, y),
    w: Math.min(rect.x + rect.w, x + w) - Math.max(rect.x, x),
    h: Math.min(rect.y + rect.h, y + h) - Math.max(rect.y, y),
  };
}

export function projectConus(lon: number, lat: number): AtlasPoint {
  return projectInBounds(lon, lat, BOUNDS, {
    x: PAD,
    y: PAD,
    w: ATLAS_WIDTH - PAD * 2,
    h: ATLAS_HEIGHT - PAD * 2,
  });
}

export function conusPathInBounds(bounds: AtlasBounds, rect: AtlasRect): string {
  return (
    CONUS_RING.map((pair, index) => {
      const point = projectInBounds(pair[0], pair[1], bounds, rect);
      return `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    }).join(" ") + " Z"
  );
}

export function conusPathD(): string {
  return conusPathInBounds(BOUNDS, {
    x: PAD,
    y: PAD,
    w: ATLAS_WIDTH - PAD * 2,
    h: ATLAS_HEIGHT - PAD * 2,
  });
}

function ringPath(ring: LonLat[], bounds: AtlasBounds, rect: AtlasRect): string {
  return (
    ring
      .map((pair, index) => {
        const point = projectInBounds(pair[0], pair[1], bounds, rect);
        return `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
      })
      .join(" ") + " Z"
  );
}

export type AtlasStatePath = {
  name: string;
  d: string;
};

export function statePathsInBounds(bounds: AtlasBounds, rect: AtlasRect): AtlasStatePath[] {
  return US_STATE_SHAPES.map((shape) => ({
    name: shape.name,
    d: shape.polygons
      .map((polygon) => polygon.map((ring) => ringPath(ring, bounds, rect)).join(" "))
      .join(" "),
  })).filter((shape) => shape.d.includes("M"));
}

export function routeViewBounds(
  stops: Array<{ lon: number; lat: number }>,
  aspect = ATLAS_LAYOUT.map.w / ATLAS_LAYOUT.map.h,
): AtlasBounds {
  if (stops.length === 0) {
    return BOUNDS;
  }
  const points = stops.map((stop) => albers(stop.lon, stop.lat));
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const fullSpanX = BOUNDS.maxX - BOUNDS.minX;
  const fullSpanY = BOUNDS.maxY - BOUNDS.minY;
  const pad = 0.32;
  let spanX = Math.max(maxX - minX, fullSpanX * 0.14);
  let spanY = Math.max(maxY - minY, fullSpanY * 0.14);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  spanX *= 1 + pad * 2;
  spanY *= 1 + pad * 2;
  if (spanX / spanY < aspect) {
    spanX = spanY * aspect;
  } else {
    spanY = spanX / aspect;
  }
  return {
    minX: cx - spanX / 2,
    maxX: cx + spanX / 2,
    minY: cy - spanY / 2,
    maxY: cy + spanY / 2,
  };
}

export type AtlasLabelBox = AtlasRect;

export function boxesOverlap(a: AtlasRect, b: AtlasRect, gap = 4): boolean {
  return !(
    a.x + a.w + gap < b.x ||
    b.x + b.w + gap < a.x ||
    a.y + a.h + gap < b.y ||
    b.y + b.h + gap < a.y
  );
}

export function estimateLabelBox(text: string): { w: number; h: number } {
  return { w: Math.max(36, text.length * 6.35 + 6), h: 14 };
}

const LABEL_SLOTS: Array<{ dx: number; dy: number; anchor: "start" | "end" | "middle" }> = [
  { dx: 16, dy: -16, anchor: "start" },
  { dx: -16, dy: -16, anchor: "end" },
  { dx: 16, dy: 20, anchor: "start" },
  { dx: -16, dy: 20, anchor: "end" },
  { dx: 20, dy: 4, anchor: "start" },
  { dx: -20, dy: 4, anchor: "end" },
  { dx: 0, dy: -24, anchor: "middle" },
  { dx: 0, dy: 26, anchor: "middle" },
  { dx: 34, dy: -30, anchor: "start" },
  { dx: -34, dy: -30, anchor: "end" },
  { dx: 34, dy: 30, anchor: "start" },
  { dx: -34, dy: 30, anchor: "end" },
];

export type PlacedAtlasLabel = {
  text: string;
  x: number;
  y: number;
  anchor: "start" | "end" | "middle";
  box: AtlasRect;
};

export function placeAtlasLabels(
  points: Array<{ x: number; y: number; label: string }>,
  frame: AtlasRect,
  reserved: AtlasRect[] = [],
): Array<PlacedAtlasLabel | null> {
  const placed: AtlasRect[] = reserved.map((box) => ({ ...box }));
  for (const point of points) {
    placed.push({ x: point.x - 13, y: point.y - 13, w: 26, h: 26 });
  }
  return points.map((point) => {
    const size = estimateLabelBox(point.label);
    for (const slot of LABEL_SLOTS) {
      const left =
        slot.anchor === "end"
          ? point.x + slot.dx - size.w
          : slot.anchor === "middle"
            ? point.x + slot.dx - size.w / 2
            : point.x + slot.dx;
      const top = point.y + slot.dy - 10;
      const box = { x: left, y: top, w: size.w, h: size.h };
      const inside =
        box.x >= frame.x + 4 &&
        box.y >= frame.y + 4 &&
        box.x + box.w <= frame.x + frame.w - 4 &&
        box.y + box.h <= frame.y + frame.h - 4;
      if (!inside) {
        continue;
      }
      if (placed.some((other) => boxesOverlap(box, other))) {
        continue;
      }
      placed.push(box);
      return {
        text: point.label,
        x: point.x + slot.dx,
        y: point.y + slot.dy,
        anchor: slot.anchor,
        box,
      };
    }
    return null;
  });
}

export function isInsideConusView(lon: number, lat: number): boolean {
  const point = projectConus(lon, lat);
  return point.x >= 0 && point.x <= ATLAS_WIDTH && point.y >= 0 && point.y <= ATLAS_HEIGHT;
}
