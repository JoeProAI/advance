import collection from "@/lib/geo/us-states.json";

export type LonLat = [number, number];

export type StateShape = {
  name: string;
  id: string;
  polygons: LonLat[][][];
};

function asLonLat(value: unknown): LonLat | null {
  if (!Array.isArray(value) || typeof value[0] !== "number" || typeof value[1] !== "number") {
    return null;
  }
  return [value[0], value[1]];
}

function asRing(value: unknown): LonLat[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(asLonLat).filter((point): point is LonLat => point !== null);
}

function asPolygon(value: unknown): LonLat[][] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(asRing).filter((ring) => ring.length >= 4);
}

function shapesFromCollection(): StateShape[] {
  const features = Array.isArray(collection.features) ? collection.features : [];
  const shapes: StateShape[] = [];
  for (const feature of features) {
    const name = String(feature.properties?.name ?? "");
    const id = String(feature.properties?.id ?? "");
    const geometry = feature.geometry;
    if (!name || !geometry) {
      continue;
    }
    const polygons =
      geometry.type === "Polygon"
        ? [asPolygon(geometry.coordinates)]
        : geometry.type === "MultiPolygon"
          ? (geometry.coordinates as unknown[]).map(asPolygon)
          : [];
    const kept = polygons.filter((polygon) => polygon[0] && polygon[0].length >= 4);
    if (kept.length === 0) {
      continue;
    }
    shapes.push({ name, id, polygons: kept });
  }
  return shapes;
}

export const US_STATE_SHAPES: StateShape[] = shapesFromCollection();
