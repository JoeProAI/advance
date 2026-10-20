import { entityTags } from "@/lib/qloo/parse";
import type { QlooEntity } from "@/lib/qloo/types";
import type { BudgetTier } from "@/lib/types";

export type RoomSize = "small" | "theater" | "club" | "unknown";

const THEATER_TAGS = ["Performing arts theater", "Concert hall", "Amphitheater", "Arena"];
const SMALL_TAGS = ["Intimate", "Cozy"];
const CLUB_TAGS = ["Night club"];

/**
 * Qloo place records carry no capacity. Size comes only from Qloo's own tags;
 * anything else is labeled "size unknown" instead of guessed.
 */
export function roomSize(entity: QlooEntity): { size: RoomSize; label: string } {
  const names = new Set(entityTags(entity).map((tag) => tag.name));
  const price = entity.properties?.price_level;
  const priceNote = typeof price === "number" ? ` Price level ${price} of 4.` : "";
  const hit = (list: string[]) => list.find((name) => names.has(name));
  const theater = hit(THEATER_TAGS);
  if (theater) {
    return { size: "theater", label: `Theater or hall (Qloo tag: ${theater}). No capacity on file.${priceNote}` };
  }
  const small = hit(SMALL_TAGS);
  if (small) {
    return { size: "small", label: `Small room (Qloo tag: ${small}). No capacity on file.${priceNote}` };
  }
  const club = hit(CLUB_TAGS);
  if (club) {
    return { size: "club", label: `Club floor (Qloo tag: ${club}). No capacity on file.${priceNote}` };
  }
  return { size: "unknown", label: `Size unknown. No capacity on file.${priceNote}` };
}

/**
 * Keep Qloo's affinity order, but let the budget tier pull the first room of
 * the wanted size forward. Venue popularity runs 0.85 to 1.0 live, so a
 * popularity cap cannot stand in for size.
 */
export function pickByTier(entities: QlooEntity[], tier: BudgetTier): QlooEntity | undefined {
  if (tier === "either") {
    return entities[0];
  }
  const want: RoomSize = tier === "rooms" ? "small" : "theater";
  return entities.find((entity) => roomSize(entity).size === want) ?? entities[0];
}
