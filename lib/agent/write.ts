import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import type { PromoBrief, ResolvedAct, RoutedStop, WriterMode } from "@/lib/types";

export type BriefFacts = {
  act: ResolvedAct;
  city: string;
  venue: string;
  venueWhy: string;
  openers: Array<{ name: string; overlap: number; why: string }>;
  podcasts: string[];
  bars: string[];
  brands: string[];
  tags: string[];
  affinity: number;
};

function fallbackBrief(facts: BriefFacts): PromoBrief {
  const topOpener = facts.openers[0];
  const overlap = topOpener ? topOpener.overlap.toFixed(2) : "n/a";
  const audience =
    facts.tags.length > 0
      ? `Taste tags that travel with ${facts.act.name}: ${facts.tags.join(", ")}. City affinity ${facts.affinity.toFixed(2)}.`
      : `City affinity ${facts.affinity.toFixed(2)}. Qloo tags were thin for this stop.`;
  return {
    audience,
    podcasts: facts.podcasts.map((name) => ({
      name,
      why: `Local listen that indexes with this crowd.`,
    })),
    bars: facts.bars.map((name) => ({
      name,
      why: `Pre-show room within walking or a short ride of ${facts.venue}.`,
    })),
    brands: facts.brands.map((name) => ({
      name,
      why: `Brand adjacency from the same taste neighborhood.`,
    })),
    socialPost: `${facts.city}. ${facts.act.name} at ${facts.venue}. ${
      topOpener ? `With ${topOpener.name} (audience overlap ${overlap}). ` : ""
    }Routed for the crowd that already gathers here.`,
  };
}

function openRouterAvailable(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export function resolveWriter(): WriterMode {
  return openRouterAvailable() ? "openrouter" : "fallback";
}

export async function writeBrief(facts: BriefFacts): Promise<PromoBrief> {
  if (!openRouterAvailable()) {
    return fallbackBrief(facts);
  }

  const modelId = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
  const openrouter = createOpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
  });

  try {
    const { text } = await generateText({
      model: openrouter.chat(modelId),
      temperature: 0.4,
      prompt: `You write promo briefs for touring acts. Use ONLY the facts below. Do not invent venue, opener, podcast, bar, or brand names. If a list is empty, say the data was thin.
Describe group taste affinities for this act's crowd. Do not claim what any one person will do, like, or attend.

Return compact JSON with keys: audience (string), podcasts (array of {name, why}), bars (array of {name, why}), brands (array of {name, why}), socialPost (string, max 220 chars).

FACTS:
${JSON.stringify(facts, null, 2)}`,
    });
    const parsed = JSON.parse(extractJson(text)) as PromoBrief;
    if (!parsed.audience || !parsed.socialPost) {
      return fallbackBrief(facts);
    }
    return {
      audience: parsed.audience,
      podcasts: Array.isArray(parsed.podcasts) ? parsed.podcasts : fallbackBrief(facts).podcasts,
      bars: Array.isArray(parsed.bars) ? parsed.bars : fallbackBrief(facts).bars,
      brands: Array.isArray(parsed.brands) ? parsed.brands : fallbackBrief(facts).brands,
      socialPost: parsed.socialPost,
    };
  } catch {
    return fallbackBrief(facts);
  }
}

export async function writeSummary(act: ResolvedAct, stops: RoutedStop[]): Promise<string> {
  const cities = stops.map((stop) => stop.city.name).join(" → ");
  const fallback = `${act.name} plays ${stops.length} rooms the heatmap already lights: ${cities}. Venues and openers come from Qloo affinity for this crowd.`;
  if (!openRouterAvailable()) {
    return fallback;
  }
  const modelId = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
  const openrouter = createOpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
  });
  try {
    const { text } = await generateText({
      model: openrouter.chat(modelId),
      temperature: 0.3,
      prompt: `Write 2 sentences for a tour one-sheet. Name the act and the city sequence. Do not invent cities. Describe group taste in those cities, not what any one person will do. Act: ${act.name}. Cities: ${cities}.`,
    });
    return text.trim() || fallback;
  } catch {
    return fallback;
  }
}

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("no json");
  }
  return text.slice(start, end + 1);
}
