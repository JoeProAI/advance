import { entityPopularity } from "@/lib/qloo/parse";
import type { QlooEntity } from "@/lib/qloo/types";
import type { City, ResolvedAct } from "@/lib/types";

/**
 * Opener picking. Probed Oct 20, 2026: `signal.location` (POINT + radius,
 * weight very_high), `signal.location.query`, and `filter.location` + radius
 * all return near-identical artist/person lists across Atlanta, Pittsburgh,
 * and St. Louis. Qloo does not localize these types. So Advance pulls one
 * tour-wide pool, drops implausible names, boosts acts whose Qloo biography
 * or birthplace names the stop city, and never books the same opener twice
 * while the pool lasts.
 */

/** Legacy acts: started this many years ago or more. */
export const LEGACY_YEARS = 22;
/** Qloo obscurity_scale: 1-2 reads as household names. */
export const HOUSEHOLD_OBSCURITY_MAX = 2;

const STATE_NAMES: Record<string, string> = {
  NY: "New York", MA: "Massachusetts", PA: "Pennsylvania", DC: "District of Columbia", MD: "Maryland",
  OH: "Ohio", MI: "Michigan", IL: "Illinois", WI: "Wisconsin", MN: "Minnesota", IN: "Indiana",
  KY: "Kentucky", TN: "Tennessee", MO: "Missouri", GA: "Georgia", LA: "Louisiana", TX: "Texas",
  CO: "Colorado", UT: "Utah", AZ: "Arizona", CA: "California", OR: "Oregon", WA: "Washington",
  NC: "North Carolina", VA: "Virginia", NE: "Nebraska",
};

/** City names that also exist elsewhere; these need the state named too. */
const AMBIGUOUS = new Set(["Portland", "Columbus", "Richmond", "Madison", "Cleveland", "Austin", "Kansas City", "Brooklyn"]);

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function firstNumber(value: unknown): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export type OpenerReject = "legacy" | "household-name" | "above-headliner" | "self";

/** Why a pool entity cannot open for this act, or undefined if it can. */
export function rejectOpener(entity: QlooEntity, act: ResolvedAct, year = new Date().getFullYear()): OpenerReject | undefined {
  if (entity.entity_id === act.entityId) {
    return "self";
  }
  if (entityPopularity(entity, 0) > act.popularity + 0.005) {
    return "above-headliner";
  }
  const props = (entity.properties ?? {}) as Record<string, unknown>;
  const start = firstNumber(props.start_year);
  if (start !== undefined && start <= year - LEGACY_YEARS) {
    return "legacy";
  }
  const obscurity = firstNumber(props.obscurity_scale);
  if (obscurity !== undefined && obscurity <= HOUSEHOLD_OBSCURITY_MAX) {
    return "household-name";
  }
  return undefined;
}

/** True when Qloo's biography or birthplace for the entity names the city. */
export function isFromCity(entity: QlooEntity, city: Pick<City, "name" | "region">): boolean {
  const props = (entity.properties ?? {}) as Record<string, unknown>;
  // Birthplace plus the opening of the bio, which is where Qloo bios say
  // where an act formed. Later lines mention tour stops and would mislead.
  const birth = [props.place_of_birth].flat().filter((part): part is string => typeof part === "string").join(" ");
  const bio = typeof props.biography === "string" ? props.biography.slice(0, 240) : "";
  const text = `${birth} ${bio}`.trim();
  if (!text) {
    return false;
  }
  if (city.region === "DC") {
    return /Washington,? D\.?C\.?|District of Columbia/.test(text);
  }
  const named = new RegExp(`\\b${escape(city.name)}\\b`).test(text);
  if (!named) {
    return false;
  }
  if (!AMBIGUOUS.has(city.name)) {
    return true;
  }
  const state = STATE_NAMES[city.region];
  return (
    (state ? new RegExp(`\\b${escape(state)}\\b`).test(text) : false) ||
    new RegExp(`\\b${escape(city.name)},? ${city.region}\\b`).test(text) ||
    (city.name === "Brooklyn" && /New York/.test(text))
  );
}

export type AssignedOpener = { entity: QlooEntity; local: boolean; repeat: boolean };

/**
 * Greedy per stop, in route order: local and unused first, then unused in
 * Qloo's affinity order, then local repeats, then any repeat.
 */
export function assignOpeners(
  pool: QlooEntity[],
  cities: Array<Pick<City, "name" | "region">>,
  perStop = 2,
): AssignedOpener[][] {
  const used = new Set<string>();
  return cities.map((city) => {
    const picks: AssignedOpener[] = [];
    const taken = new Set<string>();
    const tiers: Array<(entity: QlooEntity) => boolean> = [
      (entity) => !used.has(entity.entity_id) && isFromCity(entity, city),
      (entity) => !used.has(entity.entity_id),
      (entity) => isFromCity(entity, city),
      () => true,
    ];
    for (const tier of tiers) {
      for (const entity of pool) {
        if (picks.length >= perStop) break;
        if (taken.has(entity.entity_id) || !tier(entity)) continue;
        taken.add(entity.entity_id);
        picks.push({ entity, local: isFromCity(entity, city), repeat: used.has(entity.entity_id) });
      }
    }
    for (const pick of picks) used.add(pick.entity.entity_id);
    return picks;
  });
}
