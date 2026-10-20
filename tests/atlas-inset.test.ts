import { describe, expect, it } from "vitest";
import { fitRouteView, routeClearOf, routeViewBounds } from "@/lib/geo/atlas";
import { findCity } from "@/lib/geo/cities";

// Round 1 live routes.
const LENDERMAN = ["Chicago", "Milwaukee", "Madison", "Minneapolis", "Omaha", "Kansas City", "St. Louis", "Nashville"];
const WEDNESDAY = ["Asheville", "Atlanta", "Nashville", "Louisville", "Cincinnati", "Columbus", "Cleveland", "Pittsburgh"];
const MORRIL = ["Boston", "Brooklyn", "Philadelphia", "Baltimore", "Washington", "Richmond", "Pittsburgh", "Cleveland"];

const stops = (names: string[]) => names.map((name) => findCity(name)!);

// Plate sizes seen on desktop and tablet, with the CONUS card pinned
// bottom-right (11rem wide) as in globals.css.
const FRAMES = [
  { w: 880, h: 560 },
  { w: 560, h: 460 },
  { w: 420, h: 420 },
];

function inset(frame: { w: number; h: number }) {
  return { x: frame.w - 176 - 12, y: frame.h - 116 - 12, w: 176, h: 116 };
}

describe("route fit around the CONUS card", () => {
  for (const [label, names] of [
    ["lenderman", LENDERMAN],
    ["wednesday", WEDNESDAY],
    ["morril", MORRIL],
  ] as const) {
    for (const size of FRAMES) {
      it(`${label} stays clear at ${size.w}x${size.h}`, () => {
        const frame = { x: 0, y: 0, ...size };
        const card = inset(size);
        const view = fitRouteView(stops([...names]), frame, card);
        expect(routeClearOf(stops([...names]), view, frame, card)).toBe(true);
      });
    }
  }

  it("the old fit put Lenderman's last leg under the card", () => {
    const size = FRAMES[1]!;
    const frame = { x: 0, y: 0, ...size };
    const before = routeViewBounds(stops(LENDERMAN), size.w / size.h);
    expect(routeClearOf(stops(LENDERMAN), before, frame, inset(size))).toBe(false);
  });

  it("leaves the view alone when nothing is in the way", () => {
    const frame = { x: 0, y: 0, w: 800, h: 520 };
    expect(fitRouteView(stops(WEDNESDAY), frame)).toEqual(routeViewBounds(stops(WEDNESDAY), 800 / 520));
  });
});
