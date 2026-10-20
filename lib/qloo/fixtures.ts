/**
 * Hand-written synthetic desk fixtures. Invented names, UUIDs, rooms, and
 * taste lines. Not copied from Qloo API responses. Safe to keep in a public repo.
 */
import { EXAMPLE_ACTS } from "@/lib/config";
import { citiesForNames } from "@/lib/geo/cities";
import type { ActKind, City } from "@/lib/types";

/**
 * Tag vocabulary shaped like live Qloo tags (`{id, name, type}`). The ids are
 * the documented place tags Advance filters on; the records are hand-written.
 */
export const SYNTHETIC_TAGS = {
  musicVenue: {
    id: "urn:tag:category:place:live_music_venue",
    name: "Live music venue",
    type: "urn:tag:category:place",
  },
  comedyClub: {
    id: "urn:tag:genre:place:comedy_club",
    name: "Comedy club",
    type: "urn:tag:genre:place",
  },
  nightClub: {
    id: "urn:tag:category:place:night_club",
    name: "Night club",
    type: "urn:tag:category:place",
  },
  concertHall: {
    id: "urn:tag:category:place:concert_hall",
    name: "Concert hall",
    type: "urn:tag:category:place",
  },
  bar: {
    id: "urn:tag:genre:place:restaurant:bar",
    name: "Bar",
    type: "urn:tag:genre:place",
  },
  intimate: {
    id: "urn:tag:ambience:qloo:intimate",
    name: "Intimate",
    type: "urn:tag:ambience:qloo",
  },
} as const;

export type SyntheticAct = {
  entityId: string;
  name: string;
  kind: ActKind;
  slug: string;
  description: string;
  popularity: number;
  trendDelta: number;
  cityNames: string[];
  venueStyle: "rooms" | "clubs" | "warehouses";
  taste: string[];
};

// Real public act names for the demo tickets. Everything else on these
// records (ids, popularity, city lists, rooms, openers) is invented for mock
// mode and does not come from Qloo.
const EXAMPLES: SyntheticAct[] = [
  {
    entityId: "00000000-1111-4000-8000-000000000001",
    name: EXAMPLE_ACTS[0].name,
    kind: "artist",
    slug: EXAMPLE_ACTS[0].slug,
    description: "Songwriter with a slacker-country guitar band. Synthetic mock entity for the desk.",
    popularity: 0.9,
    trendDelta: 0.08,
    cityNames: [
      "Asheville",
      "Nashville",
      "Atlanta",
      "Chicago",
      "Philadelphia",
      "Brooklyn",
      "Boston",
      "Washington",
      "Richmond",
      "Louisville",
    ],
    venueStyle: "rooms",
    taste: ["Unpretentious", "Gritty", "Classic", "Dive bar vibe"],
  },
  {
    entityId: "00000000-1111-4000-8000-000000000002",
    name: EXAMPLE_ACTS[1].name,
    kind: "person",
    slug: EXAMPLE_ACTS[1].slug,
    description: "Stand-up who works club weekends and theater one-nighters. Synthetic mock entity for the desk.",
    popularity: 0.88,
    trendDelta: 0.14,
    cityNames: [
      "Boston",
      "New York",
      "Philadelphia",
      "Washington",
      "Baltimore",
      "Pittsburgh",
      "Cleveland",
      "Chicago",
      "Denver",
      "Austin",
    ],
    venueStyle: "clubs",
    taste: ["Edgy", "Classic", "Fun", "Energetic"],
  },
  {
    entityId: "00000000-1111-4000-8000-000000000003",
    name: EXAMPLE_ACTS[2].name,
    kind: "artist",
    slug: EXAMPLE_ACTS[2].slug,
    description: "Loud guitar band with a pedal-steel streak. Synthetic mock entity for the desk.",
    popularity: 0.89,
    trendDelta: 0.21,
    cityNames: [
      "Asheville",
      "Atlanta",
      "Nashville",
      "Louisville",
      "Cincinnati",
      "Columbus",
      "Pittsburgh",
      "Philadelphia",
      "Brooklyn",
      "Richmond",
    ],
    venueStyle: "rooms",
    taste: ["Gritty", "Grungy", "Eclectic", "Unique"],
  },
];

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickKind(name: string, hint?: ActKind): ActKind {
  if (hint) {
    return hint;
  }
  const lower = name.toLowerCase();
  if (/(comic|comedy|comedian)/.test(lower)) {
    return "person";
  }
  return hashString(name) % 5 === 0 ? "person" : "artist";
}

