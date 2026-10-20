import { describe, expect, it } from "vitest";
import {
  ATLAS_HEIGHT,
  ATLAS_LAYOUT,
  ATLAS_WIDTH,
  boxesOverlap,
  conusBounds,
  placeAtlasLabels,
  projectInBounds,
  routeViewBounds,
  statePathsInBounds,
  viewWindowInRect,
} from "@/lib/geo/atlas";
import { US_STATE_SHAPES } from "@/lib/geo/states";
import { findCity } from "@/lib/geo/cities";

const MARLOW = ["Pittsburgh", "Columbus", "Cincinnati", "Louisville", "Indianapolis", "Chicago", "Milwaukee"];
const RINA = [
  "Boston",
  "New York",
  "Philadelphia",
  "Baltimore",
  "Washington",
  "Richmond",
  "Pittsburgh",
  "Cleveland",
];

function cities(names: string[]) {
  return names.map((name) => {
    const city = findCity(name);
    if (!city) {
      throw new Error(`Missing city ${name}`);
    }
    return city;
  });
}

function fitted(names: string[]) {
  const stops = cities(names);
  const view = routeViewBounds(stops);
  const map = ATLAS_LAYOUT.map;
  return {
    view,
    map,
    points: stops.map((city) => ({
      city,
      ...projectInBounds(city.lon, city.lat, view, map),
    })),
  };
}

describe("route-fitted night atlas", () => {
  it("zooms Marlow tighter than the full CONUS outline", () => {
    const full = conusBounds();
    const view = routeViewBounds(cities(MARLOW));
    const fullSpanX = full.maxX - full.minX;
    const viewSpanX = view.maxX - view.minX;
    expect(viewSpanX).toBeLessThan(fullSpanX * 0.55);
    expect(viewSpanX).toBeGreaterThan(fullSpanX * 0.12);
  });

  it("spreads Marlow stops across the map instead of a small CONUS patch", () => {
    const { points, map } = fitted(MARLOW);
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(map.w * 0.4);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(map.h * 0.35);
    for (const point of points) {
      expect(point.x).toBeGreaterThan(map.x + 14);
      expect(point.x).toBeLessThan(map.x + map.w - 14);
      expect(point.y).toBeGreaterThan(map.y + 14);
      expect(point.y).toBeLessThan(map.y + map.h - 14);
    }
  });

  it("keeps Louisville, Columbus, and Indianapolis markers from stacking", () => {
    const { points } = fitted(MARLOW);
    const cluster = points.filter((point) =>
      ["Louisville", "Columbus", "Indianapolis"].includes(point.city.name),
    );
    expect(cluster).toHaveLength(3);
    for (let i = 0; i < cluster.length; i += 1) {
      for (let j = i + 1; j < cluster.length; j += 1) {
        const dx = cluster[i]!.x - cluster[j]!.x;
        const dy = cluster[i]!.y - cluster[j]!.y;
        expect(Math.hypot(dx, dy)).toBeGreaterThan(26);
      }
    }
  });

  it("keeps Boston inside the map frame so the east edge does not clip it", () => {
    const { points, map } = fitted(RINA);
    const boston = points.find((point) => point.city.name === "Boston");
    expect(boston).toBeTruthy();
    expect(boston!.x).toBeGreaterThan(map.x + 16);
    expect(boston!.x).toBeLessThan(map.x + map.w - 16);
    expect(boston!.y).toBeGreaterThan(map.y + 16);
    expect(boston!.y).toBeLessThan(map.y + map.h - 16);
  });

  it("separates Baltimore, New York, and Pittsburgh on Rina's corridor", () => {
    const { points } = fitted(RINA);
    const named = Object.fromEntries(points.map((point) => [point.city.name, point]));
    const pairs: Array<[string, string]> = [
      ["Baltimore", "New York"],
      ["Pittsburgh", "New York"],
      ["Pittsburgh", "Philadelphia"],
    ];
    for (const [a, b] of pairs) {
      expect(Math.hypot(named[a]!.x - named[b]!.x, named[a]!.y - named[b]!.y)).toBeGreaterThan(26);
    }
  });

  it("places colliding labels in non-overlapping slots inside the frame", () => {
    const frame = { x: 0, y: 0, w: 420, h: 220 };
    const placed = placeAtlasLabels(
      [
        { x: 180, y: 110, label: "Louisville, KY" },
        { x: 188, y: 116, label: "Indianapolis, IN" },
        { x: 196, y: 104, label: "Columbus, OH" },
      ],
      frame,
    );
    const boxes = placed.filter((row) => row !== null);
    expect(boxes.length).toBe(3);
    for (const label of boxes) {
      expect(label.box.x).toBeGreaterThanOrEqual(frame.x);
      expect(label.box.x + label.box.w).toBeLessThanOrEqual(frame.x + frame.w);
    }
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        expect(boxesOverlap(boxes[i]!.box, boxes[j]!.box)).toBe(false);
      }
    }
  });

  it("keeps the CONUS locator in its own frame so map slice cannot clip it", () => {
    expect(ATLAS_LAYOUT.inset).toEqual({ x: 0, y: 0, w: 176, h: 116 });
    const world = conusBounds();
    const view = routeViewBounds(cities(MARLOW));
    const window = viewWindowInRect(view, world, ATLAS_LAYOUT.inset);
    expect(window.x).toBeGreaterThanOrEqual(ATLAS_LAYOUT.inset.x);
    expect(window.y).toBeGreaterThanOrEqual(ATLAS_LAYOUT.inset.y);
    expect(window.x + window.w).toBeLessThanOrEqual(ATLAS_LAYOUT.inset.x + ATLAS_LAYOUT.inset.w + 0.01);
    expect(window.y + window.h).toBeLessThanOrEqual(ATLAS_LAYOUT.inset.y + ATLAS_LAYOUT.inset.h + 0.01);
    expect(window.w).toBeGreaterThan(8);
    expect(window.h).toBeGreaterThan(8);
  });

  it("fills the atlas frame with local state polygons instead of a lone CONUS ring", () => {
    expect(US_STATE_SHAPES.length).toBeGreaterThanOrEqual(48);
    expect(ATLAS_LAYOUT.map).toEqual({ x: 0, y: 0, w: ATLAS_WIDTH, h: ATLAS_HEIGHT });
    const view = routeViewBounds(cities(MARLOW));
    const paths = statePathsInBounds(view, ATLAS_LAYOUT.map);
    expect(paths.length).toBeGreaterThanOrEqual(48);
    const ohio = paths.find((path) => path.name === "Ohio");
    expect(ohio?.d.startsWith("M")).toBe(true);
    expect((ohio?.d.match(/M/g) ?? []).length).toBeGreaterThan(0);
    expect(paths.reduce((sum, path) => sum + (path.d.match(/M/g)?.length ?? 0), 0)).toBeGreaterThan(40);
  });

  it("refuses a right-edge label that would clip instead of hanging off the map", () => {
    const frame = ATLAS_LAYOUT.map;
    const placed = placeAtlasLabels([{ x: frame.x + frame.w - 8, y: 80, label: "Boston, MA" }], frame);
    expect(placed[0]).not.toBeNull();
    const label = placed[0]!;
    expect(label.box.x + label.box.w).toBeLessThanOrEqual(frame.x + frame.w - 4);
    expect(label.anchor).not.toBe("start");
  });
});
