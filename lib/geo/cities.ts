import type { City } from "@/lib/types";

export const US_CITIES: City[] = [
  { name: "New York", region: "NY", country: "US", lat: 40.7128, lon: -74.006 },
  { name: "Brooklyn", region: "NY", country: "US", lat: 40.6782, lon: -73.9442 },
  { name: "Boston", region: "MA", country: "US", lat: 42.3601, lon: -71.0589 },
  { name: "Philadelphia", region: "PA", country: "US", lat: 39.9526, lon: -75.1652 },
  { name: "Washington", region: "DC", country: "US", lat: 38.9072, lon: -77.0369 },
  { name: "Baltimore", region: "MD", country: "US", lat: 39.2904, lon: -76.6122 },
  { name: "Pittsburgh", region: "PA", country: "US", lat: 40.4406, lon: -79.9959 },
  { name: "Cleveland", region: "OH", country: "US", lat: 41.4993, lon: -81.6944 },
  { name: "Columbus", region: "OH", country: "US", lat: 39.9612, lon: -82.9988 },
  { name: "Cincinnati", region: "OH", country: "US", lat: 39.1031, lon: -84.512 },
  { name: "Detroit", region: "MI", country: "US", lat: 42.3314, lon: -83.0458 },
  { name: "Chicago", region: "IL", country: "US", lat: 41.8781, lon: -87.6298 },
  { name: "Milwaukee", region: "WI", country: "US", lat: 43.0389, lon: -87.9065 },
  { name: "Minneapolis", region: "MN", country: "US", lat: 44.9778, lon: -93.265 },
  { name: "Indianapolis", region: "IN", country: "US", lat: 39.7684, lon: -86.1581 },
  { name: "Louisville", region: "KY", country: "US", lat: 38.2527, lon: -85.7585 },
  { name: "Nashville", region: "TN", country: "US", lat: 36.1627, lon: -86.7816 },
  { name: "St. Louis", region: "MO", country: "US", lat: 38.627, lon: -90.1994 },
  { name: "Kansas City", region: "MO", country: "US", lat: 39.0997, lon: -94.5783 },
  { name: "Atlanta", region: "GA", country: "US", lat: 33.749, lon: -84.388 },
  { name: "New Orleans", region: "LA", country: "US", lat: 29.9511, lon: -90.0715 },
  { name: "Austin", region: "TX", country: "US", lat: 30.2672, lon: -97.7431 },
  { name: "Dallas", region: "TX", country: "US", lat: 32.7767, lon: -96.797 },
  { name: "Houston", region: "TX", country: "US", lat: 29.7604, lon: -95.3698 },
  { name: "Denver", region: "CO", country: "US", lat: 39.7392, lon: -104.9903 },
  { name: "Salt Lake City", region: "UT", country: "US", lat: 40.7608, lon: -111.891 },
  { name: "Phoenix", region: "AZ", country: "US", lat: 33.4484, lon: -112.074 },
  { name: "Los Angeles", region: "CA", country: "US", lat: 34.0522, lon: -118.2437 },
  { name: "San Diego", region: "CA", country: "US", lat: 32.7157, lon: -117.1611 },
  { name: "San Francisco", region: "CA", country: "US", lat: 37.7749, lon: -122.4194 },
  { name: "Portland", region: "OR", country: "US", lat: 45.5152, lon: -122.6784 },
  { name: "Seattle", region: "WA", country: "US", lat: 47.6062, lon: -122.3321 },
  { name: "Asheville", region: "NC", country: "US", lat: 35.5951, lon: -82.5515 },
  { name: "Richmond", region: "VA", country: "US", lat: 37.5407, lon: -77.436 },
  { name: "Madison", region: "WI", country: "US", lat: 43.0731, lon: -89.4012 },
  { name: "Omaha", region: "NE", country: "US", lat: 41.2565, lon: -95.9345 },
];

const REGIONS: Record<string, { query: string; cities: string[] }> = {
  northeast: {
    query: "Northeastern United States",
    cities: [
      "New York",
      "Brooklyn",
      "Boston",
      "Philadelphia",
      "Washington",
      "Baltimore",
      "Pittsburgh",
      "Richmond",
    ],
  },
  midwest: {
    query: "Midwest United States",
    cities: [
      "Chicago",
      "Detroit",
      "Milwaukee",
      "Minneapolis",
      "Cleveland",
      "Columbus",
      "Cincinnati",
      "Indianapolis",
      "Madison",
    ],
  },
  south: {
    query: "Southern United States",
    cities: [
      "Nashville",
      "Louisville",
      "Atlanta",
      "New Orleans",
      "Austin",
      "Dallas",
      "Houston",
      "Asheville",
    ],
  },
  plains: {
    query: "Central United States",
    cities: ["St. Louis", "Kansas City", "Omaha", "Denver"],
  },
  west: {
    query: "Western United States",
    cities: [
      "Denver",
      "Salt Lake City",
      "Phoenix",
      "Los Angeles",
      "San Diego",
      "San Francisco",
      "Portland",
      "Seattle",
    ],
  },
};

export const HEATMAP_REGIONS = Object.values(REGIONS);

export function findCity(name: string): City | undefined {
  const needle = name.trim().toLowerCase();
  return US_CITIES.find(
    (city) =>
      city.name.toLowerCase() === needle ||
      `${city.name}, ${city.region}`.toLowerCase() === needle,
  );
}

export function cityKey(city: Pick<City, "name" | "region">): string {
  return `${city.name}, ${city.region}`;
}

export function citiesForNames(names: string[]): City[] {
  return names
    .map((name) => findCity(name))
    .filter((city): city is City => city !== undefined);
}
