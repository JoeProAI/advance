import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const UI_DIRS = ["app", "components", "lib"];
const FORBIDDEN = [
  /not from a blank map/i,
  /working title/i,
  /judge path/i,
  /room with a live crowd/i,
];

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) {
    return acc;
  }
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "geo") {
        continue;
      }
      walk(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

describe("desk copy audit", () => {
  it("keeps placeholder and judge-facing lines out of the UI", () => {
    const files = UI_DIRS.flatMap((dir) => walk(join(ROOT, dir)));
    const hits: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN) {
        if (pattern.test(source)) {
          hits.push(`${relative(ROOT, file)} :: ${pattern}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
