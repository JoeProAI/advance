import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

const KEY_NAME = "QLOO_API_KEY";

const ALLOW_KEY_NAME = [
  "lib/qloo/live.ts",
  "scripts/qloo-smoke.ts",
  "tests/qloo-key-leak.test.ts",
  "README.md",
  ".env.example",
  "docs/SUBMISSION.md",
];

const CLIENT_ROOTS = ["app", "components"];
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  ".data",
  "agent-tools",
  "coverage",
]);

function walkFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) {
    return acc;
  }
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) {
      continue;
    }
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkFiles(full, acc);
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

function rel(file: string): string {
  return relative(ROOT, file).replaceAll("\\", "/");
}

function isAllowlisted(file: string): boolean {
  return ALLOW_KEY_NAME.includes(rel(file));
}

function read(file: string): string {
  return readFileSync(file, "utf8");
}

function isClientModule(source: string): boolean {
  return /^["']use client["'];?/m.test(source);
}

function localImports(source: string): string[] {
  const hits: string[] = [];
  const re =
    /from\s+["'](@\/[^"']+|relative:[^"']+|\.\.?\/[^"']+)["']/g;
  let match: RegExpExecArray | null = re.exec(source);
  while (match) {
    const spec = match[1]!;
    if (spec.startsWith("@/")) {
      hits.push(spec.slice(2));
    } else if (spec.startsWith(".")) {
      hits.push(`rel:${spec}`);
    }
    match = re.exec(source);
  }
  return hits;
}

function resolveImport(fromFile: string, spec: string): string | null {
  const base = spec.startsWith("rel:")
    ? join(fromFile, "..", spec.slice(4))
    : join(ROOT, spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function clientReachableFiles(): string[] {
  const roots = CLIENT_ROOTS.flatMap((dir) => walkFiles(join(ROOT, dir)));
  const queue = roots.filter((file) => isClientModule(read(file)));
  const seen = new Set<string>();
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    const source = read(file);
    for (const spec of localImports(source)) {
      const resolved = resolveImport(file, spec);
      if (resolved) {
        queue.push(resolved);
      }
    }
  }
  return [...seen];
}

describe("QLOO_API_KEY never reaches the client", () => {
  it("is mentioned only in allowlisted server, script, test, and docs files", () => {
    const files = [
      ...walkFiles(join(ROOT, "app")),
      ...walkFiles(join(ROOT, "components")),
      ...walkFiles(join(ROOT, "lib")),
      ...walkFiles(join(ROOT, "scripts")),
      ...walkFiles(join(ROOT, "tests")),
    ];
    const leaks = files.filter((file) => read(file).includes(KEY_NAME) && !isAllowlisted(file));
    expect(leaks.map(rel)).toEqual([]);
  });

  it("is never imported into a client module graph", () => {
    const reachable = clientReachableFiles();
    const leaks = reachable.filter((file) => {
      const source = read(file);
      return source.includes(KEY_NAME) || rel(file) === "lib/qloo/live.ts";
    });
    expect(leaks.map(rel)).toEqual([]);
    expect(reachable.some((file) => rel(file) === "lib/qloo/live.ts")).toBe(false);
  });

  it("does not appear in the Next client bundle when .next/static exists", () => {
    const staticDir = join(ROOT, ".next/static");
    if (!existsSync(staticDir)) {
      return;
    }
    const bundles = walkFiles(staticDir);
    const nameHits = bundles.filter((file) => read(file).includes(KEY_NAME));
    expect(nameHits.map(rel), "QLOO_API_KEY string in client chunks").toEqual([]);

    const value = process.env.QLOO_API_KEY?.trim();
    if (value) {
      const valueHits = bundles.filter((file) => read(file).includes(value));
      expect(valueHits.map(rel), "QLOO_API_KEY value in client chunks").toEqual([]);
    }
  });
});