const CITY_POOLS: string[][] = [
  ["Nashville", "Louisville", "St. Louis", "Kansas City", "Chicago", "Minneapolis", "Indianapolis", "Cincinnati"],
  ["New York", "Boston", "Philadelphia", "Washington", "Chicago", "Austin", "Denver", "Seattle"],
  ["Detroit", "Chicago", "Milwaukee", "Cleveland", "Pittsburgh", "Philadelphia", "Baltimore", "Columbus"],
  ["Los Angeles", "San Diego", "San Francisco", "Portland", "Seattle", "Phoenix", "Denver", "Austin"],
  ["Atlanta", "Nashville", "New Orleans", "Austin", "Dallas", "Asheville", "Louisville", "Richmond"],
];

const ACTS_BY_ID = new Map<string, SyntheticAct>(EXAMPLES.map((act) => [act.entityId, act]));

export function actByEntityId(entityId: string): SyntheticAct {
  const cached = ACTS_BY_ID.get(entityId);
  if (cached) {
    return cached;
  }
  return resolveSyntheticAct(entityId);
}

export function resolveSyntheticAct(name: string, hint?: ActKind): SyntheticAct {
  const needle = name.trim().toLowerCase();
  const byId = ACTS_BY_ID.get(name);
  if (byId) {
    return byId;
  }
  const known = EXAMPLES.find(
    (act) =>
      act.name.toLowerCase() === needle ||
      act.slug === needle ||
      act.name.toLowerCase().includes(needle) ||
      needle.includes(act.slug),
  );
  if (known) {
    ACTS_BY_ID.set(known.entityId, known);
    return known;
  }

  const kind = pickKind(name, hint);
  const hash = hashString(name);
  const pool = CITY_POOLS[hash % CITY_POOLS.length] ?? CITY_POOLS[0];
  const trimmed = name.trim() || "Unlisted Act";
  const created: SyntheticAct = {
    entityId: `00000000-2222-4000-8000-${(hash % 0xffffffff).toString(16).padStart(12, "0")}`,
    name: trimmed,
    kind,
    slug: trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24) || "act",
    description: `${trimmed} is a synthetic stand-in used in mock mode.`,
    popularity: 0.22 + ((hash >> 3) % 30) / 100,
    trendDelta: ((hash >> 5) % 25) / 100 - 0.05,
    cityNames: pool,
    venueStyle: kind === "person" ? "clubs" : hash % 2 === 0 ? "rooms" : "warehouses",
    taste:
      kind === "person"
        ? ["local comedy pods", "diner coffee", "late sets"]
        : ["college radio", "regional beer", "night drives"],
  };
  ACTS_BY_ID.set(created.entityId, created);
  return created;
}

export function citiesForAct(act: SyntheticAct): City[] {
  return citiesForNames(act.cityNames);
}

export function affinityForCity(act: SyntheticAct, city: City, index: number): number {
  const hash = hashString(`${act.entityId}:${city.name}`);
  const base = 0.97 - index * 0.045;
  const jitter = ((hash % 17) - 8) / 200;
  return Math.max(0.42, Math.min(0.99, base + jitter));
}

export type PlaceKind = "room" | "club" | "warehouse" | "theater";

export type SyntheticVenue = {
  name: string;
  kind: PlaceKind;
  capacity: number;
  tags: string[];
};

export type SyntheticOpener = {
  name: string;
  note: string;
};

const CITY_NICK: Record<string, string> = {
  "New York": "Bowery",
  Brooklyn: "Gowanus",
  Boston: "Allston",
  Philadelphia: "Fishtown",
  Washington: "U Street",
  Baltimore: "Hampden",
  Pittsburgh: "Lawrenceville",
  Cleveland: "Ohio City",
  Columbus: "Short North",
  Cincinnati: "Over-the-Rhine",
  Detroit: "Corktown",
  Chicago: "Pilsen",
  Milwaukee: "Walker's Point",
  Minneapolis: "Seward",
  Indianapolis: "Fountain Square",
  Louisville: "Butchertown",
  Nashville: "Eastside",
  "St. Louis": "Cherokee",
  "Kansas City": "Crossroads",
  Atlanta: "Cabbagetown",
  "New Orleans": "Bywater",
  Austin: "East Side",
  Dallas: "Deep Ellum",
  Houston: "Montrose",
  Denver: "RiNo",
  "Salt Lake City": "Sugar House",
  Phoenix: "Roosevelt",
  "Los Angeles": "Echo Park",
  "San Diego": "North Park",
  "San Francisco": "Mission",
  Portland: "Alberta",
  Seattle: "Georgetown",
  Asheville: "River Arts",
  Richmond: "Scott's Addition",
  Madison: "Willy Street",
  Omaha: "Benson",
};

