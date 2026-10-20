/**
 * Convert us-atlas states-10m TopoJSON into a compact CONUS GeoJSON
 * shipped with the app so the night atlas works offline.
 */
import { readFileSync, writeFileSync } from "node:fs";

const SKIP = new Set(["02", "15", "60", "66", "69", "72", "78"]);
const MIN_DEG = 0.035;

function decodeArc(raw, transform) {
  let x = 0;
  let y = 0;
  return raw.map(([dx, dy]) => {
    x += dx;
    y += dy;
    return [
      x * transform.scale[0] + transform.translate[0],
      y * transform.scale[1] + transform.translate[1],
    ];
  });
}

function ringFromArcs(indexes, decoded) {
  const ring = [];
  for (const index of indexes) {
    const abs = index < 0 ? ~index : index;
    let pts = decoded[abs];
    if (!pts) {
      continue;
    }
    if (index < 0) {
      pts = pts.slice().reverse();
    }
    if (ring.length > 0) {
      pts = pts.slice(1);
    }
    for (const point of pts) {
      ring.push(point);
    }
  }
  return ring;
}

function simplify(ring) {
  if (ring.length < 8) {
    return closeRing(ring);
  }
  const out = [ring[0]];
  for (let i = 1; i < ring.length - 1; i += 1) {
    const prev = out[out.length - 1];
    const cur = ring[i];
    if (Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) >= MIN_DEG) {
      out.push(cur);
    }
  }
  out.push(ring[ring.length - 1]);
  if (out.length < 8) {
    const step = Math.max(1, Math.floor(ring.length / 16));
    const sampled = ring.filter((_, index) => index % step === 0 || index === ring.length - 1);
    return closeRing(sampled);
  }
  return closeRing(out);
}

function closeRing(ring) {
  if (ring.length === 0) {
    return ring;
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return [...ring, first];
  }
  return ring;
}

function polygonsFromGeometry(geometry, decoded) {
  if (geometry.type === "Polygon") {
    return [geometry.arcs.map((arc) => ringFromArcs(arc, decoded))];
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.arcs.map((poly) => poly.map((arc) => ringFromArcs(arc, decoded)));
  }
  return [];
}

const topology = JSON.parse(readFileSync(process.argv[2], "utf8"));
const decoded = topology.arcs.map((arc) => decodeArc(arc, topology.transform));
const features = [];

for (const geometry of topology.objects.states.geometries) {
  if (SKIP.has(String(geometry.id))) {
    continue;
  }
  const polygons = polygonsFromGeometry(geometry, decoded)
    .map((poly) => poly.map(simplify).filter((ring) => ring.length >= 4))
    .filter((poly) => poly.length > 0 && poly[0].length >= 4);
  if (polygons.length === 0) {
    continue;
  }
  features.push({
    type: "Feature",
    properties: { name: geometry.properties.name, id: String(geometry.id) },
    geometry: {
      type: polygons.length === 1 ? "Polygon" : "MultiPolygon",
      coordinates: polygons.length === 1 ? polygons[0] : polygons,
    },
  });
}

const geojson = {
  type: "FeatureCollection",
  name: "conus-states",
  features,
};

const out = process.argv[3];
writeFileSync(out, `${JSON.stringify(geojson)}\n`);
console.log(`wrote ${features.length} states to ${out} (${Buffer.byteLength(JSON.stringify(geojson))} bytes)`);
