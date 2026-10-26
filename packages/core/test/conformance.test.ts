/**
 * Runs the build vectors in /conformance/build: each folder's dictionary must build to exactly
 * the bytes in expected.json. Set RADD_UPDATE_VECTORS=1 to rewrite expected.json after an
 * intended change, then review the diff.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { build } from "../src/index.js";

const root = fileURLToPath(new URL("../../../conformance/build/", import.meta.url));
const update = process.env.RADD_UPDATE_VECTORS === "1";

const vectors = readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

describe("conformance: build vectors", () => {
  it("has vectors", () => {
    expect(vectors.length).toBeGreaterThan(0);
  });

  it.each(vectors)("%s", (name) => {
    const dir = join(root, name);
    const manifest = parse(readFileSync(join(dir, "vector.yaml"), "utf8")) as {
      dictionary?: string;
    };
    const result = build(resolve(dir, manifest.dictionary ?? "dictionary"));
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const expectedPath = join(dir, "expected.json");
    if (update || !existsSync(expectedPath)) writeFileSync(expectedPath, result.json as string);
    expect(result.json).toBe(readFileSync(expectedPath, "utf8").replaceAll("\r\n", "\n"));
  });
});