const SIGNATURE: Record<string, { room: string; club: string; warehouse: string; theater: string }> = {
  "New York": { room: "The Bowery Ledger", club: "Two-Drink Basement", warehouse: "Plant 11", theater: "East Village Civic" },
  Brooklyn: { room: "Gowanus Frame", club: "The Canal Bell", warehouse: "Navy Yard Floor", theater: "Carroll Hall" },
  Boston: { room: "Allston Civic", club: "The Late Tab Boston", warehouse: "Fort Point Floor", theater: "Fenway Room" },
  Philadelphia: { room: "Fishtown Annex", club: "Second Bell Philly", warehouse: "Kensington Plant", theater: "South Street Hall" },
  Washington: { room: "U Street Civic", club: "The After Hours DC", warehouse: "Ivy City Floor", theater: "Atlas Desk" },
  Baltimore: { room: "Hampden Ledger", club: "The Comedy Wharf", warehouse: "Locust Point Plant", theater: "Station North Hall" },
  Pittsburgh: { room: "Lawrenceville Rail", club: "The Strip Hour", warehouse: "Mill 19 Floor", theater: "Bloomfield Civic" },
  Cleveland: { room: "Ohio City Room", club: "The Flats Bell", warehouse: "Flats Plant", theater: "Gordon Square Hall" },
  Columbus: { room: "Short North Civic", club: "The Late Tab Cbus", warehouse: "Franklinton Floor", theater: "Arena District Hall" },
  Cincinnati: { room: "Over-the-Rhine Hall", club: "Findlay Hour", warehouse: "Camp Washington Plant", theater: "Pendleton Civic" },
  Detroit: { room: "Corktown Civic", club: "The Second Bell Detroit", warehouse: "Plant 440", theater: "Cass Corridor Hall" },
  Chicago: { room: "Lincoln Annex", club: "The Second Bell", warehouse: "Plant 14", theater: "Pilsen Civic" },
  Milwaukee: { room: "Walker's Point Room", club: "The Cream City Hour", warehouse: "Third Ward Floor", theater: "Riverwest Hall" },
  Minneapolis: { room: "Seward Civic", club: "The Night Market", warehouse: "North Loop Floor", theater: "Cedar Riverside Hall" },
  Indianapolis: { room: "Fountain Square Room", club: "Mass Ave Hour", warehouse: "Bottleworks Floor", theater: "Fountain Hall" },
  Louisville: { room: "Butchertown Civic", club: "The Copper Room", warehouse: "Portland Plant", theater: "NuLu Hall" },
  Nashville: { room: "The Split Rail", club: "Eastside Room", warehouse: "The Night Shift", theater: "Germantown Hall" },
  "St. Louis": { room: "Cherokee Loft", club: "The Wire Frame", warehouse: "Soulard Plant", theater: "Grove Civic" },
  "Kansas City": { room: "Crossroads Hall", club: "The Ledger Room", warehouse: "West Bottoms Floor", theater: "Westport Civic" },
  Atlanta: { room: "Cabbagetown Civic", club: "The Ponce Hour", warehouse: "Reynoldstown Plant", theater: "Old Fourth Hall" },
  "New Orleans": { room: "Bywater Civic", club: "The Late Tab NOLA", warehouse: "Marigny Floor", theater: "St. Claude Hall" },
  Austin: { room: "East Side Civic", club: "The Two-Drink Room", warehouse: "Airport Blvd Floor", theater: "South Congress Hall" },
  Dallas: { room: "Deep Ellum Room", club: "The Late Tab Dallas", warehouse: "Design District Plant", theater: "Bishop Arts Hall" },
  Houston: { room: "Montrose Civic", club: "The Second Bell Houston", warehouse: "EaDo Floor", theater: "Heights Hall" },
  Denver: { room: "RiNo Civic", club: "The Late Tab Denver", warehouse: "Globeville Plant", theater: "RiNo Hall" },
  "Salt Lake City": { room: "Sugar House Room", club: "The Second Bell SLC", warehouse: "Granary Floor", theater: "9th & 9th Hall" },
  Phoenix: { room: "Roosevelt Civic", club: "The Late Tab PHX", warehouse: "Grand Ave Plant", theater: "Roosevelt Hall" },
  "Los Angeles": { room: "Echo Park Civic", club: "The Late Tab LA", warehouse: "Arts District Floor", theater: "Silver Lake Hall" },
  "San Diego": { room: "North Park Room", club: "The Second Bell SD", warehouse: "Barrio Floor", theater: "South Park Hall" },
  "San Francisco": { room: "Mission Civic", club: "The Late Tab SF", warehouse: "Dogpatch Plant", theater: "Valencia Hall" },
  Portland: { room: "Alberta Civic", club: "The Late Tab PDX", warehouse: "Central Eastside Floor", theater: "Division Hall" },
  Seattle: { room: "Georgetown Civic", club: "The Late Tab SEA", warehouse: "SODO Floor", theater: "Ballard Hall" },
  Asheville: { room: "River Arts Room", club: "The Late Tab AVL", warehouse: "River Arts Plant", theater: "South Slope Hall" },
  Richmond: { room: "Scott's Addition Civic", club: "The Late Tab RVA", warehouse: "Manchester Floor", theater: "Carytown Hall" },
  Madison: { room: "Willy Street Room", club: "The Late Tab MSN", warehouse: "Schenk's Floor", theater: "Atwood Hall" },
  Omaha: { room: "Benson Civic", club: "The Late Tab OMA", warehouse: "East Omaha Plant", theater: "Blackstone Hall" },
};

