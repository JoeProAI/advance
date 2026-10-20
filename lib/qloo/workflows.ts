/**
 * Official @qloo/qloo-harness workflows (qloo exec / qloo mcp).
 * Advance cites these and answers the same product questions over the
 * documented REST API on the Next.js server. It does not spawn the CLI.
 */
export const HARNESS_WORKFLOWS = [
  "find_tags",
  "describe",
  "recommend",
  "rank",
  "where_popular",
  "compare_audiences",
  "audience_demographics",
  "entity_tags",
  "trends",
] as const;

export type HarnessWorkflow = (typeof HARNESS_WORKFLOWS)[number];

export type WorkflowUse = {
  workflow: HarnessWorkflow;
  adopted: boolean;
  advanceStep: string;
  why: string;
};

export const HARNESS_WORKFLOW_USES: WorkflowUse[] = [
  {
    workflow: "describe",
    adopted: true,
    advanceStep: "Resolve the act",
    why: "GET /search then GET /entities turns a public act name into a Qloo entity id.",
  },
  {
    workflow: "where_popular",
    adopted: true,
    advanceStep: "Audience geography",
    why: "GET /v2/insights with filter.type=urn:entity:destination and output.heatmap.boundary=city names cities where that crowd already clusters.",
  },
  {
    workflow: "find_tags",
    adopted: true,
    advanceStep: "Venue tag lookup",
    why: "GET /v2/tags finds music-venue or comedy-club tag ids before place insights.",
  },
  {
    workflow: "recommend",
    adopted: true,
    advanceStep: "Rooms, openers, promo adjacencies",
    why: "Place, artist/person, podcast, bar, and brand insights use the act as signal.interests.entities.",
  },
  {
    workflow: "rank",
    adopted: true,
    advanceStep: "Pick rooms and order the run",
    why: "Shortlists are scored by affinity minus drive cost. Ranking stays in TypeScript so mock mode still works.",
  },
  {
    workflow: "compare_audiences",
    adopted: true,
    advanceStep: "Opener overlap",
    why: "GET /v2/insights/compare measures shared audience between the headliner and a local opener.",
  },
  {
    workflow: "entity_tags",
    adopted: true,
    advanceStep: "Taste analysis",
    why: "Tags on the resolved act from GET /entities supply group taste lines for each promo brief.",
  },
  {
    workflow: "trends",
    adopted: true,
    advanceStep: "Momentum",
    why: "GET /trends/entity is an optional week-over-week check after the act resolves.",
  },
  {
    workflow: "audience_demographics",
    adopted: false,
    advanceStep: "Not called",
    why: "Tour routing needs geography and affinity. Demographic inference is out of scope and easy to overclaim.",
  },
];

export function harnessLabel(workflow: HarnessWorkflow): string {
  return `qloo_${workflow}`;
}