const BAND_OPENERS = [
  "The Low Water Marks",
  "Ada Wren",
  "Wiregrass",
  "June Ledger",
  "The Night Porch",
  "Mara Quill",
  "Cedar & Clay",
  "Otto Vane",
  "Riverbed Trio",
  "Lana Pike",
  "Bess Collier",
  "Dust Radio",
  "Theo Finch",
  "Ivy Holm",
  "Northbound",
  "Cal Reed",
  "The After Hours",
  "Split Shifts",
  "Hollow Radio",
  "Nessa Pike",
];

const DJ_OPENERS = [
  "OXEN",
  "Mira Coil",
  "Closed Circuit",
  "N3ON RAIL",
  "Husk",
  "Kite Shadow",
  "Floor 11",
  "Ada Voltage",
  "Night Shift 440",
  "Coil & Wire",
  "Moth Radio",
  "Vanta",
  "Relay 9",
  "Ion Parish",
  "The Third Oscillator",
  "Lumen",
];

const COMIC_OPENERS = [
  "Nia Pell",
  "Theo March",
  "Sam Voss",
  "The Late Tab Hour",
  "June Pell",
  "Otto Finch",
  "Mara Voss",
  "Two-Drink Minimum",
  "Cal March",
  "Ivy Ledger",
  "Bess Quill",
  "The Green Room Set",
  "Lana Holm",
  "Reed Voss",
  "City Weekly Hour",
  "Pell & March",
];

export const KIND_TAG: Record<PlaceKind, { id: string; name: string; type: string }> = {
  room: SYNTHETIC_TAGS.musicVenue,
  theater: SYNTHETIC_TAGS.concertHall,
  club: SYNTHETIC_TAGS.comedyClub,
  warehouse: SYNTHETIC_TAGS.nightClub,
};

export function nickForCity(city: string): string {
  return nickFor(city);
}

function nickFor(city: string): string {
  return CITY_NICK[city] ?? city.split(" ")[0] ?? city;
}

function pickDistinct(bank: string[], seed: string, count: number): string[] {
  return [...bank]
    .sort((left, right) => hashString(`${seed}:${left}`) - hashString(`${seed}:${right}`))
    .slice(0, count);
}

function capacityFor(kind: PlaceKind, key: string): number {
  const ranges: Record<PlaceKind, [number, number]> = {
    room: [180, 420],
    club: [120, 280],
    warehouse: [400, 920],
    theater: [520, 1100],
  };
  const [lo, hi] = ranges[kind];
  return lo + (hashString(key) % (hi - lo));
}

export function syntheticEntityId(bucket: string, key: string): string {
  const hex = hashString(`${bucket}:${key}`).toString(16).padStart(12, "0");
  return `00000000-${bucket.slice(0, 4).padEnd(4, "0")}-4000-8000-${hex}`.slice(0, 36);
}

export function compareOverlap(a: string, b: string): number {
  const hash = hashString(`${a}|${b}`);
  return 0.48 + (hash % 41) / 100;
}

function venueSlots(
  act: SyntheticAct,
  city: string,
): Array<{ kind: PlaceKind; name: string }> {
  const nick = nickFor(city);
  const signature = SIGNATURE[city];
  if (act.venueStyle === "clubs") {
    return [
      { kind: "club", name: signature?.club ?? `${nick} Room` },
      { kind: "club", name: `${nick} Basement` },
      { kind: "theater", name: signature?.theater ?? `${nick} Civic` },
    ];
  }
  if (act.venueStyle === "warehouses") {
    return [
      { kind: "warehouse", name: signature?.warehouse ?? `Plant ${nick}` },
      { kind: "warehouse", name: `${nick} Floor` },
      { kind: "club", name: signature?.club ?? `${nick} Afters` },
    ];
  }
  return [
    { kind: "room", name: signature?.room ?? `${nick} Civic` },
    { kind: "room", name: `${nick} Annex` },
    { kind: "theater", name: signature?.theater ?? `${nick} Hall` },
  ];
}

export function venuesFor(act: SyntheticAct, city: string): SyntheticVenue[] {
  const nick = nickFor(city);
  return venueSlots(act, city).map((slot, index) => {
    const taste = act.taste[hashString(`${act.slug}:${city}:${index}`) % act.taste.length] ?? act.taste[0]!;
    return {
      name: slot.name,
      kind: slot.kind,
      capacity: capacityFor(slot.kind, `${act.entityId}:${city}:${slot.name}`),
      tags: [KIND_TAG[slot.kind].name, taste, nick],
    };
  });
}

export function openersFor(act: SyntheticAct, city: string): SyntheticOpener[] {
  const bank = act.kind === "person" ? COMIC_OPENERS : act.venueStyle === "warehouses" ? DJ_OPENERS : BAND_OPENERS;
  const names = pickDistinct(bank, `${act.slug}:${city}:openers`, 2);
  return names.map((name, index) => ({
    name,
    note:
      act.kind === "person"
        ? `${nickFor(city)} comic, ${index === 0 ? "tight five" : "local hour"}`
        : act.venueStyle === "warehouses"
          ? `${nickFor(city)} hardware, ${index === 0 ? "opening set" : "afters"}`
          : `${nickFor(city)} support, ${index === 0 ? "story songs" : "night-drive duo"}`,
  }));
}

export function venueWhyLine(input: {
  actName: string;
  city: string;
  affinity: number;
  kind: string;
  capacity: number;
  tags: string[];
}): string {
  const genericTags = new Set(["Live music venue", "Comedy club", "Night club", "Concert hall", "Bar", "Restaurant"]);
  const taste = input.tags.find((tag) => !genericTags.has(tag)) ?? input.tags[0];
  return [input.city, input.kind, `${input.capacity} cap`, `aff ${input.affinity.toFixed(2)}`, taste]
    .filter(Boolean)
    .join(" · ");
}

export function openerWhyLine(input: {
  actName: string;
  city: string;
  opener: string;
  overlap: number;
  affinity: number;
  note: string;
}): string {
  return `${input.opener} in ${input.city}: overlap ${input.overlap.toFixed(2)} · affinity ${input.affinity.toFixed(2)} · ${input.note}`;
}

export function promoFor(act: SyntheticAct, city: string): {
  podcasts: string[];
  bars: string[];
  brands: string[];
} {
  const nick = nickFor(city);
  if (act.kind === "person") {
    return {
      podcasts: [`${nick} After Dark`, `${city} Two-Drink Minimum`],
      bars: [`Green Room ${nick}`, `The Late Tab, ${nick}`],
      brands: [`${city} weeklies`, `${nick} club lager`],
    };
  }
  if (act.venueStyle === "warehouses") {
    return {
      podcasts: [`Closed Circuit ${nick}`, `${city} Frequency`],
      bars: [`Afters ${nick}`, `Shift Bar ${city}`],
      brands: [`${nick} workwear`, `${city} hardware shops`],
    };
  }
  return {
    podcasts: [`${nick} Session`, `${city} Highway Hours`],
      bars: [`Side Door ${nick}`, `The Split Rail, ${city}`],
    brands: [`${nick} regional ale`, `${city} thrift denim`],
  };
}

/** @deprecated use venuesFor */
export function venueNames(style: SyntheticAct["venueStyle"], city: string): string[] {
  const act: SyntheticAct = {
    entityId: "legacy",
    name: "legacy",
    kind: style === "clubs" ? "person" : "artist",
    slug: "legacy",
    description: "",
    popularity: 0.3,
    trendDelta: 0,
    cityNames: [city],
    venueStyle: style,
    taste: ["night crowds"],
  };
  return venuesFor(act, city).map((venue) => venue.name);
}

/** @deprecated use openersFor */
export function openerNames(act: SyntheticAct, city: string): string[] {
  return openersFor(act, city).map((opener) => opener.name);
}

export function listExampleActs(): SyntheticAct[] {
  return EXAMPLES;
}

export function geohashStub(lat: number, lon: number): string {
  const n = Math.abs(Math.round((lat + 90) * 1000 + (lon + 180) * 10));
  return `syn${n.toString(36)}`.slice(0, 8);
}
